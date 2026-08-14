import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { findDuplicateTeacherGroups } from '../../../../lib/duplicates.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const groups = await withActingClient(ctx, (client) => findDuplicateTeacherGroups(client, userId));

  return NextResponse.json(groups);
}
