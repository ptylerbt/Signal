import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';

export async function DELETE(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const noteId = Number(params.id);

  await withActingClient(ctx, (client) =>
    client.query('delete from notes where owner_id = $1 and id = $2', [userId, noteId])
  );

  return NextResponse.json({ success: true });
}
