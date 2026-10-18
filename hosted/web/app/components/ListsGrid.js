'use client';

import { useEffect, useState } from 'react';

// Shared by Home and the Lists page: list cards plus a big "+ New List"
// card that opens a one-field form. `limit` caps how many cards show.
export default function ListsGrid({ lists, limit, onCreated }) {
  const [creating, setCreating] = useState(false);
  const shown = limit ? lists.slice(0, limit) : lists;

  return (
    <>
      <div className="signal-list-grid">
        <button type="button" className="signal-list-card signal-list-card-new" onClick={() => setCreating(true)}>
          <span className="signal-list-card-plus" aria-hidden="true">+</span>
          <span className="signal-list-card-name">New List</span>
          <span className="signal-list-card-meta">A group of people you email together</span>
        </button>

        {shown.map((l) => (
          <div key={l.id} className="signal-list-card">
            <span className="signal-list-card-name">{l.name}</span>
            {l.description && <span className="signal-list-card-desc">{l.description}</span>}
            <span className="signal-list-card-meta">
              {l.member_count} {l.member_count === 1 ? 'person' : 'people'}
              {l.last_sent_at ? ` · last emailed ${new Date(l.last_sent_at).toLocaleDateString()}` : ' · not emailed yet'}
            </span>
          </div>
        ))}
      </div>

      {creating && (
        <NewListForm
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            onCreated?.();
          }}
        />
      )}
    </>
  );
}

function NewListForm({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please type a name, like “Choir Members”.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Something went wrong. Please try again.');
        setSaving(false);
        return;
      }
      onCreated();
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="signal-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="signal-modal" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="new-list-title">
        <h2 id="new-list-title" className="signal-modal-title">New list</h2>
        <p className="signal-modal-help">Give it a name you'll recognize. You can add people to it next.</p>

        <label className="signal-field-label" htmlFor="list-name">Name</label>
        <input
          id="list-name"
          className="signal-big-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Choir Members"
          autoFocus
          maxLength={120}
        />

        <label className="signal-field-label" htmlFor="list-desc">What is it for? (optional)</label>
        <input
          id="list-desc"
          className="signal-big-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Spring concert reminders"
        />

        {error && <p className="signal-modal-error" role="alert">{error}</p>}

        <div className="signal-modal-buttons">
          <button type="button" className="signal-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="signal-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Create list'}
          </button>
        </div>
      </form>
    </div>
  );
}
