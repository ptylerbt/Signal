import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { snapshotTeachers } from '../../../../lib/undo.js';

export async function GET(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const teacherId = Number(params.id);

  const data = await withActingClient(ctx, async (client) => {
    const { rows: teacherRows } = await client.query(
      'select * from teachers where owner_id = $1 and id = $2',
      [userId, teacherId]
    );
    const teacher = teacherRows[0] || null;
    if (!teacher) return { teacher: null };

    const { rows: assignments } = await client.query(
      'select * from teacher_assignments where owner_id = $1 and teacher_id = $2 order by id',
      [userId, teacherId]
    );

    const { rows: notes } = await client.query(
      `select n.*, p.name as project_name
       from notes n
       left join projects p on p.id = n.project_id and p.owner_id = n.owner_id
       where n.owner_id = $1 and n.teacher_id = $2
       order by n.created_at desc`,
      [userId, teacherId]
    );

    const { rows: sends } = await client.query(
      `select sr.*, ta.school, tmpl.file_name as template_name
       from send_records sr
       join teacher_assignments ta on ta.id = sr.assignment_id and ta.owner_id = sr.owner_id
       left join templates tmpl on tmpl.id = sr.template_id and tmpl.owner_id = sr.owner_id
       where sr.owner_id = $1 and ta.teacher_id = $2
       order by sr.generated_at desc`,
      [userId, teacherId]
    );

    const { rows: projects } = await client.query(
      `select p.id, p.name, p.status, pps.status as person_status
       from project_members pm
       join projects p on p.id = pm.project_id and p.owner_id = pm.owner_id
       left join project_person_status pps on pps.owner_id = pm.owner_id and pps.project_id = pm.project_id and pps.teacher_id = pm.teacher_id
       where pm.owner_id = $1 and pm.teacher_id = $2
       order by p.created_at desc`,
      [userId, teacherId]
    );

    return { teacher, assignments, notes, sends, projects };
  });

  if (!data.teacher) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const teacherId = Number(params.id);
  const { firstName, lastName, isDistrictRep } = await request.json();

  await withActingClient(ctx, (client) =>
    client.query(
      'update teachers set first_name = $1, last_name = $2, is_district_rep = $3 where owner_id = $4 and id = $5',
      [firstName || null, lastName || null, !!isDistrictRep, userId, teacherId]
    )
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const teacherId = Number(params.id);

  const undo = await withActingClient(ctx, async (client) => {
    const snapshot = await snapshotTeachers(client, userId, [teacherId]);
    const teacher = snapshot.teachers[0];
    const name = teacher ? `${teacher.first_name ?? ''} ${teacher.last_name ?? ''}`.trim() : 'teacher';

    await client.query('delete from teachers where owner_id = $1 and id = $2', [userId, teacherId]);

    return { label: `Deleted ${name || 'teacher'}`, teacherIds: [teacherId], snapshot };
  });

  return NextResponse.json({ success: true, undo });
}
