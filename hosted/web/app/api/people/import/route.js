import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { getCurrentWorkspace } from '../../../../lib/workspaces.js';
import { importRows } from '../../../../lib/rosterImport.js';

// Same import as the old Roster page, but everyone lands in the current
// workspace. Returns an undo snapshot for the Undo button.
export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { rows } = await request.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No one was selected to import.' }, { status: 400 });
  }

  const { count, undo } = await withActingClient(ctx, async (client) => {
    const workspace = await getCurrentWorkspace(client, ctx.effectiveOwnerId);
    return importRows(client, ctx.effectiveOwnerId, rows, { workspaceId: workspace.id });
  });

  return NextResponse.json({ success: true, count, undo });
}
