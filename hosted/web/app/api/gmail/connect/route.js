import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getActingContext } from '../../../../lib/authContext.js';
import { buildConsentUrl, gmailConfigured, GMAIL_STATE_COOKIE } from '../../../../lib/gmail.js';

// Pages she can be sent back to after connecting. Anything else falls back
// to the guide page, so the "from" value can't redirect off-site.
const RETURN_PATHS = { compose: '/compose', settings: '/settings', connect: '/connect-gmail' };

// Starts "Add a Gmail account": sends the browser to Google's permission
// screen. Google sends it back to /api/gmail/callback.
//
// An admin in View As may connect an account for the member they are
// viewing (Tyler adding Jess's accounts over the phone). The account is
// saved to that member, and the callback refuses the admin's own Gmail.
export async function GET(request) {
  const url = new URL(request.url);
  const back = RETURN_PATHS[url.searchParams.get('from')] || '/connect-gmail';

  const ctx = await getActingContext();
  if (!ctx) return NextResponse.redirect(new URL('/sign-in', url.origin));
  if (!gmailConfigured()) return NextResponse.redirect(new URL(`${back}?gmail=notready`, url.origin));

  const nonce = crypto.randomBytes(24).toString('base64url');
  const res = NextResponse.redirect(buildConsentUrl({ origin: url.origin, state: nonce }));
  res.cookies.set(GMAIL_STATE_COOKIE, JSON.stringify({ nonce, back, ownerId: ctx.effectiveOwnerId }), {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: '/api/gmail',
    maxAge: 600,
  });
  return res;
}
