'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// A big "Removed Pat from this list — [Undo]" bar along the bottom of the
// screen. Stays 15 seconds. Usage:
//   const undo = useUndoBar();
//   undo.show('Pat removed', async () => { ...put it back... });
//   return <>{...}{undo.bar}</>;
export function useUndoBar() {
  const [item, setItem] = useState(null); // { label, action }
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setItem(null);
  }, []);

  const show = useCallback((label, action) => {
    if (timer.current) clearTimeout(timer.current);
    setItem({ label, action });
    timer.current = setTimeout(() => setItem(null), 15000);
  }, []);

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  async function runUndo() {
    if (!item) return;
    setBusy(true);
    try {
      await item.action();
    } finally {
      setBusy(false);
      clear();
    }
  }

  const bar = item ? (
    <div className="signal-undo-bar" role="status">
      <span className="signal-undo-label">{item.label}</span>
      <button type="button" className="signal-undo-btn" onClick={runUndo} disabled={busy}>
        {busy ? 'Undoing…' : 'Undo'}
      </button>
      <button type="button" className="signal-undo-close" onClick={clear} aria-label="Dismiss">✕</button>
    </div>
  ) : null;

  return { show, clear, bar };
}

// Restores a people/roster snapshot returned by the server.
export async function undoRosterSnapshot(undo) {
  await fetch('/api/roster/undo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot: undo.snapshot }),
  });
}
