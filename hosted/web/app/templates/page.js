'use client';

import { useEffect, useRef, useState } from 'react';
import HelpBubble from '../components/HelpBubble.js';
import { useUndoBar } from '../components/UndoBar.js';

// "Letters": Word (.docx) letters with [Blanks] that Signal fills in per
// person. Each blank has to be linked to a detail (First name, Email...)
// once, before the letter can be used in Write Email.
export default function LettersPage() {
  const [letters, setLetters] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [labelMaps, setLabelMaps] = useState([]);
  const [fields, setFields] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);
  const undo = useUndoBar();

  async function load() {
    try {
      const res = await fetch('/api/templates');
      setLetters(res.ok ? await res.json() : []);
    } catch {
      setLetters([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function openLetter(id) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setLabelMaps([]);
    const res = await fetch(`/api/templates/${id}/label-maps`);
    if (res.ok) {
      const data = await res.json();
      setLabelMaps(data.labelMaps);
      setFields(data.availableFields);
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setMessage('Reading your letter…');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/templates', { method: 'POST', body: formData });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessage(
        data.labels.length
          ? `Added ✓ Found ${data.labels.length} ${data.labels.length === 1 ? 'blank' : 'blanks'}: ${data.labels.map((l) => `[${l}]`).join(' ')}`
          : 'Added ✓ No [blanks] found, so everyone will get the same letter.'
      );
      await load();
      await openLetter(data.templateId);
    } catch {
      setMessage('That file couldn’t be read. Is it a Word (.docx) file?');
    }
    setUploading(false);
  }

  async function setMapping(labelMapId, column) {
    setLabelMaps((prev) => prev.map((lm) => (lm.id === labelMapId ? { ...lm, matched_column: column || null } : lm)));
    await fetch(`/api/templates/${openId}/label-maps`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labelMapId, matchedColumn: column || null }),
    });
    await load();
  }

  async function trash(letter) {
    await fetch(`/api/templates/${letter.id}`, { method: 'DELETE' });
    if (openId === letter.id) setOpenId(null);
    undo.show(`“${niceName(letter)}” moved to Trash`, async () => {
      await fetch('/api/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'letter', id: letter.id }),
      });
      await load();
    });
    await load();
  }

  return (
    <div className="signal-home">
      <header className="signal-home-header">
        <div className="signal-title-row">
          <h1 className="signal-home-title">Letters</h1>
          <HelpBubble text="A letter is a Word document you send often. Put blanks in square brackets, like [First], and Signal fills in each person's details for you." />
        </div>
        <p className="signal-home-sub">
          Saved letters for this workspace. Write blanks in your Word document like <strong>[First]</strong> or <strong>[School]</strong>, and each person gets their own copy.
        </p>
      </header>

      <div className="signal-people-actions">
        <button type="button" className="signal-btn-add" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <span aria-hidden="true">+</span> {uploading ? 'Adding…' : 'Add a letter (.docx)'}
        </button>
        <input ref={fileRef} type="file" accept=".docx" className="signal-visually-hidden" onChange={onFile} tabIndex={-1} aria-hidden="true" />
      </div>
      {message && <p className="signal-inline-message" role="status">{message}</p>}

      {letters === null && <p className="signal-home-empty">Loading…</p>}
      {letters && letters.length === 0 && (
        <div className="signal-empty-big">
          <p className="signal-empty-big-title">No letters yet.</p>
          <p className="signal-home-sub">Add a Word document you send often. You can always just write a message in Write Email instead.</p>
        </div>
      )}

      {letters && letters.length > 0 && (
        <ul className="signal-people-list">
          {letters.map((l) => {
            const ready = l.unmapped_count === 0;
            const isOpen = openId === l.id;
            return (
              <li key={l.id} className={`signal-letter-item${isOpen ? ' open' : ''}`}>
                <div className="signal-member-row">
                  <button type="button" className="signal-member-who signal-plain-btn" onClick={() => openLetter(l.id)} aria-expanded={isOpen}>
                    <span className="signal-person-name">📄 {niceName(l)}</span>
                    <span className={`signal-person-meta${ready ? ' signal-ok' : ' signal-warn'}`}>
                      {ready ? 'Ready to use ✓' : `Needs setting up: ${l.unmapped_count} ${l.unmapped_count === 1 ? 'blank' : 'blanks'} to link`}
                    </span>
                  </button>
                  <button type="button" className="signal-btn-ghost signal-btn-small" onClick={() => openLetter(l.id)}>
                    {isOpen ? 'Close' : ready ? 'See blanks' : 'Set up'}
                  </button>
                  <button type="button" className="signal-icon-btn" onClick={() => trash(l)} aria-label={`Move ${niceName(l)} to Trash`} title="Move to Trash">🗑</button>
                </div>

                {isOpen && (
                  <div className="signal-wizard-panel signal-letter-setup">
                    {labelMaps.length === 0 ? (
                      <p className="signal-home-sub">This letter has no [blanks], so everyone gets the same words.</p>
                    ) : (
                      <>
                        <p className="signal-home-sub">For each blank, choose what to fill in. This is saved right away.</p>
                        {labelMaps.map((lm) => (
                          <div key={lm.id} className="signal-blank-row">
                            <label htmlFor={`lm-${lm.id}`} className="signal-blank-label">
                              Fill in <code>[{lm.label_name}]</code> with:
                            </label>
                            <select
                              id={`lm-${lm.id}`}
                              className={`signal-status-select${lm.matched_column ? ' set' : ''}`}
                              value={lm.matched_column || ''}
                              onChange={(e) => setMapping(lm.id, e.target.value)}
                            >
                              <option value="">— Choose —</option>
                              {fields.map((f) => (
                                <option key={f.column} value={f.column}>{f.label}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {undo.bar}
    </div>
  );
}

function niceName(letter) {
  return letter.file_name.replace(/\.docx$/i, '');
}
