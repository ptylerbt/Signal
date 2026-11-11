import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { listGmailAccounts, gmailConfigured } from '../../../../lib/gmail.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const accounts = await withActingClient(ctx, (client) => listGmailAccounts(client, ctx.effectiveOwnerId));

  // In View As, the page names whose Signal the accounts are added to, and
  // offers to email that person the setup link.
  let viewingAs = null;
  if (ctx.isImpersonating) {
    try {
      const clerk = await clerkClient();
      const u = await clerk.users.getUser(ctx.viewAsUserId);
      viewingAs = {
        name: u.firstName || u.primaryEmailAddress?.emailAddress || 'this person',
        email: u.primaryEmailAddress?.emailAddress || '',
      };
    } catch {
      viewingAs = { name: 'this person', email: '' };
    }
  }

  return NextResponse.json({ accounts, ready: gmailConfigured(), viewingAs });
}
