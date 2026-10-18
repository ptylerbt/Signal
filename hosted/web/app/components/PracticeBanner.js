'use client';

import { useEffect, useState } from 'react';

// Shown on every screen while the Practice workspace is open, so it's always
// clear that nothing here is real — with a one-click way back.
export default function PracticeBanner() {
  const [data, setData] = useState(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetch('/api/workspaces')
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data?.current?.is_practice) return null;

  const realWorkspace = data.workspaces.find((w) => !w.is_practice);

  async function goBack() {
    if (!realWorkspace) return;
    await fetch('/api/workspaces/current', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: realWorkspace.id }),
    });
    window.location.href = '/';
  }

  async function startOver() {
    await fetch('/api/workspaces/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    });
    window.location.href = '/';
  }

  return (
    <div className="signal-practice-banner" role="status">
      <span className="signal-practice-text">
        <strong>🧪 You’re in Practice.</strong> These are pretend people, so try anything — nothing here is real.
      </span>
      <span className="signal-practice-actions">
        {confirming ? (
          <>
            <span>Start Practice over with fresh pretend people?</span>
            <button type="button" className="signal-practice-btn" onClick={startOver}>Yes, start over</button>
            <button type="button" className="signal-practice-btn ghost" onClick={() => setConfirming(false)}>No</button>
          </>
        ) : (
          <>
            {realWorkspace && (
              <button type="button" className="signal-practice-btn" onClick={goBack}>
                ← Back to {realWorkspace.emoji || '📁'} {realWorkspace.name}
              </button>
            )}
            <button type="button" className="signal-practice-btn ghost" onClick={() => setConfirming(true)}>Start practice over</button>
          </>
        )}
      </span>
    </div>
  );
}
