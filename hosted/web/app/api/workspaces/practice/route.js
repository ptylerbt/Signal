import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { openPractice } from '../../../../lib/practice.js';

// Switch into the Practice workspace (creating it the first time).
// { reset: true } wipes it and starts over with fresh pretend data.
export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { reset } = await request.json().catch(() => ({}));
  const workspace = await withActingClient(ctx, (client) => openPractice(client, ctx.effectiveOwnerId, { reset: !!reset }));

  return NextResponse.json({ success: true, workspace });
}
