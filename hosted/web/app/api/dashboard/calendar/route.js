import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { getCurrentWorkspace } from '../../../../lib/workspaces.js';

// Calendar data for the CURRENT workspace: emails opened (sends) and reply
// statuses marked on its lists.
export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const data = await withActingClient(ctx, async (client) => {
    const workspace = await getCurrentWorkspace(client, userId);

    const { rows: sends } = await client.query(
      `select sr.id, sr.generated_at, sr.opened_at, sr.status, sr.recipient_field,
              t.id as teacher_id, t.first_name, t.last_name,
              ta.school, ta.subject, ta.level, ta.district, ta.email,
              tmpl.file_name as template_name,
              sr.list_id, l.name as list_name
       from send_records sr
       join teacher_assignments ta on ta.id = sr.assignment_id and ta.owner_id = sr.owner_id
       join teachers t on t.id = ta.teacher_id and t.owner_id = ta.owner_id
       left join templates tmpl on tmpl.id = sr.template_id and tmpl.owner_id = sr.owner_id
       left join lists l on l.id = sr.list_id and l.owner_id = sr.owner_id and l.deleted_at is null
       where sr.owner_id = $1 and sr.workspace_id = $2
       order by sr.generated_at desc
       limit 500`,
      [userId, workspace.id]
    );

    const { rows: statusChanges } = await client.query(
      `select m.status_updated_at as updated_at, m.status,
              t.id as teacher_id, t.first_name, t.last_name,
              m.list_id, l.name as list_name
       from list_members m
       join teachers t on t.id = m.teacher_id and t.owner_id = m.owner_id
       join lists l on l.id = m.list_id and l.owner_id = m.owner_id and l.deleted_at is null
       where m.owner_id = $1 and l.workspace_id = $2
         and m.status is not null and m.status != 'Emailed' and m.status_updated_at is not null
       order by m.status_updated_at desc
       limit 500`,
      [userId, workspace.id]
    );

    return { sends, statusChanges };
  });

  return NextResponse.json(data);
}
