import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let viewAsName = null;
  if (ctx.isImpersonating) {
    try {
      const clerk = await clerkClient();
      const u = await clerk.users.getUser(ctx.viewAsUserId);
      viewAsName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.primaryEmailAddress?.emailAddress || ctx.viewAsUserId;
    } catch {
      viewAsName = ctx.viewAsUserId;
    }
  }

  // The signed-in person's own Advanced switch (an admin viewing-as a member
  // keeps their own tool visibility).
  const showAdvanced = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query('select show_advanced from profiles where user_id = $1', [ctx.realUserId]);
    return !!rows[0]?.show_advanced;
  });

  return NextResponse.json({
    showAdvanced,
    isAdmin: ctx.isAdmin,
    isImpersonating: ctx.isImpersonating,
    viewAsUserId: ctx.viewAsUserId,
    viewAsName,
  });
}
