import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../lib/authContext.js';
import { addListMembers, restoreListMember } from '../../../../../lib/lists.js';

// { teacherIds: [...] } adds people (who must already be in the list's
// workspace). { restore: row } puts back a just-removed member (Undo).
export async function POST(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();

  if (body.restore) {
    await withActingClient(ctx, (client) =>
      restoreListMember(client, ctx.effectiveOwnerId, { ...body.restore, list_id: Number(params.id) })
    );
    return NextResponse.json({ success: true });
  }

  const ids = Array.isArray(body.teacherIds) ? body.teacherIds.map(Number).filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Pick at least one person.' }, { status: 400 });

  const added = await withActingClient(ctx, (client) => addListMembers(client, ctx.effectiveOwnerId, Number(params.id), ids));
  return NextResponse.json({ success: true, added });
}
