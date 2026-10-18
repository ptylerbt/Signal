'use client';

import { useEffect, useState } from 'react';
import { useUndoBar, undoRosterSnapshot } from '../../components/UndoBar.js';

const BLANK = { email: '', subject: '', school: '', level: '' };

export default function PersonPage({ params }) {
  const personId = Number(params.id);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState({ firstName: '', lastName: '' });
  const [editingId, setEditingId] = useState(null); // assignment id, or 'new'
  const [draft, setDraft] = useState(BLANK);
  const [noteText, setNoteText] = useState('');
  const [message, setMessage] = useState('');
  const [removed, setRemoved] = useState(null);
  const undo = useUndoBar();

  async function load() {
    try {
      const res = await fetch(`/api/people/${personId}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
      setNameDraft({ firstName: json.person.first_name || '', lastName: json.person.last_name || '' });
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    load();
  }, [personId]);

  function flash(text) {
    setMessage(text);
    setTimeout(() => setMessage(''), 2500);
  }

  async function saveName(e) {
    e.preventDefault();
    const res = await fetch(`/api/people/${personId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nameDraft),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      flash(body.error || 'That didn’t save.');
      return;
    }
    setEditingName(false);
    flash('Name saved ✓');
    await load();
  }

  function startEdit(a) {
    setEditingId(a ? a.id : 'new');
    setDraft(a ? { email: a.email || '', subject: a.subject || '', school: a.school || '', level: a.level || '', district: a.district || '' } : BLANK);
  }

  async function saveDetails(e) {
    e.preventDefault();
    if (!draft.email.trim() && !draft.subject.trim() && !draft.school.trim()) {
      flash('Type at least an email, a role, or a school.');
      return;
    }
    const isNew = editingId === 'new';
    await fetch(isNew ? `/api/teachers/${personId}/assignments` : `/api/teachers/${personId}/assignments/${editingId}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setEditingId(null);
    flash('Details saved ✓');
    await load();
  }

  async function deleteDetails(a) {
    await fetch(`/api/teachers/${personId}/assignments/${a.id}`, { method: 'DELETE' });
    undo.show(`Removed ${a.email || a.subject || 'those details'}`, async () => {
      await fetch(`/api/teachers/${personId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a),
      });
      await load();
    });
    await load();
  }

  async function addToWorkspace(w) {
    await fetch(`/api/people/${personId}/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: w.id }),
    });
    flash(`Added to ${w.name} ✓`);
    await load();
  }

  async function saveNote() {
    if (!noteText.trim()) return;
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteText: noteText.trim(), teacherId: personId }),
    });
    setNoteText('');
    flash('Note saved ✓');
    await load();
  }

  async function removeFromWorkspace() {
    const res = await fetch(`/api/people/${personId}`, { method: 'DELETE' });
    const body = await res.json();
    if (!res.ok) return;
    setRemoved(body);
    undo.show(body.undo.label, async () => {
      await undoRosterSnapshot(body.undo);
      setRemoved(null);
      await load();
    });
  }

  if (failed) return <p className="signal-home-empty">This person couldn’t be found. <a href="/people">Back to People</a></p>;
  if (!data) return <p className="signal-home-empty">Loading…</p>;

  const { person, assignments, workspaces, lists, notes, sends, currentWorkspace } = data;
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ') || '(no name)';
  const memberOf = workspaces.filter((w) => w.is_member);
  const notMemberOf = workspaces.filter((w) => !w.is_member);

  if (removed) {
    return (
      <div className="signal-home">
        <div className="signal-empty-big">
          <p className="signal-empty-big-title">
            {removed.trashed ? `${name} was moved to Trash.` : `${name} was removed from ${currentWorkspace.name}.`}
          </p>
          {!removed.trashed && <p className="signal-home-sub">They’re still in {removed.stillIn.join(', ')}.</p>}
          <p className="signal-home-sub">Changed your mind? Press <strong>Undo</strong> at the bottom of the screen.</p>
          <a href="/people" className="signal-btn-primary signal-btn-link">Back to People</a>
        </div>
        {undo.bar}
      </div>
    );
  }

  return (
    <div className="signal-home">
      <a href="/people" className="signal-back-link">← People</a>

      <header className="signal-home-header">
        {editingName ? (
          <form className="signal-inline-form" onSubmit={saveName}>
            <input className="signal-big-input" aria-label="First name" placeholder="First name" value={nameDraft.firstName} onChange={(e) => setNameDraft((d) => ({ ...d, firstName: e.target.value }))} autoFocus />
            <input className="signal-big-input" aria-label="Last name" placeholder="Last name" value={nameDraft.lastName} onChange={(e) => setNameDraft((d) => ({ ...d, lastName: e.target.value }))} />
            <button type="submit" className="signal-btn-primary">Save</button>
            <button type="button" className="signal-btn-ghost" onClick={() => setEditingName(false)}>Cancel</button>
          </form>
        ) : (
          <div className="signal-title-row">
            <h1 className="signal-home-title">{name}</h1>
            <button type="button" className="signal-btn-ghost signal-btn-small" onClick={() => setEditingName(true)}>✎ Change name</button>
          </div>
        )}
        {message && <p className="signal-inline-message" role="status">{message}</p>}
      </header>

      <section className="signal-home-section" aria-labelledby="details-title">
        <h2 id="details-title" className="signal-home-section-title">Contact details</h2>
        <div className="signal-detail-cards">
          {assignments.map((a) =>
            editingId === a.id ? (
              <DetailsForm key={a.id} draft={draft} setDraft={setDraft} onSubmit={saveDetails} onCancel={() => setEditingId(null)} />
            ) : (
              <div key={a.id} className="signal-detail-card">
                <DetailLine label="Email" value={a.email} />
                <DetailLine label="Role or subject" value={a.subject} />
                <DetailLine label="School or organization" value={a.school} />
                <DetailLine label="Grade or level" value={a.level} />
                {a.district && <DetailLine label="District" value={a.district} />}
                <div className="signal-detail-actions">
                  <button type="button" className="signal-btn-ghost signal-btn-small" onClick={() => startEdit(a)}>✎ Edit</button>
                  <button type="button" className="signal-btn-danger signal-btn-small" onClick={() => deleteDetails(a)}>Remove</button>
                </div>
              </div>
            )
          )}
          {editingId === 'new' ? (
            <DetailsForm draft={draft} setDraft={setDraft} onSubmit={saveDetails} onCancel={() => setEditingId(null)} />
          ) : (
            <button type="button" className="signal-list-card signal-list-card-new signal-detail-add" onClick={() => startEdit(null)}>
              <span className="signal-list-card-plus" aria-hidden="true">+</span>
              <span className="signal-list-card-name">Add another email or role</span>
              <span className="signal-list-card-meta">For someone with two jobs, schools, or emails</span>
            </button>
          )}
        </div>
      </section>

      <section className="signal-home-section" aria-labelledby="ws-title">
        <h2 id="ws-title" className="signal-home-section-title">Workspaces</h2>
        <div className="signal-chip-row">
          {memberOf.map((w) => (
            <span key={w.id} className="signal-chip signal-chip-on">{w.emoji} {w.name}</span>
          ))}
        </div>
        {notMemberOf.length > 0 && (
          <>
            <p className="signal-home-sub" style={{ marginTop: 14 }}>Also add them to:</p>
            <div className="signal-chip-row">
              {notMemberOf.map((w) => (
                <button key={w.id} type="button" className="signal-chip signal-chip-add" onClick={() => addToWorkspace(w)}>
                  + {w.emoji} {w.name}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="signal-home-section" aria-labelledby="lists-title">
        <h2 id="lists-title" className="signal-home-section-title">Lists</h2>
        {lists.length === 0 ? (
          <p className="signal-home-empty">Not on any lists yet. Open a list and press “Add people” to put them on one.</p>
        ) : (
          <div className="signal-chip-row">
            {lists.map((l) => (
              <a key={l.id} href={`/lists/${l.id}`} className="signal-chip signal-chip-link">
                {l.name}
                <span className="signal-chip-sub"> · {l.workspace_name}{l.status ? ` · ${l.status}` : ''}</span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="signal-home-section" aria-labelledby="pnotes-title">
        <h2 id="pnotes-title" className="signal-home-section-title">Notes about {person.first_name || 'them'}</h2>
        <div className="signal-notes-box">
          <label htmlFor="person-note" className="signal-visually-hidden">Write a note</label>
          <textarea id="person-note" className="signal-notes-input" rows={3} placeholder="Write a note…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
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

      <section className="signal-home-section" aria-labelledby="sent-title">
        <h2 id="sent-title" className="signal-home-section-title">Emails sent</h2>
        {sends.length === 0 ? (
          <p className="signal-home-empty">No emails sent to {person.first_name || 'them'} yet.</p>
        ) : (
          <ul className="signal-recent-list">
            {sends.map((s) => (
              <li key={s.id} className="signal-recent-row">
                <span className="signal-recent-who">{s.template_name || 'Email'}</span>
                <span className="signal-recent-meta">
                  {s.list_name ? `${s.list_name} · ` : ''}{new Date(s.generated_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="signal-home-section signal-danger-zone">
        <button type="button" className="signal-btn-danger" onClick={removeFromWorkspace}>
          Remove {person.first_name || 'this person'} from {currentWorkspace.name}
        </button>
        <p className="signal-home-sub">
          {memberOf.length > 1
            ? `They'll stay in your other workspaces. You can Undo right after.`
            : `They'll go to Trash, where you can get them back. You can also Undo right after.`}
        </p>
      </section>

      {undo.bar}
    </div>
  );
}

function DetailLine({ label, value }) {
  return (
    <div className="signal-detail-line">
      <span className="signal-detail-label">{label}</span>
      <span className={`signal-detail-value${value ? '' : ' empty'}`}>{value || 'Not filled in'}</span>
    </div>
  );
}

function DetailsForm({ draft, setDraft, onSubmit, onCancel }) {
  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }));
  return (
    <form className="signal-detail-card signal-detail-editing" onSubmit={onSubmit}>
      <label className="signal-field-label" htmlFor="d-email">Email</label>
      <input id="d-email" type="email" className="signal-big-input" value={draft.email} onChange={set('email')} autoFocus />
      <label className="signal-field-label" htmlFor="d-role">Role or subject</label>
      <input id="d-role" className="signal-big-input" value={draft.subject} onChange={set('subject')} />
      <label className="signal-field-label" htmlFor="d-org">School or organization</label>
      <input id="d-org" className="signal-big-input" value={draft.school} onChange={set('school')} />
      <label className="signal-field-label" htmlFor="d-grade">Grade or level</label>
      <input id="d-grade" className="signal-big-input" value={draft.level} onChange={set('level')} />
      <div className="signal-modal-buttons" style={{ justifyContent: 'flex-start' }}>
        <button type="submit" className="signal-btn-primary">Save</button>
        <button type="button" className="signal-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
