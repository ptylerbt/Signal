import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';
import { getCurrentWorkspace } from '../../../lib/workspaces.js';
import { listLists, createList } from '../../../lib/lists.js';

// Lists in the CURRENT workspace only — switching workspace changes what shows.
export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const lists = await withActingClient(ctx, async (client) => {
    const ws = await getCurrentWorkspace(client, ctx.effectiveOwnerId);
    return listLists(client, ctx.effectiveOwnerId, ws.id);
  });

  return NextResponse.json(lists);
}

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { name, description } = await request.json();
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: 'Please give the list a name.' }, { status: 400 });
  }

  const list = await withActingClient(ctx, async (client) => {
    const ws = await getCurrentWorkspace(client, ctx.effectiveOwnerId);
    return createList(client, ctx.effectiveOwnerId, ws.id, { name, description });
  });

  return NextResponse.json({ success: true, list }, { status: 201 });
}
