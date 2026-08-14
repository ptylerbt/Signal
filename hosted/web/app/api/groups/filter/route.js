import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { filterAssignments } from '../../../../lib/groups.js';

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const filters = await request.json();
  const results = await withActingClient(ctx, (client) => filterAssignments(client, userId, filters));

  return NextResponse.json(results);
}
