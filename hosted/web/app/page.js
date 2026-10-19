'use client';

import { useEffect, useState } from 'react';
import ListsGrid from './components/ListsGrid.js';
import DetailOverlay from './components/DetailOverlay.js';
import HelpBubble from './components/HelpBubble.js';

// Home: one big "Write an email" action, this workspace's lists, and what
// was sent recently. Deliberately short — the calendar and notes live
// under "More".
export default function HomePage() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [detailItem, setDetailItem] = useState(null);

  async function load() {
    try {
      const res = await fetch('/api/home');
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (failed) return <p className="signal-home-empty">Something went wrong loading Home. Please refresh the page.</p>;
  if (!data) return <p className="signal-home-empty">Loading…</p>;

  const { workspace, lists, recentSends, notes } = data;

  return (
    <div className="signal-home">
      <header className="signal-home-header">
        <h1 className="signal-home-title">
          <span aria-hidden="true">{workspace.emoji || '📁'}</span> {workspace.name}
        </h1>
        <p className="signal-home-sub">
          What would you like to do?{' '}
          <HelpBubble text="This is your starting page. Everything here belongs to the workspace shown at the top. Switch workspaces with the big button up there." />
        </p>
      </header>

      <a href="/compose" className="signal-home-write">
        <span className="signal-home-write-icon" aria-hidden="true">✉</span>
        <span>
          <span className="signal-home-write-title">Write an email</span>
          <span className="signal-home-write-sub">Pick who, pick what to send, and it opens in Gmail</span>
        </span>
        <span className="signal-home-write-arrow" aria-hidden="true">→</span>
      </a>

      <section className="signal-home-section" aria-labelledby="home-lists">
        <div className="signal-home-section-head">
          <h2 id="home-lists" className="signal-home-section-title">
            Your lists <HelpBubble text="A list is a group of people you email together, like Choir Members. Click one to add people or email them." />
          </h2>
          {lists.length > 5 && <a href="/lists" className="signal-home-link">See all {lists.length} →</a>}
        </div>
        <ListsGrid lists={lists} limit={5} onCreated={load} />
      </section>

      <NotesBox notes={notes} onSaved={load} onOpen={setDetailItem} />

      <section className="signal-home-section" aria-labelledby="home-recent">
        <h2 id="home-recent" className="signal-home-section-title">
          Recently sent <HelpBubble text="Emails you opened from Signal in this workspace, newest first. The full history is on the Calendar page under More." />
        </h2>
        {recentSends.length === 0 ? (
          <p className="signal-home-empty">Nothing sent from this workspace yet. When you write an email, it will show up here.</p>
        ) : (
          <ul className="signal-recent-list">
            {recentSends.map((s) => (
              <li key={s.id} className="signal-recent-row">
                <span className="signal-recent-who">
                  {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || 'Someone'}
                </span>
                <span className="signal-recent-meta">
                  {s.list_name ? `${s.list_name} · ` : ''}
                  {s.template_name ? `${s.template_name} · ` : ''}
                  {timeAgo(s.generated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DetailOverlay item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}

// Type-and-save notes right on Home, so there's one obvious place to jot
// things down. Saved notes belong to the current workspace.
function NotesBox({ notes, onSaved, onOpen }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    if (!text.trim()) {
      setMessage('Type something first, then press Save note.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteText: text.trim() }),
      });
      if (!res.ok) throw new Error();
      setText('');
      setMessage('Saved ✓');
      await onSaved();
    } catch {
      setMessage('That didn’t save. Please try again.');
    }
    setSaving(false);
  }

  return (
    <section className="signal-home-section" aria-labelledby="home-notes">
      <div className="signal-home-section-head">
        <h2 id="home-notes" className="signal-home-section-title">
          Notes <HelpBubble text="Type anything you want to remember and press Save note. Click a note to see all of it." />
        </h2>
        <a href="/notes" className="signal-home-link">See all notes →</a>
      </div>

      <div className="signal-notes-box">
        <label htmlFor="home-note" className="signal-visually-hidden">Write a note</label>
        <textarea
          id="home-note"
          className="signal-notes-input"
          rows={3}
          placeholder="Write a note… (for example: “Call Mrs. Lee back about the concert”)"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (message) setMessage('');
          }}
        />
        <div className="signal-notes-actions">
          <button type="button" className="signal-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save note'}
          </button>
          {message && <span className="signal-notes-message" role="status">{message}</span>}
        </div>

        {notes.length === 0 ? (
          <p className="signal-notes-empty">No notes in this workspace yet.</p>
        ) : (
          <ul className="signal-notes-list">
            {notes.map((n) => (
              <li key={n.id}>
                <button type="button" className="signal-note-row" onClick={() => onOpen({ ...n, kind: 'note' })}>
                  <span className="signal-note-text">{n.note_text}</span>
                  <span className="signal-note-meta">{new Date(n.created_at).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function timeAgo(value) {
  const then = new Date(value);
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return then.toLocaleDateString();
}
