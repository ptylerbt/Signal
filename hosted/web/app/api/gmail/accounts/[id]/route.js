import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../lib/authContext.js';
import { removeGmailAccount } from '../../../../../lib/gmail.js';

export async function DELETE(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;
  const removed = await withActingClient(ctx, (client) => removeGmailAccount(client, ctx.effectiveOwnerId, id));
  if (!removed) return NextResponse.json({ error: 'That account was already removed.' }, { status: 404 });
  return NextResponse.json({ success: true, email: removed.email });
}
