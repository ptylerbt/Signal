import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { listGmailAccounts, gmailConfigured } from '../../../../lib/gmail.js';
import { getCurrentWorkspace } from '../../../../lib/workspaces.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // Also: which account to suggest in Write Email (the one last used in
  // this workspace), and whether this is the Practice workspace.
  const { accounts, suggestedId, practice } = await withActingClient(ctx, async (client) => {
    const list = await listGmailAccounts(client, ctx.effectiveOwnerId);
    const workspace = await getCurrentWorkspace(client, ctx.effectiveOwnerId);
    const { rows } = await client.query('select last_gmail_account_id from workspaces where id = $1', [workspace.id]);
    const last = rows[0]?.last_gmail_account_id;
    return {
      accounts: list,
      suggestedId: list.some((a) => Number(a.id) === Number(last)) ? Number(last) : list[0] ? Number(list[0].id) : null,
      practice: !!workspace.is_practice,
    };
  });

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

  return NextResponse.json({ accounts, suggestedId, practice, ready: gmailConfigured(), viewingAs });
}
