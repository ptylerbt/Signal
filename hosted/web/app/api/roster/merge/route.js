import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { mergeTeachers } from '../../../../lib/duplicates.js';

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const { keepId, mergeIds } = await request.json();
  if (!keepId || !Array.isArray(mergeIds) || mergeIds.length === 0) {
    return NextResponse.json({ error: 'keepId and at least one mergeId are required' }, { status: 400 });
  }

  const result = await withActingClient(ctx, (client) => mergeTeachers(client, userId, keepId, mergeIds));

  return NextResponse.json(result);
}
