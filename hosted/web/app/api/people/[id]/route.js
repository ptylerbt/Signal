import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { getCurrentWorkspace } from '../../../../lib/workspaces.js';
import { getPerson, removePersonFromWorkspace } from '../../../../lib/people.js';

export async function GET(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const data = await withActingClient(ctx, async (client) => {
    const workspace = await getCurrentWorkspace(client, ctx.effectiveOwnerId);
    const person = await getPerson(client, ctx.effectiveOwnerId, Number(params.id));
    return person ? { ...person, currentWorkspace: workspace } : null;
  });

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

// Rename.
export async function PATCH(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { firstName, lastName } = await request.json();
  if (!String(firstName || '').trim() && !String(lastName || '').trim()) {
    return NextResponse.json({ error: 'Please type their name.' }, { status: 400 });
  }

  await withActingClient(ctx, (client) =>
    client.query('update teachers set first_name = $1, last_name = $2 where owner_id = $3 and id = $4', [
      String(firstName || '').trim() || null,
      String(lastName || '').trim() || null,
      ctx.effectiveOwnerId,
      Number(params.id),
    ])
  );

  return NextResponse.json({ success: true });
}

// "Remove" = take them out of the current workspace (and its lists). If
// they're in no other workspace they go to Trash. Undo via /api/roster/undo.
export async function DELETE(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const result = await withActingClient(ctx, async (client) => {
    const workspace = await getCurrentWorkspace(client, ctx.effectiveOwnerId);
    return removePersonFromWorkspace(client, ctx.effectiveOwnerId, workspace.id, Number(params.id));
  });

  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, ...result });
}
