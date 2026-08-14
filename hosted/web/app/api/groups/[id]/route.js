import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';

export async function PATCH(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const groupId = Number(params.id);
  const { name } = await request.json();
  if (!name || !name.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  await withActingClient(ctx, (client) =>
    client.query('update groups set name = $1 where owner_id = $2 and id = $3', [name.trim(), userId, groupId])
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const groupId = Number(params.id);

  await withActingClient(ctx, async (client) => {
    await client.query('delete from group_members where owner_id = $1 and group_id = $2', [userId, groupId]);
    await client.query('delete from groups where owner_id = $1 and id = $2', [userId, groupId]);
  });

  return NextResponse.json({ success: true });
}
