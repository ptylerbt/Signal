import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';
import { listWorkspaces, getCurrentWorkspace, createWorkspace, setCurrentWorkspace } from '../../../lib/workspaces.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const data = await withActingClient(ctx, async (client) => {
    const current = await getCurrentWorkspace(client, ctx.effectiveOwnerId);
    const workspaces = await listWorkspaces(client, ctx.effectiveOwnerId);
    return { current, workspaces };
  });

  return NextResponse.json(data);
}

// Creating a workspace also switches into it — the natural next step is
// to start filling it, not to go find it in the menu.
export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { name, emoji, color } = await request.json();
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: 'Please give the workspace a name.' }, { status: 400 });
  }

  const workspace = await withActingClient(ctx, async (client) => {
    const created = await createWorkspace(client, ctx.effectiveOwnerId, { name, emoji, color });
    await setCurrentWorkspace(client, ctx.effectiveOwnerId, created.id);
    return created;
  });

  return NextResponse.json({ success: true, workspace }, { status: 201 });
}
