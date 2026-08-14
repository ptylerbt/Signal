import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../lib/authContext.js';

export async function POST(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const projectId = Number(params.id);
  const { teacherId } = await request.json();

  await withActingClient(ctx, (client) =>
    client.query(
      'insert into project_members (owner_id, project_id, teacher_id) values ($1, $2, $3) on conflict do nothing',
      [userId, projectId, teacherId]
    )
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const projectId = Number(params.id);
  const { teacherId } = await request.json();

  await withActingClient(ctx, async (client) => {
    await client.query('delete from notes where owner_id = $1 and project_id = $2 and teacher_id = $3', [userId, projectId, teacherId]);
    await client.query('delete from project_person_status where owner_id = $1 and project_id = $2 and teacher_id = $3', [userId, projectId, teacherId]);
    await client.query('delete from project_members where owner_id = $1 and project_id = $2 and teacher_id = $3', [userId, projectId, teacherId]);
  });

  return NextResponse.json({ success: true });
}
