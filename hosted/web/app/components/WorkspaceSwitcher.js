'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.js';

export const WORKSPACE_EMOJIS = ['🎵', '⛪', '🏫', '🎺', '🎻', '🎹', '🎤', '🥁', '⭐', '🏠', '💼', '❤️'];
export const WORKSPACE_COLORS = [
  { value: '#1F3864', name: 'Navy' },
  { value: '#C1272D', name: 'Red' },
  { value: '#1e6e34', name: 'Green' },
  { value: '#5b3a8c', name: 'Purple' },
  { value: '#0f6b6b', name: 'Teal' },
  { value: '#8a5a00', name: 'Gold' },
];

// The big "Working on: ⛪ Church ▾" button in the top bar. Switching
// reloads the page so every screen re-reads its data for the new workspace
// — simplest way to guarantee nothing from the old one lingers on screen.
export default function WorkspaceSwitcher() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState(null); // null | { mode: 'new' | 'edit', ... }
  const wrapRef = useRef(null);

  async function load() {
    try {
      const res = await fetch('/api/workspaces');
      if (res.ok) setData(await res.json());
    } catch {
      // Leave the switcher hidden rather than break the header.
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (!data) return <div className="signal-ws-placeholder" />;

  const { current, workspaces } = data;

  async function switchTo(id) {
    if (id === current.id) {
      setOpen(false);
      return;
    }
    await fetch('/api/workspaces/current', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: id }),
    });
    window.location.reload();
  }

  return (
    <div className="signal-ws" ref={wrapRef}>
      <button
        type="button"
        className="signal-ws-button"
        style={{ borderColor: current.color || '#1F3864' }}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Working on ${current.name}. Click to switch workspace.`}
      >
        <span className="signal-ws-label">Working on</span>
        <span className="signal-ws-current">
          <span className="signal-ws-emoji" aria-hidden="true">{current.emoji || '📁'}</span>
          <span className="signal-ws-name">{current.name}</span>
          <span className="signal-ws-caret" aria-hidden="true">▾</span>
        </span>
      </button>

      {open && (
        <div className="signal-ws-menu" role="menu">
          <p className="signal-ws-help">Each workspace keeps its own people, lists, and letters. Pick one to work in.</p>

          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitem"
              className={`signal-ws-item${w.id === current.id ? ' current' : ''}`}
              onClick={() => switchTo(w.id)}
            >
              <span className="signal-ws-item-emoji" style={{ background: tint(w.color) }} aria-hidden="true">
                {w.emoji || '📁'}
              </span>
              <span className="signal-ws-item-text">
                <span className="signal-ws-item-name">{w.name}</span>
                <span className="signal-ws-item-meta">
                  {w.people_count} {w.people_count === 1 ? 'person' : 'people'} · {w.list_count} {w.list_count === 1 ? 'list' : 'lists'}
                </span>
              </span>
              {w.id === current.id && <span className="signal-ws-check" aria-label="Current workspace">✓</span>}
            </button>
          ))}

          <div className="signal-ws-actions">
            <button
              type="button"
              className="signal-ws-new"
              onClick={() => {
                setOpen(false);
                setEditor({ mode: 'new', name: '', emoji: WORKSPACE_EMOJIS[0], color: WORKSPACE_COLORS[0].value });
              }}
            >
              + New workspace
            </button>
            <button
              type="button"
              className="signal-ws-edit"
              onClick={() => {
                setOpen(false);
                setEditor({
                  mode: 'edit',
                  id: current.id,
                  name: current.name,
                  emoji: current.emoji || WORKSPACE_EMOJIS[0],
                  color: current.color || WORKSPACE_COLORS[0].value,
                });
              }}
            >
              ✎ Rename “{current.name}”
            </button>
          </div>
        </div>
      )}

      {editor && <WorkspaceEditor editor={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}

function WorkspaceEditor({ editor, onClose }) {
  const [name, setName] = useState(editor.name);
  const [emoji, setEmoji] = useState(editor.emoji);
  const [color, setColor] = useState(editor.color);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isNew = editor.mode === 'new';

  async function save(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please type a name, like “Church” or “DMEA”.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(isNew ? '/api/workspaces' : `/api/workspaces/${editor.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), emoji, color }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Something went wrong. Please try again.');
        setSaving(false);
        return;
      }
      window.location.reload();
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  return (
    <Modal as="form" onSubmit={save} onClose={onClose} labelledBy="ws-editor-title">
        <h2 id="ws-editor-title" className="signal-modal-title">{isNew ? 'New workspace' : 'Rename workspace'}</h2>
        {isNew && <p className="signal-modal-help">Make one for each group you email for — for example DMEA, Church, or School.</p>}

        <label className="signal-field-label" htmlFor="ws-name">Name</label>
        <input
          id="ws-name"
          className="signal-big-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Church"
          autoFocus
          maxLength={80}
        />

        <span className="signal-field-label">Picture</span>
        <div className="signal-choice-grid" role="radiogroup" aria-label="Picture">
          {WORKSPACE_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              role="radio"
              aria-checked={emoji === em}
              className={`signal-emoji-choice${emoji === em ? ' selected' : ''}`}
              onClick={() => setEmoji(em)}
            >
              {em}
            </button>
          ))}
        </div>

        <span className="signal-field-label">Color</span>
        <div className="signal-choice-grid" role="radiogroup" aria-label="Color">
          {WORKSPACE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={color === c.value}
              aria-label={c.name}
              title={c.name}
              className={`signal-color-choice${color === c.value ? ' selected' : ''}`}
              style={{ background: c.value }}
              onClick={() => setColor(c.value)}
            >
              {color === c.value ? '✓' : ''}
            </button>
          ))}
        </div>

        {error && <p className="signal-modal-error" role="alert">{error}</p>}

        <div className="signal-modal-buttons">
          <button type="button" className="signal-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="signal-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create workspace' : 'Save'}
          </button>
        </div>
    </Modal>
  );
}

function tint(color) {
  // Soft background behind the emoji, derived from the workspace color.
  return `${color || '#1F3864'}1f`;
}
