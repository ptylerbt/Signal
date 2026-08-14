'use client';

import { useEffect, useRef, useState } from 'react';
import { cardStyle, titleStyle, inputStyle, primaryBtnStyle, ghostBtnStyle, dangerBtnStyle } from '../components/ui.js';

export default function RosterPage() {
  const [teachers, setTeachers] = useState([]);
  const [status, setStatus] = useState('');
  const [previewRows, setPreviewRows] = useState(null);
  const [previewSummary, setPreviewSummary] = useState('');
  const fileInputRef = useRef(null);

  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');

  const [duplicates, setDuplicates] = useState([]);

  const [undoInfo, setUndoInfo] = useState(null);
  const undoTimerRef = useRef(null);

  function showUndo(undo) {
    if (!undo) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoInfo(undo);
    undoTimerRef.current = setTimeout(() => setUndoInfo(null), 15000);
  }

  async function handleUndo() {
    if (!undoInfo) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    await fetch('/api/roster/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: undoInfo.snapshot }),
    });
    setUndoInfo(null);
    setStatus('Undone.');
    await loadTeachers();
    await loadDuplicates();
  }

  async function loadTeachers() {
    const res = await fetch('/api/teachers');
    if (!res.ok) {
      setTeachers([]);
      return;
    }
    const data = await res.json();
    setTeachers(Array.isArray(data) ? data : []);
  }

  async function loadDuplicates() {
    const res = await fetch('/api/roster/duplicates');
    if (res.ok) setDuplicates(await res.json());
  }

  useEffect(() => {
    loadTeachers();
    loadDuplicates();
  }, []);

  async function autoCombineAll() {
    setStatus('Combining...');
    const res = await fetch('/api/roster/combine-all', { method: 'POST' });
    const data = await res.json();
    setStatus(res.ok ? `Removed ${data.removed} duplicate row(s) across all teachers.` : data.error || 'Combine failed.');
    if (res.ok && data.removed > 0) showUndo(data.undo);
    await loadTeachers();
    await loadDuplicates();
  }

  async function combineDuplicateGroup(teacherIds) {
    const [keepId, ...mergeIds] = teacherIds;
    const res = await fetch('/api/roster/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId, mergeIds }),
    });
    const data = await res.json();
    if (res.ok) showUndo(data.undo);
    await loadTeachers();
    await loadDuplicates();
  }

  async function handleFileChosen(e) {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('Reading file...');
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/roster/preview', { method: 'POST', body: formData });
    const data = await res.json();
    setStatus('');

    if (!res.ok) {
      setStatus(data.error || 'Something went wrong reading that file.');
      return;
    }

    const newRows = data.rows.filter((r) => !r.isDuplicate);
    setPreviewRows(newRows.map((r) => ({ ...r, checked: true })));
    setPreviewSummary(
      data.duplicateCount > 0
        ? `${data.duplicateCount} row(s) already imported were skipped automatically. ${newRows.length} new row(s) below.`
        : `${newRows.length} new row(s) found.`
    );

    e.target.value = '';
  }

  function toggleRow(index) {
    setPreviewRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, checked: !r.checked } : r))
    );
  }

  async function confirmImport() {
    const selected = previewRows.filter((r) => r.checked);
    if (selected.length === 0) {
      setPreviewRows(null);
      return;
    }

    setStatus('Importing...');
    const res = await fetch('/api/roster/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: selected }),
    });
    const data = await res.json();

    setStatus(res.ok ? `Imported ${data.count} row(s).` : data.error || 'Import failed.');
    if (res.ok) showUndo(data.undo);
    setPreviewRows(null);
    await loadTeachers();
    await loadDuplicates();
  }

  async function addTeacher() {
    if (!newFirstName.trim() && !newLastName.trim()) return;
    const res = await fetch('/api/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: newFirstName.trim(), lastName: newLastName.trim() }),
    });
    if (res.ok) {
      const teacher = await res.json();
      setNewFirstName('');
      setNewLastName('');
      await loadTeachers();
      window.location.href = `/teachers/${teacher.id}`;
    }
  }

  async function deleteTeacher(id) {
    if (!window.confirm('Delete this teacher? Their assignments, group memberships, and project memberships will be removed. Notes and send history stay in your records but unlinked from this teacher.')) return;
    const res = await fetch(`/api/teachers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) showUndo(data.undo);
    await loadTeachers();
    await loadDuplicates();
  }

  return (
    <div style={{ maxWidth: 820 }}>
      {undoInfo && (
        <div style={undoBannerStyle}>
          <span>{undoInfo.label}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleUndo} style={undoBtnStyle}>Undo</button>
            <button onClick={() => setUndoInfo(null)} style={{ ...ghostBtnStyle, borderColor: 'transparent', color: '#fff' }} aria-label="Dismiss">✕</button>
          </div>
        </div>
      )}

      <div style={cardStyle}>
        <h2 style={titleStyle}>Import Roster</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChosen}
            style={{ fontSize: 15 }}
          />
          <button onClick={autoCombineAll} style={ghostBtnStyle}>Auto Combine All</button>
        </div>
        <p style={{ fontSize: 14, color: '#666', marginTop: 10 }}>{status}</p>
      </div>

      {duplicates.length > 0 && (
        <div style={cardStyle}>
          <h2 style={titleStyle}>Possible Duplicates</h2>
          <p style={{ fontSize: 14, color: '#666', marginTop: 0 }}>
            These look like the same person — often a teacher with a different or missing email at another school. Review and combine if they match.
          </p>
          {duplicates.map((dup, i) => (
            <div key={i} style={duplicateRowStyle}>
              <span style={dup.reason === 'Same email' ? chipYellowStyle : chipGrayChipStyle}>{dup.reason}</span>
              <strong style={{ flex: 1, minWidth: 0 }}>{dup.label}</strong>
              <span style={{ fontSize: 13, color: '#888' }}>{dup.teacherIds.length} separate profiles</span>
              <button onClick={() => combineDuplicateGroup(dup.teacherIds)} style={primaryBtnStyle}>Combine into one profile</button>
            </div>
          ))}
        </div>
      )}

      {previewRows && (
        <div style={cardStyle}>
          <h2 style={titleStyle}>Review Import</h2>
          <p style={{ fontSize: 15, color: '#666', marginBottom: 12 }}>{previewSummary}</p>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {previewRows.length === 0 && <p style={{ color: '#666' }}>Nothing new to import.</p>}
            {previewRows.map((r, i) => (
              <div key={i} style={previewRowStyle}>
                <input type="checkbox" checked={r.checked} onChange={() => toggleRow(i)} style={{ width: 20, height: 20 }} />
                <span>{r.first_name} {r.last_name}</span>
                <span>{r.school}</span>
                <span>{r.subject}</span>
                <span>{r.email}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={confirmImport} style={primaryBtnStyle}>Import Selected</button>
            <button onClick={() => setPreviewRows(null)} style={ghostBtnStyle}>Cancel</button>
          </div>
        </div>
      )}

      <div style={cardStyle}>
        <h2 style={titleStyle}>Add a Teacher</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <input
            type="text"
            placeholder="First name"
            value={newFirstName}
            onChange={(e) => setNewFirstName(e.target.value)}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Last name"
            value={newLastName}
            onChange={(e) => setNewLastName(e.target.value)}
            style={inputStyle}
          />
          <button onClick={addTeacher} style={primaryBtnStyle}>Add Teacher</button>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={titleStyle}>Teachers</h2>
        {teachers.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>No teachers yet.</p>}
        {teachers.map((t) => (
          <div key={t.id} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <a href={`/teachers/${t.id}`} style={{ color: '#1F3864', fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
                {t.first_name} {t.last_name} →
              </a>
              <button onClick={() => deleteTeacher(t.id)} style={dangerBtnStyle}>Delete</button>
            </div>
            {t.assignments.length > 0 && (
              <div className="signal-scroll-x">
                <table style={{ width: '100%', fontSize: 14, marginTop: 6, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f2f4f9' }}>
                      <th style={thStyle}>School</th>
                      <th style={thStyle}>Level</th>
                      <th style={thStyle}>Subject</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>District</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.assignments.map((a) => (
                      <tr key={a.id}>
                        <td style={tdStyle}>{a.school}</td>
                        <td style={tdStyle}>{a.level}</td>
                        <td style={tdStyle}>{a.subject}</td>
                        <td style={tdStyle}>{a.email}</td>
                        <td style={tdStyle}>{a.district}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const previewRowStyle = {
  display: 'grid',
  gridTemplateColumns: '28px 1fr 1fr 1fr 1fr',
  gap: 10,
  padding: '8px 0',
  borderBottom: '1px solid #eee',
  fontSize: 14.5,
  alignItems: 'center',
};
const thStyle = { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #dde3ef' };
const tdStyle = { padding: '6px 10px', borderBottom: '1px solid #f2f2f2' };
const duplicateRowStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f2f2f2' };
const chipYellowStyle = { fontSize: 13, background: '#fff3cd', color: '#8a6d1a', padding: '3px 10px', borderRadius: 'var(--radius-pill)' };
const chipGrayChipStyle = { fontSize: 13, background: '#eee', color: '#555', padding: '3px 10px', borderRadius: 'var(--radius-pill)' };
const undoBannerStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  background: '#1F3864',
  color: '#fff',
  padding: '14px 20px',
  borderRadius: 'var(--radius-2xl)',
  marginBottom: 20,
  fontSize: 15,
  boxShadow: 'var(--shadow-soft-md)',
};
const undoBtnStyle = {
  padding: '8px 18px',
  background: '#fff',
  color: '#1F3864',
  border: 'none',
  borderRadius: 'var(--radius-pill)',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 700,
};
