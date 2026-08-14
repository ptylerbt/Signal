import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../../lib/authContext.js';

export async function PATCH(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const assignmentId = Number(params.assignmentId);
  const { school, level, subject, email, district } = await request.json();

  await withActingClient(ctx, (client) =>
    client.query(
      `update teacher_assignments set school = $1, level = $2, subject = $3, email = $4, district = $5
       where owner_id = $6 and id = $7`,
      [school || null, level || null, subject || null, email || null, district || null, userId, assignmentId]
    )
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const assignmentId = Number(params.assignmentId);

  await withActingClient(ctx, (client) =>
    client.query('delete from teacher_assignments where owner_id = $1 and id = $2', [userId, assignmentId])
  );

  return NextResponse.json({ success: true });
}
