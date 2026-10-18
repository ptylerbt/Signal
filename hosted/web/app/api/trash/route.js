import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';
import { getCurrentWorkspace } from '../../../lib/workspaces.js';
import { listTrash, purgeExpired, restoreFromTrash } from '../../../lib/trash.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const data = await withActingClient(ctx, async (client) => {
    await purgeExpired(client, ctx.effectiveOwnerId);
    return listTrash(client, ctx.effectiveOwnerId);
  });

  return NextResponse.json(data);
}

// { type: 'workspace' | 'list' | 'person' | 'note' | 'letter', id } → put back.
export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { type, id } = await request.json();
  const ok = await withActingClient(ctx, async (client) => {
    const workspace = await getCurrentWorkspace(client, ctx.effectiveOwnerId);
    return restoreFromTrash(client, ctx.effectiveOwnerId, type, Number(id), workspace.id);
  });

  if (!ok) return NextResponse.json({ error: 'That item is no longer in Trash.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
