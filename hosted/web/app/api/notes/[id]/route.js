import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';

// Moves the note to Trash (recoverable for 30 days), not a hard delete.
export async function DELETE(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  await withActingClient(ctx, (client) =>
    client.query('update notes set deleted_at = now() where owner_id = $1 and id = $2 and deleted_at is null', [
      ctx.effectiveOwnerId,
      Number(params.id),
    ])
  );

  return NextResponse.json({ success: true });
}
