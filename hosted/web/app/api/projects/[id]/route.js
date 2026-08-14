import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';

export async function GET(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const projectId = Number(params.id);

  const data = await withActingClient(ctx, async (client) => {
    const { rows: projectRows } = await client.query(
      'select * from projects where owner_id = $1 and id = $2',
      [userId, projectId]
    );
    const project = projectRows[0] || null;

    const { rows: members } = await client.query(
      `select t.id as teacher_id, t.first_name, t.last_name,
              pps.status,
              (select note_text from notes n
                where n.owner_id = $1 and n.project_id = $2 and n.teacher_id = t.id
                order by n.created_at desc limit 1) as latest_note,
              (select count(*) from send_records sr
                join teacher_assignments ta on ta.id = sr.assignment_id and ta.owner_id = sr.owner_id
                where sr.owner_id = $1 and sr.project_id = $2 and ta.teacher_id = t.id) as send_count
       from project_members pm
       join teachers t on t.id = pm.teacher_id and t.owner_id = pm.owner_id
       left join project_person_status pps on pps.owner_id = pm.owner_id and pps.project_id = pm.project_id and pps.teacher_id = pm.teacher_id
       where pm.owner_id = $1 and pm.project_id = $2
       order by t.last_name, t.first_name`,
      [userId, projectId]
    );

    const { rows: sends } = await client.query(
      `select sr.*, t.first_name, t.last_name, ta.school, tmpl.file_name as template_name
       from send_records sr
       join teacher_assignments ta on ta.id = sr.assignment_id and ta.owner_id = sr.owner_id
       join teachers t on t.id = ta.teacher_id and t.owner_id = ta.owner_id
       left join templates tmpl on tmpl.id = sr.template_id and tmpl.owner_id = sr.owner_id
       where sr.owner_id = $1 and sr.project_id = $2
       order by sr.generated_at desc`,
      [userId, projectId]
    );

    return { project, members, sends };
  });

  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const projectId = Number(params.id);
  const body = await request.json();

  await withActingClient(ctx, async (client) => {
    if (body.status) {
      await client.query('update projects set status = $1 where owner_id = $2 and id = $3', [body.status, userId, projectId]);
    }
    if (body.name !== undefined) {
      await client.query(
        'update projects set name = $1, description = $2 where owner_id = $3 and id = $4',
        [body.name.trim(), body.description || null, userId, projectId]
      );
    }
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const projectId = Number(params.id);

  await withActingClient(ctx, async (client) => {
    await client.query('update send_records set project_id = null where owner_id = $1 and project_id = $2', [userId, projectId]);
    await client.query('update notes set project_id = null where owner_id = $1 and project_id = $2', [userId, projectId]);
    await client.query('delete from project_person_status where owner_id = $1 and project_id = $2', [userId, projectId]);
    await client.query('delete from project_members where owner_id = $1 and project_id = $2', [userId, projectId]);
    await client.query('delete from projects where owner_id = $1 and id = $2', [userId, projectId]);
  });

  return NextResponse.json({ success: true });
}
