'use client';

import { useEffect, useState } from 'react';
import { cardStyle, titleStyle, selectStyle, inputStyle, primaryBtnStyle, ghostBtnStyle } from '../components/ui.js';

export default function GroupsPage() {
  const [options, setOptions] = useState({ schools: [], levels: [], subjects: [], districts: [] });
  const [groups, setGroups] = useState([]);
  const [filters, setFilters] = useState({ school: '', level: '', subject: '', district: '', groupId: '', repsOnly: false, search: '' });
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState('');

  // Create-group modal state
  const [newGroupName, setNewGroupName] = useState('');
  const [modalSearch, setModalSearch] = useState('');
  const [modalResults, setModalResults] = useState([]);
  const [modalMembers, setModalMembers] = useState(new Map());

  // View/edit saved-group panel state
  const [viewGroup, setViewGroup] = useState(null); // { id, name }
  const [viewMembers, setViewMembers] = useState([]);
  const [viewName, setViewName] = useState('');
  const [viewAddSearch, setViewAddSearch] = useState('');
  const [viewAddResults, setViewAddResults] = useState([]);

  async function loadOptions() {
    const res = await fetch('/api/groups/filter-options');
    if (res.ok) setOptions(await res.json());
  }

  async function loadGroups() {
    const res = await fetch('/api/groups');
    if (res.ok) setGroups(await res.json());
  }

  async function runFilter() {
    const res = await fetch('/api/groups/filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filters),
    });
    if (res.ok) {
      setResults(await res.json());
      setSelected(new Set());
    }
  }

  useEffect(() => {
    loadOptions();
    loadGroups();
    runFilter();
  }, []);

  useEffect(() => {
    runFilter();
  }, [filters]);

  function toggleSelected(assignmentId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(results.map((r) => r.assignment_id)));
  }

  async function saveAsGroup() {
    if (selected.size === 0) return;
    const name = window.prompt('Name this group:');
    if (!name) return;

    setStatus('Saving...');
    await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, assignmentIds: [...selected] }),
    });
    setStatus('');
    await loadGroups();
    await loadOptions();
  }

  async function deleteGroup(id) {
    await fetch(`/api/groups/${id}`, { method: 'DELETE' });
    if (viewGroup?.id === id) closeViewGroup();
    await loadGroups();
  }

  // ---------- Create Group modal ----------
  async function runModalSearch(term) {
    setModalSearch(term);
    const res = await fetch('/api/groups/filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(term.trim() ? { search: term } : {}),
    });
    if (res.ok) setModalResults(await res.json());
  }

  function openCreateModal() {
    setModalOpen(true);
    runModalSearch(''); // show every teacher by default, scrollable
  }

  function addModalMember(r) {
    setModalMembers((prev) => new Map(prev).set(r.assignment_id, r));
  }

  function removeModalMember(assignmentId) {
    setModalMembers((prev) => {
      const next = new Map(prev);
      next.delete(assignmentId);
      return next;
    });
  }

  function closeModal() {
    setModalOpen(false);
    setNewGroupName('');
    setModalSearch('');
    setModalResults([]);
    setModalMembers(new Map());
  }

  async function createGroup() {
    if (!newGroupName.trim() || modalMembers.size === 0) return;

    await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGroupName.trim(), assignmentIds: [...modalMembers.keys()] }),
    });
    closeModal();
    await loadGroups();
    await loadOptions();
  }

  // ---------- View/edit saved group panel ----------
  async function openViewGroup(g) {
    setViewGroup(g);
    setViewName(g.name);
    setViewAddSearch('');
    setViewAddResults([]);
    const res = await fetch(`/api/groups/${g.id}/members`);
    if (res.ok) setViewMembers(await res.json());
  }

  function closeViewGroup() {
    setViewGroup(null);
    setViewMembers([]);
    setViewAddSearch('');
    setViewAddResults([]);
  }

  async function saveViewGroupName() {
    if (!viewName.trim() || !viewGroup) return;
    await fetch(`/api/groups/${viewGroup.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: viewName.trim() }),
    });
    await loadGroups();
    setViewGroup((g) => ({ ...g, name: viewName.trim() }));
  }

  async function removeViewMember(assignmentId) {
    if (!viewGroup) return;
    await fetch(`/api/groups/${viewGroup.id}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId }),
    });
    setViewMembers((prev) => prev.filter((m) => m.assignment_id !== assignmentId));
    await loadGroups();
  }

  async function runViewAddSearch(term) {
    setViewAddSearch(term);
    const res = await fetch('/api/groups/filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(term.trim() ? { search: term } : {}),
    });
    if (res.ok) setViewAddResults(await res.json());
  }

  async function addViewMember(r) {
    if (!viewGroup) return;
    await fetch(`/api/groups/${viewGroup.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId: r.assignment_id }),
    });
    if (!viewMembers.some((m) => m.assignment_id === r.assignment_id)) {
      setViewMembers((prev) => [...prev, r]);
    }
    await loadGroups();
  }

  // Group results by district for the accordion display
  const byDistrict = new Map();
  for (const r of results) {
    const d = r.district && r.district.trim() ? r.district.trim() : 'No District';
    if (!byDistrict.has(d)) byDistrict.set(d, []);
    byDistrict.get(d).push(r);
  }
  const sortedDistricts = [...byDistrict.keys()].sort((a, b) => a.localeCompare(b));
  const viewMemberIds = new Set(viewMembers.map((m) => m.assignment_id));

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>Filter Teachers</h2>
        <div style={filterBarStyle}>
          <select value={filters.school} onChange={(e) => setFilters({ ...filters, school: e.target.value })} style={selectStyle}>
            <option value="">All Schools</option>
            {options.schools.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })} style={selectStyle}>
            <option value="">All Levels</option>
            {options.levels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })} style={selectStyle}>
            <option value="">All Subjects</option>
            {options.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.district} onChange={(e) => setFilters({ ...filters, district: e.target.value })} style={selectStyle}>
            <option value="">All Districts</option>
            {options.districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filters.groupId} onChange={(e) => setFilters({ ...filters, groupId: e.target.value })} style={selectStyle}>
            <option value="">All Groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div style={{ ...filterBarStyle, marginTop: 8 }}>
          <input
            type="text"
            placeholder="Search name..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            style={inputStyle}
          />
          <label style={{ fontSize: 15, color: '#555' }}>
            <input
              type="checkbox"
              checked={filters.repsOnly}
              onChange={(e) => setFilters({ ...filters, repsOnly: e.target.checked })}
              style={{ width: 20, height: 20, marginRight: 4 }}
            /> District Reps only
          </label>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={titleStyle}>Results</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button onClick={selectAll} style={ghostBtnStyle}>Select All</button>
          <button onClick={saveAsGroup} style={ghostBtnStyle}>Save as Group</button>
          <span style={{ fontSize: 15, color: '#666', alignSelf: 'center' }}>{status}</span>
        </div>
        {sortedDistricts.length === 0 && <p style={{ color: '#666' }}>No matching teachers.</p>}
        {sortedDistricts.map((district) => (
          <details key={district} style={accordionStyle}>
            <summary style={summaryStyle}>{district} ({byDistrict.get(district).length})</summary>
            {byDistrict.get(district)
              .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`))
              .map((r) => (
                <div key={r.assignment_id} style={resultRowStyle}>
                  <input type="checkbox" checked={selected.has(r.assignment_id)} onChange={() => toggleSelected(r.assignment_id)} style={{ width: 20, height: 20 }} />
                  <span>{r.first_name} {r.last_name} {r.is_district_rep && <span style={repChipStyle}>Rep</span>}</span>
                  <span>{r.school}</span>
                  <span>{r.subject}</span>
                  <span>{r.email}</span>
                </div>
              ))}
          </details>
        ))}
      </div>

      <div style={cardStyle}>
        <h2 style={titleStyle}>Saved Groups</h2>
        <div style={{ marginBottom: 10 }}>
          <button onClick={openCreateModal} style={primaryBtnStyle}>+ Create Group</button>
        </div>
        {groups.length === 0 && <p style={{ color: '#666' }}>No saved groups yet.</p>}
        {groups.map((g) => (
          <div key={g.id} style={groupRowStyle}>
            <span style={{ cursor: 'pointer' }} onClick={() => openViewGroup(g)}>
              {g.name} — {g.member_count} member(s)
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => openViewGroup(g)} style={ghostBtnStyle}>View / Edit</button>
              <button onClick={() => deleteGroup(g.id)} style={ghostBtnStyle}>Delete</button>
            </span>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div style={modalOverlayStyle} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div style={modalContentStyle}>
            <h2 style={titleStyle}>Create Group</h2>
            <input
              type="text"
              placeholder="Group name..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: 8 }}
            />
            <input
              type="text"
              placeholder="Search teachers (or scroll the full list below)..."
              value={modalSearch}
              onChange={(e) => runModalSearch(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: 8 }}
            />
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)' }}>
              {modalResults.length === 0 && <p style={{ color: '#666', fontSize: 15, padding: 10 }}>No teachers found.</p>}
              {modalResults.map((r) => (
                <div key={r.assignment_id} style={modalResultRowStyle}>
                  <span>{r.first_name} {r.last_name} — {r.email}</span>
                  <button
                    onClick={() => addModalMember(r)}
                    disabled={modalMembers.has(r.assignment_id)}
                    style={ghostBtnStyle}
                  >
                    {modalMembers.has(r.assignment_id) ? 'Added' : '+ Add'}
                  </button>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 14, marginTop: 16, marginBottom: 8, color: '#666' }}>Selected Members</h3>
            {[...modalMembers.values()].map((r) => (
              <div key={r.assignment_id} style={modalResultRowStyle}>
                <span>{r.first_name} {r.last_name}</span>
                <button onClick={() => removeModalMember(r.assignment_id)} style={ghostBtnStyle}>Remove</button>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={createGroup} style={primaryBtnStyle}>Create Group</button>
              <button onClick={closeModal} style={ghostBtnStyle}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {viewGroup && (
        <div style={modalOverlayStyle} onClick={(e) => e.target === e.currentTarget && closeViewGroup()}>
          <div style={modalContentStyle}>
            <h2 style={titleStyle}>Edit Group</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                type="text"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={saveViewGroupName} style={primaryBtnStyle}>Save Name</button>
            </div>

            <h3 style={{ fontSize: 14, marginBottom: 8, color: '#666' }}>Members ({viewMembers.length})</h3>
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
              {viewMembers.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>No members yet.</p>}
              {viewMembers.map((m) => (
                <div key={m.assignment_id} style={modalResultRowStyle}>
                  <span>{m.first_name} {m.last_name} — {m.email}</span>
                  <button onClick={() => removeViewMember(m.assignment_id)} style={ghostBtnStyle}>Remove</button>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 14, marginBottom: 8, color: '#666' }}>Add Person</h3>
            <input
              type="text"
              placeholder="Search teachers (or scroll the full list below)..."
              value={viewAddSearch}
              onChange={(e) => runViewAddSearch(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: 8 }}
            />
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)' }}>
              {viewAddResults.map((r) => (
                <div key={r.assignment_id} style={modalResultRowStyle}>
                  <span>{r.first_name} {r.last_name} — {r.email}</span>
                  <button
                    onClick={() => addViewMember(r)}
                    disabled={viewMemberIds.has(r.assignment_id)}
                    style={ghostBtnStyle}
                  >
                    {viewMemberIds.has(r.assignment_id) ? 'Added' : '+ Add'}
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={closeViewGroup} style={ghostBtnStyle}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const filterBarStyle = { display: 'flex', gap: 10, flexWrap: 'wrap' };
const accordionStyle = { border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', marginBottom: 10, padding: '0 12px' };
const summaryStyle = { cursor: 'pointer', padding: '10px 0', fontWeight: 700, color: '#1F3864', fontSize: 15 };
const resultRowStyle = { display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 10, padding: '8px 0', borderBottom: '1px solid #f2f2f2', fontSize: 14.5, alignItems: 'center', overflowWrap: 'anywhere' };
const repChipStyle = { fontSize: 12, background: '#e6f4ea', color: '#1e6e34', padding: '2px 8px', borderRadius: 'var(--radius-pill)' };
const groupRowStyle = { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid #f2f2f2', fontSize: 15 };
const modalOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalContentStyle = { background: '#fff', borderRadius: 'var(--radius-3xl)', padding: 24, width: '90%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto' };
const modalResultRowStyle = { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f2f2f2', fontSize: 14.5 };
