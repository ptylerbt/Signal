import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { restoreTeachersSnapshot } from '../../../../lib/undo.js';

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const { snapshot } = await request.json();
  if (!snapshot) return NextResponse.json({ error: 'Missing snapshot' }, { status: 400 });

  // Every write inside restoreTeachersSnapshot is scoped to `userId` (the
  // server's own resolved owner id), never to whatever the snapshot payload
  // itself claims — so a tampered snapshot can only affect the caller's own
  // account, the same as any other write endpoint.
  await withActingClient(ctx, (client) => restoreTeachersSnapshot(client, userId, snapshot));

  return NextResponse.json({ success: true });
}
