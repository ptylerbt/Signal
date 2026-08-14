'use client';

import { useEffect, useState } from 'react';
import { cardStyle, titleStyle, inputStyle, selectStyle, primaryBtnStyle, ghostBtnStyle, chipGrayStyle, chipBlueStyle } from '../components/ui.js';
import DetailOverlay from '../components/DetailOverlay.js';

export default function NotesPage() {
  const [detailItem, setDetailItem] = useState(null);
  const [notes, setNotes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [noteText, setNoteText] = useState('');
  const [projectId, setProjectId] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherId, setTeacherId] = useState('');

  async function loadAll() {
    const [notesRes, projectsRes, teachersRes] = await Promise.all([
      fetch('/api/notes'),
      fetch('/api/projects'),
      fetch('/api/teachers'),
    ]);
    if (notesRes.ok) setNotes(await notesRes.json());
    if (projectsRes.ok) setProjects(await projectsRes.json());
    if (teachersRes.ok) setTeachers(await teachersRes.json());
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function addNote() {
    if (!noteText.trim()) return;
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        noteText: noteText.trim(),
        projectId: projectId ? Number(projectId) : null,
        teacherId: teacherId ? Number(teacherId) : null,
      }),
    });
    setNoteText('');
    setProjectId('');
    setTeacherId('');
    setTeacherSearch('');
    await loadAll();
  }

  async function deleteNote(id) {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    await loadAll();
  }

  const teacherMatches = teacherSearch.trim()
    ? teachers.filter((t) => `${t.first_name ?? ''} ${t.last_name ?? ''}`.toLowerCase().includes(teacherSearch.trim().toLowerCase()))
    : [];
  const selectedTeacher = teachers.find((t) => String(t.id) === String(teacherId));

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>Add a Note</h2>
        <textarea
          placeholder="Write a note..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={4}
          style={{ ...inputStyle, width: '100%', fontFamily: 'inherit', marginBottom: 10 }}
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <label style={{ fontSize: 14, color: '#444' }}>
            Link to project (optional):{' '}
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={selectStyle}>
              <option value="">— None —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          <div>
            <label style={{ fontSize: 14, color: '#444' }}>Link to teacher (optional):</label>
            {selectedTeacher ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
                <span style={chipBlueStyle}>{selectedTeacher.first_name} {selectedTeacher.last_name}</span>
                <button onClick={() => { setTeacherId(''); setTeacherSearch(''); }} style={ghostBtnStyle}>Clear</button>
              </div>
            ) : (
              <input
                type="text"
                placeholder="Search teacher by name..."
                value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
                style={{ ...inputStyle, marginLeft: 6 }}
              />
            )}
            {!selectedTeacher && teacherMatches.length > 0 && (
              <div style={{ border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', marginTop: 6, maxHeight: 140, overflowY: 'auto' }}>
                {teacherMatches.slice(0, 10).map((t) => (
                  <div key={t.id} style={teacherMatchRowStyle} onClick={() => { setTeacherId(String(t.id)); setTeacherSearch(''); }}>
                    {t.first_name} {t.last_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <button onClick={addNote} style={primaryBtnStyle}>Add Note</button>
      </div>

      <div style={cardStyle}>
        <h2 style={titleStyle}>All Notes ({notes.length})</h2>
        {notes.length === 0 && <p style={{ color: '#666' }}>No notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} style={noteItemStyle}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setDetailItem({ ...n, kind: 'note' })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailItem({ ...n, kind: 'note' }); } }}
              style={{ fontSize: 15, cursor: 'pointer' }}
            >
              {n.note_text}
            </div>
            <div style={{ fontSize: 14, color: '#888', display: 'flex', gap: 12, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <span>{new Date(n.created_at).toLocaleString()}</span>
              {n.project_name && <span style={chipGrayStyle}>Project: {n.project_name}</span>}
              {n.teacher_first_name && (
                <a href={`/teachers/${n.teacher_id}`} style={chipBlueLinkStyle}>
                  {n.teacher_first_name} {n.teacher_last_name}
                </a>
              )}
              <button onClick={() => setDetailItem({ ...n, kind: 'note' })} style={ghostBtnStyle}>Details</button>
              <button onClick={() => deleteNote(n.id)} style={ghostBtnStyle}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <DetailOverlay item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}

const noteItemStyle = { padding: '12px 0', borderBottom: '1px solid #f2f2f2' };
const chipBlueLinkStyle = { fontSize: 13, background: '#e8f0fb', color: '#1F3864', padding: '3px 10px', borderRadius: 'var(--radius-pill)', textDecoration: 'none' };
const teacherMatchRowStyle = { padding: '8px 12px', fontSize: 15, cursor: 'pointer', borderBottom: '1px solid #f2f2f2' };
