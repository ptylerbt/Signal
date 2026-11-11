import crypto from 'crypto';

// Signal sends email through Gmail accounts the user connects. Google gives
// us a "refresh token" per account; it is encrypted here before it is
// stored, and only ever decrypted on the server at the moment of sending.

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const GMAIL_STATE_COOKIE = 'signal_gmail_state';
const SCOPES = ['openid', 'email', GMAIL_SEND_SCOPE];

export function gmailConfigured() {
  return !!(process.env.GOOGLE_GMAIL_CLIENT_ID && process.env.GOOGLE_GMAIL_CLIENT_SECRET && process.env.GMAIL_TOKEN_KEY);
}

function tokenKey() {
  const key = Buffer.from(process.env.GMAIL_TOKEN_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('GMAIL_TOKEN_KEY must be 32 bytes, base64-encoded');
  return key;
}

export function encryptToken(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decryptToken(stored) {
  const [iv, tag, data] = String(stored).split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// The address Google sends the user back to. Must match one of the
// redirect addresses registered on the Google OAuth client exactly.
export function redirectUri(origin) {
  return `${origin}/api/gmail/callback`;
}

export function buildConsentUrl({ origin, state }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_GMAIL_CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: SCOPES.join(' '),
    // offline + consent = Google always hands back a refresh token.
    // select_account = she picks which Gmail account, every time.
    access_type: 'offline',
    prompt: 'consent select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Trades the one-time code from Google for tokens. Returns
// { email, refreshToken, hasSendScope }.
export async function exchangeCode({ code, origin }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_GMAIL_CLIENT_ID,
      client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google token exchange failed: ${data.error || res.status}`);

  // The id_token came straight from Google over HTTPS in this same
  // response, so its payload can be read without re-checking the signature.
  const middle = String(data.id_token || '').split('.')[1] || '';
  const payload = middle ? JSON.parse(Buffer.from(middle, 'base64url').toString('utf8')) : {};

  return {
    email: String(payload.email || '').toLowerCase(),
    refreshToken: data.refresh_token || null,
    hasSendScope: String(data.scope || '').split(' ').includes(GMAIL_SEND_SCOPE),
  };
}

// Tells Google to forget the permission, so removing an account in Signal
// really disconnects it. Best effort: a failure here must not block removal.
export async function revokeToken(refreshToken) {
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
    });
  } catch {
    // Already revoked or Google unreachable; the row is deleted either way.
  }
}

export async function listGmailAccounts(client, ownerId) {
  const { rows } = await client.query(
    'select id, email, created_at from gmail_accounts where owner_id = $1 order by email',
    [ownerId]
  );
  return rows;
}

// Connecting the same address again just refreshes its token.
export async function saveGmailAccount(client, ownerId, { email, refreshToken }) {
  const { rows } = await client.query(
    `insert into gmail_accounts (owner_id, email, refresh_token_enc)
     values ($1, $2, $3)
     on conflict (owner_id, email) do update set refresh_token_enc = excluded.refresh_token_enc
     returning id, email`,
    [ownerId, email, encryptToken(refreshToken)]
  );
  return rows[0];
}

export async function removeGmailAccount(client, ownerId, id) {
  const { rows } = await client.query(
    'delete from gmail_accounts where owner_id = $1 and id = $2 returning email, refresh_token_enc',
    [ownerId, id]
  );
  if (!rows[0]) return null;
  try {
    await revokeToken(decryptToken(rows[0].refresh_token_enc));
  } catch {
    // Token could not be decrypted (key changed); nothing left to revoke.
  }
  return { email: rows[0].email };
}
