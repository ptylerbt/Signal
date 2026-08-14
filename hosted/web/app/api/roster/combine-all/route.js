import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { dedupeAllAssignments } from '../../../../lib/rosterImport.js';

export async function POST() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const { removed, undo } = await withActingClient(ctx, (client) => dedupeAllAssignments(client, userId));

  return NextResponse.json({ removed, undo });
}
