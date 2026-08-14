import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../../lib/authContext.js';

export async function GET(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const projectId = Number(params.id);
  const teacherId = Number(params.teacherId);

  const data = await withActingClient(ctx, async (client) => {
    const { rows: notes } = await client.query(
      'select * from notes where owner_id = $1 and project_id = $2 and teacher_id = $3 order by created_at desc',
      [userId, projectId, teacherId]
    );

    const { rows: sends } = await client.query(
      `select sr.*, ta.school, tmpl.file_name as template_name
       from send_records sr
       join teacher_assignments ta on ta.id = sr.assignment_id and ta.owner_id = sr.owner_id
       left join templates tmpl on tmpl.id = sr.template_id and tmpl.owner_id = sr.owner_id
       where sr.owner_id = $1 and sr.project_id = $2 and ta.teacher_id = $3
       order by sr.generated_at desc`,
      [userId, projectId, teacherId]
    );

    const { rows: statusRows } = await client.query(
      'select status from project_person_status where owner_id = $1 and project_id = $2 and teacher_id = $3',
      [userId, projectId, teacherId]
    );

    return { notes, sends, status: statusRows[0]?.status || null };
  });

  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const projectId = Number(params.id);
  const teacherId = Number(params.teacherId);
  const { status } = await request.json();

  await withActingClient(ctx, (client) =>
    client.query(
      `insert into project_person_status (owner_id, project_id, teacher_id, status, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (project_id, teacher_id) do update set status = $4, updated_at = now()`,
      [userId, projectId, teacherId, status]
    )
  );

  return NextResponse.json({ success: true });
}
