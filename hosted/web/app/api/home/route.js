import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';
import { getCurrentWorkspace } from '../../../lib/workspaces.js';
import { listLists, recentSends, recentNotes } from '../../../lib/lists.js';

// Everything the Home screen needs in one request, scoped to the current workspace.
export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const data = await withActingClient(ctx, async (client) => {
    const workspace = await getCurrentWorkspace(client, ctx.effectiveOwnerId);
    const [lists, sends, notes] = await Promise.all([
      listLists(client, ctx.effectiveOwnerId, workspace.id),
      recentSends(client, ctx.effectiveOwnerId, workspace.id, 5),
      recentNotes(client, ctx.effectiveOwnerId, workspace.id, 5),
    ]);
    return { workspace, lists, recentSends: sends, notes };
  });

  return NextResponse.json(data);
}
