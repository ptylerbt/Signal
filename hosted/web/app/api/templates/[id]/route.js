import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';

// Moves a letter to Trash (recoverable for 30 days).
export async function DELETE(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { rowCount } = await withActingClient(ctx, (client) =>
    client.query('update templates set deleted_at = now() where owner_id = $1 and id = $2 and deleted_at is null', [
      ctx.effectiveOwnerId,
      Number(params.id),
    ])
  );

  if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
