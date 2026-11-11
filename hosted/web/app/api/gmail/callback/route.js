import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { exchangeCode, saveGmailAccount, GMAIL_STATE_COOKIE } from '../../../../lib/gmail.js';

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
  const back = saved.back === '/compose' ? '/compose' : '/settings';

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
  if (ctx.isImpersonating) return finish('viewing');

  // She pressed Cancel on Google's screen.
  if (url.searchParams.get('error')) return finish('cancelled');

  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!code || !state || !saved.nonce || state !== saved.nonce) return finish('failed');

  try {
    const { email, refreshToken, hasSendScope } = await exchangeCode({ code, origin: url.origin });
    // Google lets people untick the "send email" box. Without it the
    // account is useless to Signal, so don't save it.
    if (!hasSendScope) return finish('nopermission');
    if (!email || !refreshToken) return finish('failed');

    await withActingClient(ctx, (client) => saveGmailAccount(client, ctx.realUserId, { email, refreshToken }));
    return finish('connected', email);
  } catch (err) {
    console.error('Gmail connect failed:', err.message);
    return finish('failed');
  }
}
