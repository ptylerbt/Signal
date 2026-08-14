import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { getActingContext } from '../../../lib/authContext.js';

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

  return NextResponse.json({
    isAdmin: ctx.isAdmin,
    isImpersonating: ctx.isImpersonating,
    viewAsUserId: ctx.viewAsUserId,
    viewAsName,
  });
}
