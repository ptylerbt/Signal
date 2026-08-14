'use client';

import { useEffect, useState } from 'react';
import { cardStyle, titleStyle, subtitleStyle, inputStyle, selectStyle, primaryBtnStyle, ghostBtnStyle, chipGrayStyle, chipGreenStyle, chipBlueStyle } from '../components/ui.js';

const STATUS_OPTIONS = ['', 'Contacted', 'Responded', 'Confirmed', 'Declined', 'No Response'];

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null); // { project, members, sends }
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const [allTeachers, setAllTeachers] = useState([]);
  const [addSearch, setAddSearch] = useState('');

  const [personTeacherId, setPersonTeacherId] = useState(null);
  const [personDetail, setPersonDetail] = useState(null); // { notes, sends, status }
  const [newNote, setNewNote] = useState('');

  async function loadProjects() {
    const res = await fetch('/api/projects');
    if (res.ok) setProjects(await res.json());
  }

  useEffect(() => {
    loadProjects();

    // Deep link support: /projects?open=<id> jumps straight into a project,
    // used by the "Go to Project" button in the dashboard detail overlay.
    const openId = new URLSearchParams(window.location.search).get('open');
    if (openId) openProject(Number(openId));
  }, []);

  async function createProject() {
    if (!newName.trim()) return;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() }),
    });
    if (res.ok) {
      const { projectId } = await res.json();
      setNewName('');
      setNewDescription('');
      await loadProjects();
      openProject(projectId);
    }
  }

  async function openProject(projectId) {
    setSelectedId(projectId);
    setPersonTeacherId(null);
    setPersonDetail(null);
    setAddSearch('');
    const res = await fetch(`/api/projects/${projectId}`);
    if (res.ok) {
      const data = await res.json();
      // A deep link (?open=<id>) can point at a project that was deleted or
      // isn't ours; the API answers 200 with project:null, so guard before
      // reading its fields.
      if (data?.project) {
        setDetail(data);
        setNameDraft(data.project.name || '');
        setDescriptionDraft(data.project.description || '');
      } else {
        setSelectedId(null);
      }
    } else {
      setSelectedId(null);
    }
    if (allTeachers.length === 0) {
      const tRes = await fetch('/api/teachers');
      if (tRes.ok) setAllTeachers(await tRes.json());
    }
  }

  function closeProject() {
    setSelectedId(null);
    setDetail(null);
    setPersonTeacherId(null);
    setPersonDetail(null);
  }

  async function saveProjectName() {
    if (!nameDraft.trim()) return;
    await fetch(`/api/projects/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameDraft.trim(), description: descriptionDraft.trim() }),
    });
    await loadProjects();
    await openProject(selectedId);
  }

  async function toggleProjectStatus() {
    const newStatus = detail.project.status === 'archived' ? 'active' : 'archived';
    await fetch(`/api/projects/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await loadProjects();
    await openProject(selectedId);
  }

  async function deleteProject() {
    if (!window.confirm('Delete this project? Notes and status tags will be removed; past sends stay in history but unlinked from this project.')) return;
    await fetch(`/api/projects/${selectedId}`, { method: 'DELETE' });
    closeProject();
    await loadProjects();
  }

  async function addPerson(teacherId) {
    await fetch(`/api/projects/${selectedId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId }),
    });
    setAddSearch('');
    await openProject(selectedId);
  }

  async function removePerson(teacherId) {
    if (!window.confirm('Remove this person from the project? Their notes and status will be deleted.')) return;
    await fetch(`/api/projects/${selectedId}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId }),
    });
    if (personTeacherId === teacherId) {
      setPersonTeacherId(null);
      setPersonDetail(null);
    }
    await openProject(selectedId);
  }

  async function openPerson(teacherId) {
    setPersonTeacherId(teacherId);
    const res = await fetch(`/api/projects/${selectedId}/people/${teacherId}`);
    if (res.ok) setPersonDetail(await res.json());
  }

  async function setPersonStatus(status) {
    await fetch(`/api/projects/${selectedId}/people/${personTeacherId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status || null }),
    });
    setPersonDetail((prev) => ({ ...prev, status: status || null }));
    await openProject(selectedId);
    setPersonTeacherId(personTeacherId);
  }

  async function addNote() {
    if (!newNote.trim()) return;
    await fetch(`/api/projects/${selectedId}/people/${personTeacherId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteText: newNote.trim() }),
    });
    setNewNote('');
    const res = await fetch(`/api/projects/${selectedId}/people/${personTeacherId}`);
    if (res.ok) setPersonDetail(await res.json());
    await openProject(selectedId);
  }

  const memberTeacherIds = new Set((detail?.members || []).map((m) => m.teacher_id));
  const addResults = addSearch.trim()
    ? allTeachers.filter((t) => {
        const name = `${t.first_name ?? ''} ${t.last_name ?? ''}`.toLowerCase();
        return name.includes(addSearch.trim().toLowerCase()) && !memberTeacherIds.has(t.id);
      })
    : [];
  const personName = detail?.members.find((m) => m.teacher_id === personTeacherId);

  return (
    <div style={{ maxWidth: 860 }}>
      {!selectedId && (
        <>
          <div style={cardStyle}>
            <h2 style={titleStyle}>New Project</h2>
            <input
              type="text"
              placeholder="Project name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: 10 }}
            />
            <input
              type="text"
              placeholder="Description (optional)..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: 10 }}
            />
            <button onClick={createProject} style={primaryBtnStyle}>Create Project</button>
          </div>

          <div style={cardStyle}>
            <h2 style={titleStyle}>Projects</h2>
            {projects.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>No projects yet.</p>}
            {projects.map((p) => (
              <div key={p.id} onClick={() => openProject(p.id)} style={projectRowStyle}>
                <span>
                  <strong style={{ fontSize: 16 }}>{p.name}</strong>{' '}
                  {p.status === 'archived'
                    ? <span style={chipGrayStyle}>Archived</span>
                    : <span style={chipGreenStyle}>Active</span>}
                  <div style={{ fontSize: 14, color: '#777', marginTop: 4 }}>{p.description}</div>
                </span>
                <span style={{ fontSize: 14, color: '#777' }}>{p.member_count} people · {p.send_count} sends</span>
              </div>
            ))}
          </div>
        </>
      )}

      {selectedId && detail && (
        <>
          <div style={cardStyle}>
            <button onClick={closeProject} style={ghostBtnStyle}>← Back to Projects</button>
            <h2 style={{ ...titleStyle, marginTop: 14 }}>Project Details</h2>
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: 10 }}
            />
            <input
              type="text"
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={saveProjectName} style={primaryBtnStyle}>Save</button>
              <button onClick={toggleProjectStatus} style={ghostBtnStyle}>
                {detail.project.status === 'archived' ? 'Reactivate' : 'Archive'}
              </button>
              <button onClick={deleteProject} style={ghostBtnStyle}>Delete</button>
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={subtitleStyle}>Add Person</h3>
            <input
              type="text"
              placeholder="Search teachers by name..."
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: 10 }}
            />
            {addResults.map((t) => (
              <div key={t.id} style={memberRowStyle}>
                <span>{t.first_name} {t.last_name}</span>
                <button onClick={() => addPerson(t.id)} style={ghostBtnStyle}>+ Add</button>
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <h3 style={subtitleStyle}>People ({detail.members.length})</h3>
            {detail.members.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>No one added to this project yet.</p>}
            {detail.members.map((m) => (
              <div key={m.teacher_id} style={memberRowStyle} onClick={() => openPerson(m.teacher_id)}>
                <span style={{ cursor: 'pointer' }}>
                  {m.first_name} {m.last_name}{' '}
                  {m.status ? <span style={chipBlueStyle}>{m.status}</span> : <span style={chipGrayStyle}>No Status</span>}
                  <div style={{ fontSize: 14, color: '#777', marginTop: 4 }}>{m.latest_note || `${m.send_count} send(s), no notes yet`}</div>
                </span>
                <button onClick={(e) => { e.stopPropagation(); removePerson(m.teacher_id); }} style={ghostBtnStyle}>Remove</button>
              </div>
            ))}
          </div>

          {personTeacherId && personDetail && (
            <div style={cardStyle}>
              <h3 style={subtitleStyle}>{personName ? `${personName.first_name} ${personName.last_name}` : 'Person'}</h3>
              <label style={{ fontSize: 15, color: '#555' }}>
                Status:{' '}
                <select value={personDetail.status || ''} onChange={(e) => setPersonStatus(e.target.value)} style={selectStyle}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || '— No Status —'}</option>)}
                </select>
              </label>

              <h4 style={{ fontSize: 15, marginTop: 18, marginBottom: 8, color: '#666' }}>Notes</h4>
              <textarea
                placeholder="Add a note..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
                style={{ ...inputStyle, width: '100%', fontFamily: 'inherit', marginBottom: 8 }}
              />
              <button onClick={addNote} style={primaryBtnStyle}>Add Note</button>
              <div style={{ marginTop: 12 }}>
                {personDetail.notes.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>No notes yet.</p>}
                {personDetail.notes.map((n) => (
                  <div key={n.id} style={noteItemStyle}>
                    <div>{n.note_text}</div>
                    <div style={{ fontSize: 13, color: '#999', marginTop: 2 }}>{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>

              <h4 style={{ fontSize: 15, marginTop: 18, marginBottom: 8, color: '#666' }}>Send History</h4>
              {personDetail.sends.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>No sends recorded for this person in this project yet.</p>}
              {personDetail.sends.map((s) => (
                <div key={s.id} style={noteItemStyle}>
                  {s.template_name || 'Announcement'} — {s.school} ({s.recipient_field}) — {new Date(s.generated_at).toLocaleString()}
                </div>
              ))}
            </div>
          )}

          <div style={cardStyle}>
            <h3 style={subtitleStyle}>All Sends for this Project ({detail.sends.length})</h3>
            {detail.sends.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>No sends recorded for this project yet.</p>}
            {detail.sends.map((s) => (
              <div key={s.id} style={noteItemStyle}>
                {s.first_name} {s.last_name} — {s.template_name || 'Announcement'} — {s.school} ({s.recipient_field}) — {new Date(s.generated_at).toLocaleString()}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const projectRowStyle = { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '12px 0', borderBottom: '1px solid #f2f2f2', fontSize: 15, cursor: 'pointer' };
const memberRowStyle = { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid #f2f2f2', fontSize: 15 };
const noteItemStyle = { padding: '10px 0', borderBottom: '1px solid #f2f2f2', fontSize: 15 };
