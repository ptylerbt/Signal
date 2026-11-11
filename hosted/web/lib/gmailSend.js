import crypto from 'crypto';
import { decryptToken } from './gmail.js';

// Sending through the Gmail API. Messages go out from the connected
// account and land in that account's Sent folder like any other email.

// Gmail's own cap on a free account is about 500 recipients a day.
export const DAILY_RECIPIENT_LIMIT = 500;
// Vercel caps a request at 4.5 MB, and attachments travel as base64
// (a third bigger), so keep the files themselves under this.
export const ATTACHMENT_LIMIT_BYTES = 3 * 1024 * 1024;

export class GmailSendError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Swaps the stored refresh token for a short-lived access token.
export async function getAccessToken(refreshTokenEnc) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_GMAIL_CLIENT_ID,
      client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET,
      refresh_token: decryptToken(refreshTokenEnc),
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  // invalid_grant = the permission was removed in Google, or the password
  // changed. The account has to be connected again.
  if (data.error === 'invalid_grant') throw new GmailSendError('reconnect', 'Gmail access was removed');
  if (!res.ok || !data.access_token) throw new GmailSendError('google', `Google token refresh failed: ${data.error || res.status}`);
  return data.access_token;
}

// Header values may contain any language; RFC 2047 encodes them.
function encodeHeader(value) {
  const text = String(value || '').replace(/[\r\n]+/g, ' ');
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

// Long base64 lines break some mail servers; wrap at 76 characters.
function wrap76(base64) {
  return base64.replace(/.{1,76}/g, '$&\r\n');
}

function cleanAddresses(list) {
  return (list || []).map((a) => String(a).replace(/[\r\n,<>]/g, '').trim()).filter(Boolean);
}

// Builds the raw email. No From header: Gmail fills in the account's own
// name and address. `attachments` = [{ name, type, data (base64) }].
export function buildMime({ to, bcc, subject, body, attachments = [] }) {
  const headers = [
    to?.length ? `To: ${cleanAddresses(to).join(', ')}` : null,
    bcc?.length ? `Bcc: ${cleanAddresses(bcc).join(', ')}` : null,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  const textPart = [
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(String(body || '').replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64')),
  ].join('\r\n');

  if (attachments.length === 0) return `${headers.join('\r\n')}\r\n${textPart}`;

  const boundary = `signal_${crypto.randomBytes(12).toString('hex')}`;
  const parts = [textPart];
  for (const file of attachments) {
    const name = encodeHeader(file.name || 'attachment').replace(/"/g, '');
    parts.push(
      [
        `Content-Type: ${String(file.type || 'application/octet-stream').replace(/[\r\n;]/g, '')}; name="${name}"`,
        `Content-Disposition: attachment; filename="${name}"`,
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(String(file.data || '').replace(/\s+/g, '')),
      ].join('\r\n')
    );
  }

  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    ...parts.map((p) => `--${boundary}\r\n${p}`),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export async function sendRaw(accessToken, mime) {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(mime, 'utf8').toString('base64url') }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  const reason = data.error?.errors?.[0]?.reason || data.error?.status || '';
  if (res.status === 429 || /limit/i.test(reason)) throw new GmailSendError('limit', `Gmail sending limit: ${reason}`);
  if (res.status === 401 || res.status === 403) throw new GmailSendError('reconnect', `Gmail refused: ${reason}`);
  throw new GmailSendError('google', `Gmail send failed (${res.status}): ${reason}`);
}
