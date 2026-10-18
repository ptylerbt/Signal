import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../../lib/authContext.js';
import { setMemberStatus, removeListMember } from '../../../../../../lib/lists.js';

// Mark a reply status ("Replied", "Said yes"...).
export async function PATCH(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { status } = await request.json();
  const ok = await withActingClient(ctx, (client) =>
    setMemberStatus(client, ctx.effectiveOwnerId, Number(params.id), Number(params.teacherId), status)
  );
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

// Take one person off the list. Returns the removed row so the page can Undo.
export async function DELETE(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const removed = await withActingClient(ctx, (client) =>
    removeListMember(client, ctx.effectiveOwnerId, Number(params.id), Number(params.teacherId))
  );
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, removed });
}
