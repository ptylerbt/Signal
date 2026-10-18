import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { updateWorkspace, trashWorkspace, listWorkspaces } from '../../../../lib/workspaces.js';

export async function PATCH(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();
  if (body.name !== undefined && !String(body.name).trim()) {
    return NextResponse.json({ error: 'Please give the workspace a name.' }, { status: 400 });
  }

  const workspace = await withActingClient(ctx, (client) =>
    updateWorkspace(client, ctx.effectiveOwnerId, Number(params.id), {
      name: body.name,
      emoji: body.emoji,
      color: body.color,
    })
  );
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

  return NextResponse.json({ success: true, workspace });
}

// Moves the workspace to Trash (recoverable for 30 days). The last
// remaining workspace can't be removed — the app always needs one to be in.
export async function DELETE(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const result = await withActingClient(ctx, async (client) => {
    const all = await listWorkspaces(client, ctx.effectiveOwnerId);
    if (all.filter((w) => !w.is_practice).length <= 1 && all.some((w) => w.id === Number(params.id) && !w.is_practice)) {
      return { error: 'You need at least one workspace, so this one can\'t be removed.' };
    }
    const ok = await trashWorkspace(client, ctx.effectiveOwnerId, Number(params.id));
    return ok ? { success: true } : { error: 'Workspace not found' };
  });

  if (result.error) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
