'use client';

import { useEffect, useState } from 'react';
import { cardStyle, titleStyle, primaryBtnStyle, ghostBtnStyle, selectStyle, chipBlueStyle, chipGrayStyle } from '../components/ui.js';

export default function AdminPage() {
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('');

  async function load() {
    const meRes = await fetch('/api/me');
    if (meRes.ok) setMe(await meRes.json());

    const usersRes = await fetch('/api/admin/users');
    if (usersRes.ok) setUsers(await usersRes.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function changeRole(userId, role) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error || 'Could not change role.');
      setTimeout(() => setStatus(''), 4000);
    }
  }

  async function viewAs(userId) {
    const res = await fetch('/api/admin/view-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) window.location.href = '/';
  }

  if (me && !me.isAdmin) {
    return <p style={{ fontSize: 15, color: '#a33' }}>Admins only.</p>;
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>Users</h2>
        <p style={{ fontSize: 15, color: '#666', marginTop: 0 }}>
          Change a member's access level, or view the app as them to help with a task or check what they're seeing.
        </p>
        {status && <p style={{ fontSize: 14, color: '#a33' }}>{status}</p>}
        {users.map((u) => (
          <div key={u.userId} style={rowStyle}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#1F3864' }}>{u.name || '(no name set)'}</div>
              <div style={{ fontSize: 14, color: '#777' }}>{u.email}</div>
            </div>
            <span style={u.role === 'admin' ? chipBlueStyle : chipGrayStyle}>{u.role === 'admin' ? 'Admin' : 'User'}</span>
            <select value={u.role} onChange={(e) => changeRole(u.userId, e.target.value)} style={selectStyle}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={() => viewAs(u.userId)} style={ghostBtnStyle}>View As</button>
          </div>
        ))}
      </div>
    </div>
  );
}

const rowStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid #f2f2f2' };
