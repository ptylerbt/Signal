import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clerkClient } from '@clerk/nextjs/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { exchangeCode, saveGmailAccount, revokeToken, GMAIL_STATE_COOKIE } from '../../../../lib/gmail.js';

const BACK_PATHS = ['/compose', '/settings', '/connect-gmail'];

// The signed-in person's own email addresses, so an admin adding accounts
// for someone else can't attach their own Gmail by mistake.
async function ownEmails(userId) {
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    return user.emailAddresses.map((e) => e.emailAddress.toLowerCase());
  } catch {
    return [];
  }
}

// Google sends the browser here after the permission screen. Every outcome
// ends in a redirect back into Signal with a short ?gmail= result, which
// the page turns into a plain-language message.
export async function GET(request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();

  let saved = {};
  try {
    saved = JSON.parse(cookieStore.get(GMAIL_STATE_COOKIE)?.value || '{}');
  } catch {
    // Treated as a missing cookie below.
  }
  const back = BACK_PATHS.includes(saved.back) ? saved.back : '/connect-gmail';

  function finish(result, email) {
    const target = new URL(back, url.origin);
    target.searchParams.set('gmail', result);
    if (email) target.searchParams.set('account', email);
    const res = NextResponse.redirect(target);
    res.cookies.set(GMAIL_STATE_COOKIE, '', { path: '/api/gmail', maxAge: 0 });
    return res;
  }

  const ctx = await getActingContext();
  if (!ctx) return NextResponse.redirect(new URL('/sign-in', url.origin));

  // She pressed Cancel on Google's screen.
  if (url.searchParams.get('error')) return finish('cancelled');

  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!code || !state || !saved.nonce || state !== saved.nonce) return finish('failed');

  // The admin stopped (or switched) View As while on Google's screen. Don't
  // guess whose account this belongs to.
  if (saved.ownerId !== ctx.effectiveOwnerId) return finish('failed');

  try {
    const { email, refreshToken, hasSendScope } = await exchangeCode({ code, origin: url.origin });
    // Google lets people untick the "send email" box. Without it the
    // account is useless to Signal, so don't save it.
    if (!hasSendScope) {
      if (refreshToken) await revokeToken(refreshToken);
      return finish('nopermission');
    }
    if (!email || !refreshToken) return finish('failed');

    if (ctx.isImpersonating && (await ownEmails(ctx.realUserId)).includes(email)) {
      await revokeToken(refreshToken);
      return finish('ownaccount', email);
    }

    await withActingClient(ctx, (client) => saveGmailAccount(client, ctx.effectiveOwnerId, { email, refreshToken }));
    return finish('connected', email);
  } catch (err) {
    console.error('Gmail connect failed:', err.message);
    return finish('failed');
  }
}
