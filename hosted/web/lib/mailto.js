export function encodeMailtoQuery(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

export function buildMailtoUrl(email, subject, body) {
  const query = encodeMailtoQuery({ subject, body });
  return `mailto:${encodeURIComponent(email)}${query ? `?${query}` : ''}`;
}

// Gmail's own "compose" page, opened in a browser tab with everything filled
// in. `account` (an email address) picks which signed-in Google account it
// opens in, so someone signed into several accounts lands in the right one.
export function buildGmailComposeUrl({ to, cc, bcc, subject, body, account }) {
  const query = encodeMailtoQuery({
    view: 'cm',
    fs: '1',
    to: (to || []).join(','),
    cc: (cc || []).join(','),
    bcc: (bcc || []).join(','),
    su: subject,
    body,
    authuser: account,
  });
  return `https://mail.google.com/mail/?${query}`;
}

// Browsers and Gmail start cutting off very long addresses around here.
export const GMAIL_URL_LIMIT = 8000;

export function buildAnnouncementMailtoUrl({ to, cc, bcc, subject, body }) {
  const query = encodeMailtoQuery({
    to: (to || []).join(','),
    cc: (cc || []).join(','),
    bcc: (bcc || []).join(','),
    subject,
    body,
  });
  return `mailto:?${query}`;
}
