import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../lib/authContext.js';

export async function GET(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const groupId = Number(params.id);

  const members = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query(
      `select ta.id as assignment_id, ta.school, ta.level, ta.subject, ta.email, ta.district,
              t.id as teacher_id, t.first_name, t.last_name, t.is_district_rep
       from group_members gm
       join teacher_assignments ta on ta.id = gm.assignment_id and ta.owner_id = gm.owner_id
       join teachers t on t.id = ta.teacher_id
       where gm.owner_id = $1 and gm.group_id = $2
       order by t.last_name, t.first_name`,
      [userId, groupId]
    );
    return rows;
  });

  return NextResponse.json(members);
}

export async function DELETE(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const groupId = Number(params.id);
  const { assignmentId } = await request.json();

  await withActingClient(ctx, (client) =>
    client.query(
      'delete from group_members where owner_id = $1 and group_id = $2 and assignment_id = $3',
      [userId, groupId, assignmentId]
    )
  );

  return NextResponse.json({ success: true });
}

export async function POST(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const groupId = Number(params.id);
  const { assignmentId } = await request.json();

  await withActingClient(ctx, (client) =>
    client.query(
      'insert into group_members (owner_id, group_id, assignment_id) values ($1, $2, $3) on conflict do nothing',
      [userId, groupId, assignmentId]
    )
  );

  return NextResponse.json({ success: true });
}
