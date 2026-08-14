import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const groups = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query(
      `select g.id, g.name, g.created_at, count(gm.assignment_id) as member_count
       from groups g
       left join group_members gm on gm.group_id = g.id and gm.owner_id = g.owner_id
       where g.owner_id = $1
       group by g.id
       order by g.created_at desc`,
      [userId]
    );
    return rows;
  });

  return NextResponse.json(groups);
}

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const { name, assignmentIds } = await request.json();
  if (!name || !Array.isArray(assignmentIds) || assignmentIds.length === 0) {
    return NextResponse.json({ error: 'Name and at least one member are required' }, { status: 400 });
  }

  const groupId = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query(
      'insert into groups (owner_id, name) values ($1, $2) returning id',
      [userId, name]
    );
    const newGroupId = rows[0].id;

    for (const assignmentId of assignmentIds) {
      await client.query(
        'insert into group_members (owner_id, group_id, assignment_id) values ($1, $2, $3)',
        [userId, newGroupId, assignmentId]
      );
    }

    return newGroupId;
  });

  return NextResponse.json({ success: true, groupId }, { status: 201 });
}
