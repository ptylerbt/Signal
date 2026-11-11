import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getActingContext } from '../../../../lib/authContext.js';
import { buildConsentUrl, gmailConfigured, GMAIL_STATE_COOKIE } from '../../../../lib/gmail.js';

// Pages she can be sent back to after connecting. Anything else falls back
// to Settings, so the "from" value can't be used to redirect off-site.
const RETURN_PATHS = { compose: '/compose', settings: '/settings' };

// Starts "Add a Gmail account": sends the browser to Google's permission
// screen. Google sends it back to /api/gmail/callback.
export async function GET(request) {
  const url = new URL(request.url);
  const back = RETURN_PATHS[url.searchParams.get('from')] || '/settings';

  const ctx = await getActingContext();
  if (!ctx) return NextResponse.redirect(new URL('/sign-in', url.origin));

  // An admin viewing someone else's data would attach the admin's own Gmail
  // to that person's account. Never allow that.
  if (ctx.isImpersonating) return NextResponse.redirect(new URL(`${back}?gmail=viewing`, url.origin));
  if (!gmailConfigured()) return NextResponse.redirect(new URL(`${back}?gmail=notready`, url.origin));

  const nonce = crypto.randomBytes(24).toString('base64url');
  const res = NextResponse.redirect(buildConsentUrl({ origin: url.origin, state: nonce }));
  res.cookies.set(GMAIL_STATE_COOKIE, JSON.stringify({ nonce, back }), {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: '/api/gmail',
    maxAge: 600,
  });
  return res;
}
