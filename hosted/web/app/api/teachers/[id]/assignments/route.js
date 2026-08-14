import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../lib/authContext.js';

export async function POST(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const teacherId = Number(params.id);
  const { school, level, subject, email, district } = await request.json();

  const assignment = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query(
      `insert into teacher_assignments (owner_id, teacher_id, school, level, subject, email, district)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [userId, teacherId, school || null, level || null, subject || null, email || null, district || null]
    );
    return rows[0];
  });

  return NextResponse.json(assignment, { status: 201 });
}
