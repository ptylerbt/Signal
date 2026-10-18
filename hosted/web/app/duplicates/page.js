'use client';

import { useEffect, useState } from 'react';
import HelpBubble from '../components/HelpBubble.js';
import { useUndoBar, undoRosterSnapshot } from '../components/UndoBar.js';

// Advanced tool (shown when "Show advanced tools" is on in Settings).
// Looks across ALL workspaces for profiles that are probably the same person.
export default function DuplicatesPage() {
  const [groups, setGroups] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const undo = useUndoBar();

  async function load() {
    try {
      const res = await fetch('/api/roster/duplicates');
      setGroups(res.ok ? await res.json() : []);
    } catch {
      setGroups([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function combine(group) {
    setBusy(true);
    const [keepId, ...mergeIds] = group.teacherIds;
    const res = await fetch('/api/roster/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId, mergeIds }),
    });
    const body = await res.json();
    if (res.ok) {
      undo.show(body.undo.label, async () => {
        await undoRosterSnapshot(body.undo);
        await load();
      });
    }
    setBusy(false);
    await load();
  }

  async function tidyAll() {
    setBusy(true);
    setMessage('Tidying…');
    const res = await fetch('/api/roster/combine-all', { method: 'POST' });
    const body = await res.json();
    setMessage(res.ok ? (body.removed > 0 ? `Removed ${body.removed} repeated contact ${body.removed === 1 ? 'row' : 'rows'}.` : 'Nothing needed tidying.') : body.error || 'That didn’t work.');
    if (res.ok && body.removed > 0) {
      undo.show('Tidied contact details', async () => {
        await undoRosterSnapshot(body.undo);
        await load();
      });
    }
    setBusy(false);
    await load();
  }

  return (
    <div className="signal-home">
      <header className="signal-home-header">
        <div className="signal-title-row">
          <h1 className="signal-home-title">Find duplicates</h1>
          <HelpBubble text="Sometimes the same person gets added twice, for example with two different email addresses. This page finds them so you can join them into one." />
        </div>
        <p className="signal-home-sub">These look like the same person, across all your workspaces. Combining keeps all their emails, roles, lists, and notes.</p>
      </header>

      <div className="signal-people-actions">
        <button type="button" className="signal-btn-ghost" onClick={tidyAll} disabled={busy}>Tidy repeated contact details</button>
        <HelpBubble text="Joins repeated rows inside each person, like the same email listed twice with different subjects." />
      </div>
      {message && <p className="signal-inline-message" role="status">{message}</p>}

      {groups === null && <p className="signal-home-empty">Looking…</p>}
      {groups && groups.length === 0 && (
        <div className="signal-empty-big">
          <p className="signal-empty-big-title">No duplicates found ✓</p>
          <p className="signal-home-sub">Everyone looks like a different person.</p>
        </div>
      )}
      {groups && groups.length > 0 && (
        <ul className="signal-people-list">
          {groups.map((g, i) => (
            <li key={i} className="signal-member-row">
              <span className="signal-member-who">
                <span className="signal-person-name">{g.label}</span>
                <span className="signal-person-meta">{g.reason} · {g.teacherIds.length} separate profiles</span>
              </span>
              <button type="button" className="signal-btn-primary signal-btn-small" onClick={() => combine(g)} disabled={busy}>Combine into one</button>
            </li>
          ))}
        </ul>
      )}

      {undo.bar}
    </div>
  );
}
