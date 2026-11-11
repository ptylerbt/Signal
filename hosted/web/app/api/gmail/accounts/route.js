import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { listGmailAccounts, gmailConfigured } from '../../../../lib/gmail.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const accounts = await withActingClient(ctx, (client) => listGmailAccounts(client, ctx.effectiveOwnerId));
  return NextResponse.json({ accounts, ready: gmailConfigured(), viewingAs: ctx.isImpersonating });
}
