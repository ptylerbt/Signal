'use client';

import { useEffect, useState } from 'react';
import { cardStyle, titleStyle, subtitleStyle, inputStyle, primaryBtnStyle, chipBlueStyle } from '../components/ui.js';

export default function SettingsPage() {
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [fontScale, setFontScale] = useState(1.0);
  const [highContrast, setHighContrast] = useState(false);
  const [signature, setSignature] = useState('');
  const [status, setStatus] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setName(data.name);
        setEmail(data.email);
        setRole(data.role);
        setFontScale(data.fontScale);
        setHighContrast(data.highContrast);
        setSignature(data.defaultSignature || '');
        setShowAdvanced(!!data.showAdvanced);
      }
    } catch {
      // Fall through to defaults below rather than getting stuck loading forever.
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Live-preview accessibility changes immediately, before saving.
  useEffect(() => {
    // Saved immediately; the page reloads so the sidebar shows/hides the tools.
  async function toggleAdvanced(next) {
    setShowAdvanced(next);
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showAdvanced: next }),
    });
    window.location.reload();
  }

  async function openPractice(reset) {
    await fetch('/api/workspaces/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset }),
    });
    window.location.href = '/';
  }

  if (!loaded) return;
    document.documentElement.style.fontSize = `${18 * fontScale}px`;
  }, [fontScale, loaded]);

  useEffect(() => {
    if (!loaded) return;
    document.documentElement.dataset.contrast = highContrast ? 'high' : 'normal';
  }, [highContrast, loaded]);

  async function save() {
    setStatus('Saving...');
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fontScale, highContrast, defaultSignature: signature }),
    });
    setStatus('Saved.');
    setTimeout(() => setStatus(''), 2000);
  }

  if (!loaded) return <p style={{ fontSize: 15, color: '#666' }}>Loading...</p>;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>Accessibility</h2>
        <p style={{ fontSize: 15, color: '#666', marginTop: 0 }}>
          Adjust text size and contrast for the whole app. Changes preview instantly — click Save to keep them for next time.
        </p>

        <label style={{ display: 'block', fontSize: 16, fontWeight: 600, color: '#1F3864', marginBottom: 8 }}>
          Text size: {Math.round(fontScale * 100)}%
        </label>
        <input
          type="range"
          min="0.8"
          max="1.6"
          step="0.1"
          value={fontScale}
          onChange={(e) => setFontScale(Number(e.target.value))}
          style={{ width: '100%', height: 32 }}
          aria-label="Text size"
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#888', marginBottom: 20 }}>
          <span>Smaller</span>
          <span>Larger</span>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 16, color: '#1F3864', fontWeight: 600, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={highContrast}
            onChange={(e) => setHighContrast(e.target.checked)}
            style={{ width: 24, height: 24 }}
          />
          High contrast mode
        </label>

        <div style={{ marginTop: 20 }}>
          <button onClick={save} style={primaryBtnStyle}>Save</button>
          {status && <span style={{ marginLeft: 12, fontSize: 15, color: '#1F3864' }}>{status}</span>}
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={titleStyle}>Account</h2>
        <div style={rowStyle}><span style={labelStyle}>Name</span><span style={valueStyle}>{name || '—'}</span></div>
        <div style={rowStyle}><span style={labelStyle}>Email</span><span style={valueStyle}>{email || '—'}</span></div>
        <div style={rowStyle}>
          <span style={labelStyle}>Role</span>
          <span style={chipBlueStyle}>{role === 'admin' ? 'Admin' : 'User'}</span>
        </div>
        <p style={{ fontSize: 14, color: '#888', marginTop: 12, marginBottom: 0 }}>
          Manage your sign-in details from the account menu in the top-right corner.
        </p>
      </div>

      <div style={cardStyle}>
        <h2 style={titleStyle}>Email signature</h2>
        <p style={{ fontSize: 15, color: '#666', marginTop: 0 }}>
          Added automatically to the end of messages you write in Write Email.
        </p>
        <textarea
          placeholder="e.g. Thanks,&#10;Your Name"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          rows={4}
          style={{ ...inputStyle, width: '100%', fontFamily: 'inherit', marginBottom: 12 }}
        />
        <button onClick={save} style={primaryBtnStyle}>Save</button>
      </div>

      <div style={cardStyle}>
        <h2 style={titleStyle}>🧪 Practice</h2>
        <p style={{ fontSize: 15, color: '#666', marginTop: 0 }}>
          A workspace full of pretend people, lists, and a letter. Try anything there — nothing is real, and pretend emails go nowhere.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button onClick={() => openPractice(false)} style={primaryBtnStyle}>Open Practice</button>
          <button onClick={() => openPractice(true)} className="signal-btn-ghost">Start Practice over</button>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={titleStyle}>Advanced tools</h2>
        <label className="signal-check-row" style={{ marginTop: 0 }}>
          <input type="checkbox" checked={showAdvanced} onChange={(e) => toggleAdvanced(e.target.checked)} />
          <span>
            Show advanced tools
            <span className="signal-check-sub">Adds “Find duplicates” and “Backup” under More. Most people don’t need these.</span>
          </span>
        </label>
      </div>
    </div>
  );
}

const rowStyle = { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f2f2f2', fontSize: 16 };
const labelStyle = { color: '#888', fontSize: 14, minWidth: 80, flexShrink: 0 };
const valueStyle = { overflowWrap: 'anywhere', minWidth: 0 };
