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
