'use client';

import { useEffect, useMemo, useState } from 'react';
import DetailOverlay from '../components/DetailOverlay.js';
import HelpBubble from '../components/HelpBubble.js';
import { useUndoBar } from '../components/UndoBar.js';

export default function NotesPage() {
  const [notes, setNotes] = useState(null);
  const [lists, setLists] = useState([]);
  const [people, setPeople] = useState([]);
  const [detailItem, setDetailItem] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [listId, setListId] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [person, setPerson] = useState(null);
  const [message, setMessage] = useState('');
  const undo = useUndoBar();

  async function load() {
    try {
      const [n, l, p] = await Promise.all([fetch('/api/notes'), fetch('/api/lists'), fetch('/api/people')]);
      setNotes(n.ok ? await n.json() : []);
      if (l.ok) setLists(await l.json());
      if (p.ok) setPeople((await p.json()).people);
    } catch {
      setNotes([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const matches = useMemo(() => {
    const q = personSearch.trim().toLowerCase();
    if (!q) return [];
    return people.filter((p) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase().includes(q)).slice(0, 8);
  }, [people, personSearch]);

  async function save() {
    if (!noteText.trim()) {
      setMessage('Type something first, then press Save note.');
      return;
    }
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteText: noteText.trim(), listId: listId ? Number(listId) : null, teacherId: person?.id ?? null }),
    });
    setNoteText('');
    setListId('');
    setPerson(null);
    setPersonSearch('');
    setMessage('Saved ✓');
    setTimeout(() => setMessage(''), 2500);
    await load();
  }

  async function remove(note) {
    await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
    undo.show('Note moved to Trash', async () => {
      await fetch('/api/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'note', id: note.id }),
      });
      await load();
    });
    await load();
  }

  return (
    <div className="signal-home">
      <header className="signal-home-header">
        <div className="signal-title-row">
          <h1 className="signal-home-title">Notes</h1>
          <HelpBubble text="Write down anything you want to remember. You can link a note to a list or a person so it shows up there too." />
        </div>
        <p className="signal-home-sub">Notes for this workspace. You can also write notes on Home, on a list, or on someone’s page.</p>
      </header>

      <section className="signal-home-section">
        <div className="signal-notes-box">
          <label htmlFor="notes-new" className="signal-visually-hidden">Write a note</label>
          <textarea id="notes-new" className="signal-notes-input" rows={4} placeholder="Write a note…" value={noteText} onChange={(e) => { setNoteText(e.target.value); if (message) setMessage(''); }} />

          <div className="signal-form-row" style={{ marginTop: 6 }}>
            <div>
              <label className="signal-field-label" htmlFor="notes-list">About a list (optional)</label>
              <select id="notes-list" className="signal-big-input" value={listId} onChange={(e) => setListId(e.target.value)}>
                <option value="">— No list —</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="signal-field-label" htmlFor="notes-person">About a person (optional)</label>
              {person ? (
                <div className="signal-chip-row">
                  <span className="signal-chip signal-chip-on">{[person.first_name, person.last_name].filter(Boolean).join(' ')}</span>
                  <button type="button" className="signal-link-btn" onClick={() => setPerson(null)}>Change</button>
                </div>
              ) : (
                <>
                  <input id="notes-person" className="signal-big-input" placeholder="Type a name…" value={personSearch} onChange={(e) => setPersonSearch(e.target.value)} autoComplete="off" />
                  {matches.length > 0 && (
                    <ul className="signal-suggest-list">
                      {matches.map((p) => (
                        <li key={p.id}>
                          <button type="button" className="signal-suggest-item" onClick={() => { setPerson(p); setPersonSearch(''); }}>
                            {[p.first_name, p.last_name].filter(Boolean).join(' ')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="signal-notes-actions">
            <button type="button" className="signal-btn-primary" onClick={save}>Save note</button>
            {message && <span className="signal-notes-message" role="status">{message}</span>}
          </div>
        </div>
      </section>

      <section className="signal-home-section" aria-labelledby="all-notes">
        <h2 id="all-notes" className="signal-home-section-title">All notes{notes ? ` (${notes.length})` : ''}</h2>
        {notes === null && <p className="signal-home-empty">Loading…</p>}
        {notes && notes.length === 0 && <p className="signal-home-empty">No notes in this workspace yet.</p>}
        {notes && notes.length > 0 && (
          <ul className="signal-notes-list" style={{ marginTop: 0 }}>
            {notes.map((n) => (
              <li key={n.id} className="signal-note-full">
                <button type="button" className="signal-note-row" onClick={() => setDetailItem({ ...n, kind: 'note' })}>
                  <span className="signal-note-text" style={{ WebkitLineClamp: 4 }}>{n.note_text}</span>
                  <span className="signal-note-meta">
                    {new Date(n.created_at).toLocaleString()}
                    {n.list_name ? ` · List: ${n.list_name}` : ''}
                    {n.teacher_first_name ? ` · ${n.teacher_first_name} ${n.teacher_last_name ?? ''}` : ''}
                  </span>
                </button>
                <button type="button" className="signal-icon-btn" onClick={() => remove(n)} aria-label="Move this note to Trash" title="Move to Trash">🗑</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DetailOverlay item={detailItem} onClose={() => setDetailItem(null)} />
      {undo.bar}
    </div>
  );
}
