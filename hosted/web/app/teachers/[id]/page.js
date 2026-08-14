'use client';

import { useEffect, useState } from 'react';
import { cardStyle, subtitleStyle, inputStyle, selectStyle, primaryBtnStyle, ghostBtnStyle, dangerBtnStyle, linkStyle, chipGrayStyle, chipBlueStyle } from '../../components/ui.js';

const BLANK_ASSIGNMENT = { school: '', level: '', subject: '', email: '', district: '' };

export default function TeacherProfilePage({ params }) {
  const teacherId = Number(params.id);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [linkProjectId, setLinkProjectId] = useState('');

  const [nameDraft, setNameDraft] = useState({ firstName: '', lastName: '', isDistrictRep: false });
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [newAssignment, setNewAssignment] = useState(BLANK_ASSIGNMENT);
  const [saveStatus, setSaveStatus] = useState('');

  async function load() {
    try {
      const res = await fetch(`/api/teachers/${teacherId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.teacher) {
          setNameDraft({
            firstName: json.teacher.first_name || '',
            lastName: json.teacher.last_name || '',
            isDistrictRep: !!json.teacher.is_district_rep,
          });
          const drafts = {};
          for (const a of json.assignments) {
            drafts[a.id] = {
              school: a.school || '',
              level: a.level || '',
              subject: a.subject || '',
              email: a.email || '',
              district: a.district || '',
            };
          }
          setAssignmentDrafts(drafts);
        }
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    load();
  }, [teacherId]);

  async function saveName() {
    setSaveStatus('Saving...');
    await fetch(`/api/teachers/${teacherId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nameDraft),
    });
    setSaveStatus('Saved.');
    await load();
    setTimeout(() => setSaveStatus(''), 1500);
  }

  async function deleteTeacher() {
    if (!window.confirm('Delete this teacher? Their assignments, group memberships, and project memberships will be removed. Notes and send history stay in your records but unlinked from this teacher.')) return;
    await fetch(`/api/teachers/${teacherId}`, { method: 'DELETE' });
    window.location.href = '/roster';
  }

  function updateAssignmentDraft(id, field, value) {
    setAssignmentDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveAssignment(id) {
    await fetch(`/api/teachers/${teacherId}/assignments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignmentDrafts[id]),
    });
    await load();
  }

  async function deleteAssignment(id) {
    if (!window.confirm('Remove this assignment?')) return;
    await fetch(`/api/teachers/${teacherId}/assignments/${id}`, { method: 'DELETE' });
    await load();
  }

  async function addAssignment() {
    if (!newAssignment.school.trim() && !newAssignment.email.trim()) return;
    await fetch(`/api/teachers/${teacherId}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAssignment),
    });
    setNewAssignment(BLANK_ASSIGNMENT);
    await load();
  }

  async function addNote() {
    if (!newNote.trim()) return;
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        noteText: newNote.trim(),
        teacherId,
        projectId: linkProjectId ? Number(linkProjectId) : null,
      }),
    });
    setNewNote('');
    setLinkProjectId('');
    await load();
  }

  async function deleteNote(id) {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    await load();
  }

  if (loadError) return <p style={{ fontSize: 15, color: '#a33' }}>Could not load this teacher. Try refreshing the page.</p>;
  if (!data) return <p style={{ fontSize: 15, color: '#666' }}>Loading...</p>;
  if (!data.teacher) return <p style={{ fontSize: 15, color: '#a33' }}>Teacher not found.</p>;

  const { assignments, notes, sends, projects } = data;

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={cardStyle}>
        <a href="/roster" style={linkStyle}>← Back to Roster</a>
        <h2 style={{ color: '#1F3864', fontSize: 22, margin: '10px 0' }}>Edit Teacher</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="First name"
            value={nameDraft.firstName}
            onChange={(e) => setNameDraft({ ...nameDraft, firstName: e.target.value })}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Last name"
            value={nameDraft.lastName}
            onChange={(e) => setNameDraft({ ...nameDraft, lastName: e.target.value })}
            style={inputStyle}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: '#555', marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={nameDraft.isDistrictRep}
            onChange={(e) => setNameDraft({ ...nameDraft, isDistrictRep: e.target.checked })}
            style={{ width: 20, height: 20 }}
          />
          District Rep
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={saveName} style={primaryBtnStyle}>Save</button>
          <button onClick={deleteTeacher} style={dangerBtnStyle}>Delete Teacher</button>
          {saveStatus && <span style={{ fontSize: 14, color: '#1F3864' }}>{saveStatus}</span>}
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={subtitleStyle}>Assignments</h3>
        {assignments.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>No assignments on file.</p>}
        {assignments.map((a) => {
          const draft = assignmentDrafts[a.id] || BLANK_ASSIGNMENT;
          return (
            <div key={a.id} style={assignmentEditRowStyle}>
              <input type="text" placeholder="School" value={draft.school} onChange={(e) => updateAssignmentDraft(a.id, 'school', e.target.value)} style={inputStyle} />
              <input type="text" placeholder="Level" value={draft.level} onChange={(e) => updateAssignmentDraft(a.id, 'level', e.target.value)} style={inputStyle} />
              <input type="text" placeholder="Subject" value={draft.subject} onChange={(e) => updateAssignmentDraft(a.id, 'subject', e.target.value)} style={inputStyle} />
              <input type="text" placeholder="Email" value={draft.email} onChange={(e) => updateAssignmentDraft(a.id, 'email', e.target.value)} style={inputStyle} />
              <input type="text" placeholder="District" value={draft.district} onChange={(e) => updateAssignmentDraft(a.id, 'district', e.target.value)} style={inputStyle} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => saveAssignment(a.id)} style={primaryBtnStyle}>Save</button>
                <button onClick={() => deleteAssignment(a.id)} style={dangerBtnStyle}>Delete</button>
              </div>
            </div>
          );
        })}

        <h4 style={{ fontSize: 15, marginTop: 18, marginBottom: 8, color: '#666' }}>Add Assignment</h4>
        <div style={assignmentEditRowStyle}>
          <input type="text" placeholder="School" value={newAssignment.school} onChange={(e) => setNewAssignment({ ...newAssignment, school: e.target.value })} style={inputStyle} />
          <input type="text" placeholder="Level" value={newAssignment.level} onChange={(e) => setNewAssignment({ ...newAssignment, level: e.target.value })} style={inputStyle} />
          <input type="text" placeholder="Subject" value={newAssignment.subject} onChange={(e) => setNewAssignment({ ...newAssignment, subject: e.target.value })} style={inputStyle} />
          <input type="text" placeholder="Email" value={newAssignment.email} onChange={(e) => setNewAssignment({ ...newAssignment, email: e.target.value })} style={inputStyle} />
          <input type="text" placeholder="District" value={newAssignment.district} onChange={(e) => setNewAssignment({ ...newAssignment, district: e.target.value })} style={inputStyle} />
          <button onClick={addAssignment} style={primaryBtnStyle}>Add</button>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={subtitleStyle}>Projects ({projects.length})</h3>
        {projects.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>Not part of any project.</p>}
        {projects.map((p) => (
          <div key={p.id} style={rowStyle}>
            <a href="/projects" style={{ color: '#1F3864', fontWeight: 600 }}>{p.name}</a>
            <span>{p.person_status ? <span style={chipBlueStyle}>{p.person_status}</span> : <span style={chipGrayStyle}>No Status</span>}</span>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <h3 style={subtitleStyle}>Notes ({notes.length})</h3>
        <textarea
          placeholder="Add a note about this teacher..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={3}
          style={{ ...inputStyle, width: '100%', fontFamily: 'inherit', marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 15, color: '#555' }}>
            Link to project (optional):{' '}
            <select value={linkProjectId} onChange={(e) => setLinkProjectId(e.target.value)} style={selectStyle}>
              <option value="">— None —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <button onClick={addNote} style={primaryBtnStyle}>Add Note</button>
        </div>
        {notes.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>No notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} style={noteItemStyle}>
            <div>{n.note_text}</div>
            <div style={{ fontSize: 13.5, color: '#999', display: 'flex', gap: 12, marginTop: 4, alignItems: 'center' }}>
              <span>{new Date(n.created_at).toLocaleString()}</span>
              {n.project_name && <span>Project: {n.project_name}</span>}
              <button onClick={() => deleteNote(n.id)} style={{ ...ghostBtnStyle, padding: '4px 10px' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <h3 style={subtitleStyle}>Send History ({sends.length})</h3>
        {sends.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>No sends recorded yet.</p>}
        {sends.map((s) => (
          <div key={s.id} style={noteItemStyle}>
            {s.template_name || 'Announcement'} — {s.school} ({s.recipient_field}) — {new Date(s.generated_at).toLocaleString()}
          </div>
        ))}
      </div>
    </div>
  );
}

const rowStyle = { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f2f2f2', fontSize: 15 };
const noteItemStyle = { padding: '10px 0', borderBottom: '1px solid #f2f2f2', fontSize: 15 };
const assignmentEditRowStyle = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f2f2f2' };
