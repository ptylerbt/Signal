import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { setCurrentWorkspace } from '../../../../lib/workspaces.js';

export async function PUT(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { workspaceId } = await request.json();
  const ok = await withActingClient(ctx, (client) =>
    setCurrentWorkspace(client, ctx.effectiveOwnerId, Number(workspaceId))
  );
  if (!ok) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
