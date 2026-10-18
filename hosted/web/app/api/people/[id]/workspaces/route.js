import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../lib/authContext.js';
import { linkPersonToWorkspace } from '../../../../../lib/people.js';

// Add this person to another workspace too (same person, not a copy).
export async function POST(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { workspaceId } = await request.json();
  await withActingClient(ctx, (client) =>
    linkPersonToWorkspace(client, ctx.effectiveOwnerId, Number(workspaceId), Number(params.id))
  );

  return NextResponse.json({ success: true });
}
