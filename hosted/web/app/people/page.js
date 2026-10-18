'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AddPersonModal from '../components/AddPersonModal.js';
import HelpBubble from '../components/HelpBubble.js';
import { useUndoBar, undoRosterSnapshot } from '../components/UndoBar.js';

export default function PeoplePage() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState('');
  const [importRows, setImportRows] = useState(null); // review step
  const [importSummary, setImportSummary] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const undo = useUndoBar();

  async function load() {
    try {
      const res = await fetch('/api/people');
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.people;
    return data.people.filter((p) => {
      const haystack = [p.first_name, p.last_name, ...p.assignments.flatMap((a) => [a.email, a.subject, a.school, a.level])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, search]);

  async function onFileChosen(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setMessage('Reading your file…');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/roster/preview', { method: 'POST', body: formData });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error || 'That file couldn’t be read. Is it an Excel (.xlsx) file?');
        return;
      }
      const fresh = body.rows.filter((r) => !r.isDuplicate);
      setImportRows(fresh.map((r) => ({ ...r, checked: true })));
      setImportSummary(
        body.duplicateCount > 0
          ? `${fresh.length} new ${fresh.length === 1 ? 'person' : 'people'} found. ${body.duplicateCount} already here ${body.duplicateCount === 1 ? 'was' : 'were'} skipped.`
          : `${fresh.length} ${fresh.length === 1 ? 'person' : 'people'} found.`
      );
      setMessage('');
    } catch {
      setMessage('That file couldn’t be read. Is it an Excel (.xlsx) file?');
    }
  }

  async function confirmImport() {
    const selected = importRows.filter((r) => r.checked);
    if (selected.length === 0) {
      setImportRows(null);
      return;
    }
    setImporting(true);
    try {
      const res = await fetch('/api/people/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: selected }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setImportRows(null);
      undo.show(`Imported ${body.count} ${body.count === 1 ? 'row' : 'rows'}`, async () => {
        await undoRosterSnapshot(body.undo);
        await load();
      });
      await load();
    } catch (err) {
      setMessage(err.message || 'The import didn’t work. Please try again.');
    }
    setImporting(false);
  }

  if (failed) return <p className="signal-home-empty">Something went wrong loading People. Please refresh the page.</p>;
  if (!data) return <p className="signal-home-empty">Loading…</p>;

  const { workspace, people } = data;

  return (
    <div className="signal-home">
      <header className="signal-home-header">
        <div className="signal-title-row">
          <h1 className="signal-home-title">People</h1>
          <HelpBubble text="Everyone you email in this workspace. Add someone with the big button, or bring in a whole Excel sheet at once." />
        </div>
        <p className="signal-home-sub">Everyone in <strong>{workspace.emoji} {workspace.name}</strong>. Click a name to see or change their details.</p>
      </header>

      <div className="signal-people-actions">
        <button type="button" className="signal-btn-add" onClick={() => setAdding(true)}>
          <span aria-hidden="true">+</span> Add Person
        </button>
        <button type="button" className="signal-btn-ghost" onClick={() => fileRef.current?.click()}>Import from Excel</button>
        <a className="signal-btn-ghost signal-btn-link" href="/api/people/template">Download blank sheet</a>
        <HelpBubble text="Download an empty Excel sheet with the right columns. Fill it in, save it, then press Import from Excel." />
        <input ref={fileRef} type="file" accept=".xlsx" className="signal-visually-hidden" onChange={onFileChosen} tabIndex={-1} aria-hidden="true" />
      </div>

      {message && <p className="signal-inline-message" role="status">{message}</p>}

      {importRows && (
        <section className="signal-import-review" aria-labelledby="import-title">
          <h2 id="import-title" className="signal-home-section-title">Check before importing</h2>
          <p className="signal-home-sub">{importSummary} Untick anyone you don’t want.</p>
          {importRows.length === 0 ? (
            <p className="signal-home-empty">Everyone in this file is already here. Nothing new to import.</p>
          ) : (
            <ul className="signal-import-list">
              {importRows.map((r, i) => (
                <li key={i}>
                  <label className="signal-import-row">
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={() => setImportRows((rows) => rows.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))}
                    />
                    <span className="signal-import-name">{[r.first_name, r.last_name].filter(Boolean).join(' ')}</span>
                    <span className="signal-import-meta">{[r.email, r.subject, r.school].filter(Boolean).join(' · ')}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="signal-modal-buttons" style={{ justifyContent: 'flex-start' }}>
            {importRows.length > 0 && (
              <button type="button" className="signal-btn-primary" onClick={confirmImport} disabled={importing}>
                {importing ? 'Importing…' : `Import ${importRows.filter((r) => r.checked).length} ${importRows.filter((r) => r.checked).length === 1 ? 'person' : 'people'}`}
              </button>
            )}
            <button type="button" className="signal-btn-ghost" onClick={() => setImportRows(null)}>Cancel</button>
          </div>
        </section>
      )}

      {people.length === 0 ? (
        <div className="signal-empty-big">
          <p className="signal-empty-big-title">No one in {workspace.name} yet.</p>
          <p className="signal-home-sub">Add people one at a time, or import a whole Excel sheet.</p>
          <button type="button" className="signal-btn-add" onClick={() => setAdding(true)}>
            <span aria-hidden="true">+</span> Add Person
          </button>
        </div>
      ) : (
        <>
          <label htmlFor="people-search" className="signal-visually-hidden">Find someone</label>
          <input
            id="people-search"
            className="signal-big-input signal-search"
            placeholder={`Find someone… (${people.length} ${people.length === 1 ? 'person' : 'people'})`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filtered.length === 0 && <p className="signal-home-empty">No one matches “{search}”.</p>}
          <ul className="signal-people-list">
            {filtered.map((p) => (
              <li key={p.id}>
                <a href={`/people/${p.id}`} className="signal-person-row">
                  <span className="signal-person-avatar" aria-hidden="true">{initials(p)}</span>
                  <span className="signal-person-text">
                    <span className="signal-person-name">{[p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)'}</span>
                    <span className="signal-person-meta">{summary(p)}</span>
                  </span>
                  <span className="signal-person-arrow" aria-hidden="true">›</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {adding && (
        <AddPersonModal
          onClose={() => setAdding(false)}
          onAdded={async (result) => {
            setAdding(false);
            setMessage(
              result.alreadyHere
                ? `${result.name} was already here, so nothing changed.`
                : result.reused
                  ? `${result.name} was already in another workspace, so they've been added here too.`
                  : `${result.name} was added.`
            );
            await load();
          }}
        />
      )}

      {undo.bar}
    </div>
  );
}

function initials(p) {
  return ((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || '') || '?';
}

function summary(p) {
  const a = p.assignments[0];
  const parts = [];
  if (a?.email) parts.push(a.email);
  const roles = [...new Set(p.assignments.map((x) => x.subject).filter(Boolean))].join(', ');
  if (roles) parts.push(roles);
  if (p.list_count) parts.push(`in ${p.list_count} ${p.list_count === 1 ? 'list' : 'lists'}`);
  return parts.join(' · ') || 'No email yet';
}
