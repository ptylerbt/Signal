import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const data = await withActingClient(ctx, async (client) => {
    const { rows: sends } = await client.query(
      `select sr.id, sr.generated_at, sr.opened_at, sr.status, sr.recipient_field,
              t.id as teacher_id, t.first_name, t.last_name,
              ta.school, ta.subject, ta.level, ta.district, ta.email,
              tmpl.file_name as template_name,
              sr.project_id, p.name as project_name,
              g.name as group_name
       from send_records sr
       join teacher_assignments ta on ta.id = sr.assignment_id and ta.owner_id = sr.owner_id
       join teachers t on t.id = ta.teacher_id and t.owner_id = ta.owner_id
       left join templates tmpl on tmpl.id = sr.template_id and tmpl.owner_id = sr.owner_id
       left join projects p on p.id = sr.project_id and p.owner_id = sr.owner_id
       left join groups g on g.id = sr.group_id and g.owner_id = sr.owner_id
       where sr.owner_id = $1
       order by sr.generated_at desc
       limit 500`,
      [userId]
    );

    const { rows: statusChanges } = await client.query(
      `select pps.updated_at, pps.status,
              t.id as teacher_id, t.first_name, t.last_name,
              pps.project_id, p.name as project_name
       from project_person_status pps
       join teachers t on t.id = pps.teacher_id and t.owner_id = pps.owner_id
       join projects p on p.id = pps.project_id and p.owner_id = pps.owner_id
       where pps.owner_id = $1
       order by pps.updated_at desc
       limit 500`,
      [userId]
    );

    return { sends, statusChanges };
  });

  return NextResponse.json(data);
}
