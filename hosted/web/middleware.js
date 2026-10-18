import { clerkMiddleware, createRouteMatcher, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Sign-in/sign-up pages must stay public, everything else requires a signed-in user.
// /privacy is public because Google's sign-in consent screen links to it.
const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/not-authorized', '/privacy']);

// Free-tier substitute for Clerk's (paid) sign-up allowlist: anyone can
// technically create an account, but only these emails are let past
// middleware into the app itself.
const ALLOWED_EMAILS = (process.env.ALLOWED_USER_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  if (ALLOWED_EMAILS.length > 0) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email = user.primaryEmailAddress?.emailAddress?.toLowerCase();

    if (!email || !ALLOWED_EMAILS.includes(email)) {
      return NextResponse.redirect(new URL('/not-authorized', req.url));
    }
  }
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
