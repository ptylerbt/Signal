import { SignOutButton } from '@clerk/nextjs';

export default function NotAuthorizedPage() {
  return (
    <div style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center', padding: 24 }}>
      <h1 style={{ color: '#1F3864', fontSize: 24, marginBottom: 12 }}>This account isn't authorized</h1>
      <p style={{ fontSize: 16, color: '#555', marginBottom: 24 }}>
        Signal is currently limited to a small, approved list of people. If you believe this is a mistake, contact the app admin.
      </p>
      <SignOutButton>
        <button style={btnStyle}>Sign Out</button>
      </SignOutButton>
    </div>
  );
}

const btnStyle = {
  padding: '10px 22px',
  background: '#1F3864',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-pill)',
  cursor: 'pointer',
  fontSize: 15,
  fontWeight: 600,
  boxShadow: 'var(--shadow-soft-sm)',
};
