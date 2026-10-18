import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';
import { getCurrentWorkspace } from '../../../lib/workspaces.js';
import { linkPersonToWorkspace } from '../../../lib/people.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const teachers = await withActingClient(ctx, async (client) => {
    const { rows: teacherRows } = await client.query(
      'select * from public.teachers where owner_id = $1 order by last_name, first_name',
      [userId]
    );
    const { rows: assignmentRows } = await client.query(
      'select * from public.teacher_assignments where owner_id = $1 order by id',
      [userId]
    );

    const assignmentsByTeacher = new Map();
    for (const a of assignmentRows) {
      if (!assignmentsByTeacher.has(a.teacher_id)) assignmentsByTeacher.set(a.teacher_id, []);
      assignmentsByTeacher.get(a.teacher_id).push(a);
    }

    return teacherRows.map((t) => ({
      ...t,
      assignments: assignmentsByTeacher.get(t.id) || [],
    }));
  });

  return NextResponse.json(teachers);
}

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const body = await request.json();
  const { firstName, lastName } = body;

  const teacher = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query(
      `insert into public.teachers (owner_id, first_name, last_name)
       values ($1, $2, $3)
       returning *`,
      [userId, firstName || null, lastName || null]
    );
    const workspace = await getCurrentWorkspace(client, userId);
    await linkPersonToWorkspace(client, userId, workspace.id, rows[0].id);
    return rows[0];
  });

  return NextResponse.json(teacher, { status: 201 });
}
