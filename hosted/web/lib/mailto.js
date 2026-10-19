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

// Opens Gmail in a browser tab with a new message filled in. This goes
// through Gmail's own handler for email links (extsrc=mailto), which shows
// the normal Gmail screen with the message docked over the inbox, so the
// account's name and picture are visible. The full-screen compose view
// (view=cm&fs=1) hides them. `account` (an email address) picks which
// signed-in Google account it opens in.
export function buildGmailComposeUrl({ to, cc, bcc, subject, body, account }) {
  const recipients = (to || []).map(encodeURIComponent).join(',');
  const extra = encodeMailtoQuery({
    cc: (cc || []).join(','),
    bcc: (bcc || []).join(','),
    subject,
    body,
  });
  const mailto = `mailto:${recipients}${extra ? `?${extra}` : ''}`;
  const query = encodeMailtoQuery({ authuser: account, extsrc: 'mailto', url: mailto });
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
