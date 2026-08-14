// Shared style tokens so every page uses the same larger, high-contrast
// look established on the Dashboard, rather than each page inventing its
// own (smaller) sizing.
//
// Radius/surface values reference the CSS custom properties defined in
// globals.css so there's one source of truth, and so the high-contrast
// accessibility mode can override these even though they're applied as
// inline React styles.

export const cardStyle = {
  border: '1px solid var(--card-border)',
  borderRadius: 'var(--radius-3xl)',
  padding: 24,
  marginBottom: 20,
  background: 'var(--card-bg)',
  backdropFilter: 'var(--card-blur)',
  WebkitBackdropFilter: 'var(--card-blur)',
  boxShadow: 'var(--shadow-soft-sm)',
};

export const titleStyle = { color: '#1F3864', fontSize: 20, marginTop: 0, marginBottom: 14 };
export const subtitleStyle = { color: '#1F3864', fontSize: 16, marginTop: 0, marginBottom: 12 };

export const inputStyle = {
  padding: '10px 14px',
  border: '1px solid var(--card-border)',
  borderRadius: 'var(--radius-md)',
  fontSize: 15,
  background: '#fff',
};
export const selectStyle = { ...inputStyle };

export const primaryBtnStyle = {
  padding: '10px 22px',
  background: '#1F3864',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-pill)',
  cursor: 'pointer',
  fontSize: 15,
  fontWeight: 600,
  boxShadow: 'var(--shadow-soft-sm)',
  transition: 'background 140ms ease, box-shadow 140ms ease',
};

export const ghostBtnStyle = {
  padding: '9px 18px',
  background: 'transparent',
  color: '#1F3864',
  border: '1px solid var(--card-border)',
  borderRadius: 'var(--radius-pill)',
  cursor: 'pointer',
  fontSize: 15,
  fontWeight: 600,
  transition: 'background 140ms ease, border-color 140ms ease',
};

export const dangerBtnStyle = {
  ...ghostBtnStyle,
  color: '#a11e23',
  borderColor: '#f0d3d4',
};

export const linkStyle = { color: '#1F3864', fontSize: 15, fontWeight: 600, textDecoration: 'none' };

export const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '10px 0',
  borderBottom: '1px solid #f2f2f2',
  fontSize: 15,
};

export const chipGrayStyle = { fontSize: 13, background: '#eee', color: '#555', padding: '3px 10px', borderRadius: 'var(--radius-pill)' };
export const chipGreenStyle = { fontSize: 13, background: '#e6f4ea', color: '#1e6e34', padding: '3px 10px', borderRadius: 'var(--radius-pill)' };
export const chipBlueStyle = { fontSize: 13, background: '#e8f0fb', color: '#1F3864', padding: '3px 10px', borderRadius: 'var(--radius-pill)' };
