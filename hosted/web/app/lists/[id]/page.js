'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/Modal.js';
import AddPersonModal from '../../components/AddPersonModal.js';
import { useUndoBar } from '../../components/UndoBar.js';
import HelpBubble from '../../components/HelpBubble.js';

// Kept in sync with LIST_STATUSES in lib/lists.js.
const STATUSES = ['', 'Emailed', 'Replied', 'Said yes', 'Said no', 'No reply'];

export default function ListPage({ params }) {
  const listId = Number(params.id);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '' });
  const [picking, setPicking] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [message, setMessage] = useState('');
  const [trashed, setTrashed] = useState(false);
  const undo = useUndoBar();

  async function load() {
    try {
      const res = await fetch(`/api/lists/${listId}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
      setDraft({ name: json.list.name, description: json.list.description || '' });
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    load();
  }, [listId]);

  function flash(text) {
    setMessage(text);
    setTimeout(() => setMessage(''), 2500);
  }

  async function saveDetails(e) {
    e.preventDefault();
    const res = await fetch(`/api/lists/${listId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      flash(body.error || 'That didn’t save.');
      return;
    }
    setEditing(false);
    flash('Saved ✓');
    await load();
  }

  async function setStatus(member, status) {
    setData((d) => ({ ...d, members: d.members.map((m) => (m.teacher_id === member.teacher_id ? { ...m, status: status || null } : m)) }));
    await fetch(`/api/lists/${listId}/members/${member.teacher_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  async function removeMember(member) {
    const res = await fetch(`/api/lists/${listId}/members/${member.teacher_id}`, { method: 'DELETE' });
    const body = await res.json();
    if (!res.ok) return;
    const name = [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Person';
    undo.show(`${name} taken off this list`, async () => {
      await fetch(`/api/lists/${listId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: body.removed }),
      });
      await load();
    });
    await load();
  }

  async function saveNote() {
    if (!noteText.trim()) return;
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteText: noteText.trim(), listId }),
    });
    setNoteText('');
    flash('Note saved ✓');
    await load();
  }

  async function trashList() {
    const res = await fetch(`/api/lists/${listId}`, { method: 'DELETE' });
    if (!res.ok) return;
    setTrashed(true);
    undo.show(`“${data.list.name}” moved to Trash`, async () => {
      await fetch(`/api/lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      });
      setTrashed(false);
      await load();
    });
  }

  const counts = useMemo(() => {
    const c = {};
    for (const m of data?.members || []) if (m.status) c[m.status] = (c[m.status] || 0) + 1;
    return c;
  }, [data]);

  if (failed) return <p className="signal-home-empty">This list couldn’t be found. <a href="/lists">Back to Lists</a></p>;
  if (!data) return <p className="signal-home-empty">Loading…</p>;

  const { list, members, notes } = data;

  if (trashed) {
    return (
      <div className="signal-home">
        <div className="signal-empty-big">
          <p className="signal-empty-big-title">“{list.name}” was moved to Trash.</p>
          <p className="signal-home-sub">The people in it are still in People. Changed your mind? Press <strong>Undo</strong> at the bottom.</p>
          <a href="/lists" className="signal-btn-primary signal-btn-link">Back to Lists</a>
        </div>
        {undo.bar}
      </div>
    );
  }

  return (
    <div className="signal-home">
      <a href="/lists" className="signal-back-link">← Lists</a>

      <header className="signal-home-header">
        {editing ? (
          <form onSubmit={saveDetails} className="signal-stack-form">
            <label className="signal-field-label" htmlFor="list-name">List name</label>
            <input id="list-name" className="signal-big-input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} autoFocus />
            <label className="signal-field-label" htmlFor="list-desc">What is it for? (optional)</label>
            <input id="list-desc" className="signal-big-input" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            <div className="signal-modal-buttons" style={{ justifyContent: 'flex-start' }}>
              <button type="submit" className="signal-btn-primary">Save</button>
              <button type="button" className="signal-btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <div className="signal-title-row">
              <h1 className="signal-home-title">{list.name}</h1>
              <button type="button" className="signal-btn-ghost signal-btn-small" onClick={() => setEditing(true)}>✎ Rename</button>
            </div>
            {list.description && <p className="signal-home-sub">{list.description}</p>}
          </>
        )}
        {message && <p className="signal-inline-message" role="status">{message}</p>}
      </header>

      <div className="signal-people-actions">
        <a href={`/compose?list=${list.id}`} className="signal-btn-email">✉ Email this list</a>
        <button type="button" className="signal-btn-add" onClick={() => setPicking(true)}>
          <span aria-hidden="true">+</span> Add people
        </button>
        <button type="button" className="signal-btn-ghost" onClick={() => setAddingNew(true)}>+ Add a new person</button>
      </div>

      <section className="signal-home-section" aria-labelledby="members-title">
        <div className="signal-home-section-head">
          <h2 id="members-title" className="signal-home-section-title">
            {members.length} {members.length === 1 ? 'person' : 'people'} on this list{' '}
            <HelpBubble text="Use the box next to each name to keep track of who replied. People you email from here are marked Emailed for you." />
          </h2>
          {Object.keys(counts).length > 0 && (
            <div className="signal-chip-row">
              {STATUSES.filter((s) => counts[s]).map((s) => (
                <span key={s} className="signal-chip">{counts[s]} {s.toLowerCase()}</span>
              ))}
            </div>
          )}
        </div>

        {members.length === 0 ? (
          <div className="signal-empty-big">
            <p className="signal-empty-big-title">No one here yet.</p>
            <p className="signal-home-sub">Pick people you’ve already added, or add someone new.</p>
            <div className="signal-people-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="signal-btn-add" onClick={() => setPicking(true)}>
                <span aria-hidden="true">+</span> Add people
              </button>
              <button type="button" className="signal-btn-ghost" onClick={() => setAddingNew(true)}>+ Add a new person</button>
            </div>
          </div>
        ) : (
          <ul className="signal-member-list">
            {members.map((m) => {
              const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || '(no name)';
              return (
                <li key={m.teacher_id} className="signal-member-row">
                  <a href={`/people/${m.teacher_id}`} className="signal-member-who">
                    <span className="signal-person-name">{name}</span>
                    <span className="signal-person-meta">{[m.email || 'No email', m.role].filter(Boolean).join(' · ')}</span>
                  </a>
                  <label className="signal-visually-hidden" htmlFor={`status-${m.teacher_id}`}>Reply status for {name}</label>
                  <select
                    id={`status-${m.teacher_id}`}
                    className={`signal-status-select${m.status ? ' set' : ''}`}
                    value={m.status || ''}
                    onChange={(e) => setStatus(m, e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s || 'No reply status'}</option>
                    ))}
                  </select>
                  <button type="button" className="signal-icon-btn" onClick={() => removeMember(m)} aria-label={`Take ${name} off this list`} title="Take off this list">
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="signal-home-section" aria-labelledby="lnotes-title">
        <h2 id="lnotes-title" className="signal-home-section-title">Notes for this list</h2>
        <div className="signal-notes-box">
          <label htmlFor="list-note" className="signal-visually-hidden">Write a note</label>
          <textarea id="list-note" className="signal-notes-input" rows={3} placeholder="Write a note about this list…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          <div className="signal-notes-actions">
            <button type="button" className="signal-btn-primary" onClick={saveNote}>Save note</button>
          </div>
          {notes.length > 0 && (
            <ul className="signal-notes-list">
              {notes.map((n) => (
                <li key={n.id} className="signal-note-row signal-note-static">
                  <span className="signal-note-text">{n.note_text}</span>
                  <span className="signal-note-meta">{new Date(n.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="signal-home-section signal-danger-zone">
        <button type="button" className="signal-btn-danger" onClick={trashList}>Delete this list</button>
        <p className="signal-home-sub">The people stay in People. The list goes to Trash, and you can Undo right after.</p>
      </section>

      {picking && (
        <PickPeopleModal
          listId={listId}
          memberIds={new Set(members.map((m) => m.teacher_id))}
          onClose={() => setPicking(false)}
          onAddNew={() => {
            setPicking(false);
            setAddingNew(true);
          }}
          onAdded={async (count) => {
            setPicking(false);
            flash(`Added ${count} ${count === 1 ? 'person' : 'people'} ✓`);
            await load();
          }}
        />
      )}

      {addingNew && (
        <AddPersonModal
          listId={listId}
          listName={list.name}
          onClose={() => setAddingNew(false)}
          onAdded={async (result) => {
            setAddingNew(false);
            flash(`${result.name} added ✓`);
            await load();
          }}
        />
      )}

      {undo.bar}
    </div>
  );
}

function PickPeopleModal({ listId, memberIds, onClose, onAdded, onAddNew }) {
  const [people, setPeople] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/people')
      .then((r) => (r.ok ? r.json() : { people: [] }))
      .then((d) => setPeople(d.people.filter((p) => !memberIds.has(p.id))))
      .catch(() => setPeople([]));
  }, []);

  const shown = useMemo(() => {
    if (!people) return [];
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.first_name, p.last_name, ...p.assignments.flatMap((a) => [a.email, a.subject, a.school])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [people, search]);

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function add() {
    if (selected.size === 0) return;
    setSaving(true);
    await fetch(`/api/lists/${listId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherIds: [...selected] }),
    });
    onAdded(selected.size);
  }

  return (
    <Modal onClose={onClose} labelledBy="pick-title" className="signal-modal signal-modal-tall">
      <h2 id="pick-title" className="signal-modal-title">Add people to this list</h2>
      {people === null && <p className="signal-modal-help">Loading…</p>}
      {people && people.length === 0 && (
        <>
          <p className="signal-modal-help">Everyone in this workspace is already on the list, or no one has been added yet.</p>
          <div className="signal-modal-buttons">
            <button type="button" className="signal-btn-ghost" onClick={onClose}>Close</button>
            <button type="button" className="signal-btn-primary" onClick={onAddNew}>+ Add a new person</button>
          </div>
        </>
      )}
      {people && people.length > 0 && (
        <>
          <p className="signal-modal-help">Tick everyone you want, then press Add.</p>
          <input
            className="signal-big-input"
            placeholder="Find someone…"
            aria-label="Find someone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="signal-pick-actions">
            <button type="button" className="signal-link-btn" onClick={() => setSelected(new Set(shown.map((p) => p.id)))}>
              Tick all {shown.length}
            </button>
            {selected.size > 0 && (
              <button type="button" className="signal-link-btn" onClick={() => setSelected(new Set())}>Untick all</button>
            )}
          </div>
          <ul className="signal-pick-list">
            {shown.map((p) => (
              <li key={p.id}>
                <label className="signal-import-row">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="signal-import-name">{[p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)'}</span>
                  <span className="signal-import-meta">{[p.assignments[0]?.email, p.assignments[0]?.subject].filter(Boolean).join(' · ')}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="signal-modal-buttons">
            <button type="button" className="signal-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="signal-btn-primary" onClick={add} disabled={saving || selected.size === 0}>
              {saving ? 'Adding…' : selected.size === 0 ? 'Add' : `Add ${selected.size} ${selected.size === 1 ? 'person' : 'people'}`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
