'use client';

import { useEffect, useState } from 'react';
import HelpBubble from '../components/HelpBubble.js';

const SECTIONS = [
  { key: 'people', type: 'person', title: 'People', label: (x) => [x.first_name, x.last_name].filter(Boolean).join(' ') || '(no name)', sub: (x) => x.email },
  { key: 'lists', type: 'list', title: 'Lists', label: (x) => x.name, sub: (x) => `From ${x.workspace_name}${x.workspace_trashed ? ' (that workspace is in Trash too — put it back first to see this list)' : ''}` },
  { key: 'workspaces', type: 'workspace', title: 'Workspaces', label: (x) => `${x.emoji || '📁'} ${x.name}`, sub: () => 'Its people, lists, and notes come back with it' },
  { key: 'notes', type: 'note', title: 'Notes', label: (x) => x.note_text, sub: () => null },
  { key: 'letters', type: 'letter', title: 'Letters', label: (x) => x.file_name.replace(/\.docx$/i, ''), sub: () => null },
];

export default function TrashPage() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [restored, setRestored] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/trash');
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function putBack(section, item) {
    const res = await fetch('/api/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: section.type, id: item.id }),
    });
    if (res.ok) {
      setRestored(`“${truncate(section.label(item))}” is back ✓`);
      setTimeout(() => setRestored(''), 3000);
    }
    await load();
  }

  if (failed) return <p className="signal-home-empty">Something went wrong loading Trash. Please refresh the page.</p>;
  if (!data) return <p className="signal-home-empty">Loading…</p>;

  const total = SECTIONS.reduce((n, s) => n + data[s.key].length, 0);

  return (
    <div className="signal-home">
      <header className="signal-home-header">
        <div className="signal-title-row">
          <h1 className="signal-home-title">Trash</h1>
          <HelpBubble text={`Anything you delete waits here for ${data.days} days. Press “Put back” to undo it. After ${data.days} days it’s gone for good.`} />
        </div>
        <p className="signal-home-sub">Deleted things wait here for {data.days} days, from every workspace. Press <strong>Put back</strong> to bring one back.</p>
      </header>

      {restored && <p className="signal-inline-message" role="status">{restored}</p>}

      {total === 0 && (
        <div className="signal-empty-big">
          <p className="signal-empty-big-title">Trash is empty.</p>
          <p className="signal-home-sub">Nothing has been deleted recently.</p>
        </div>
      )}

      {SECTIONS.filter((s) => data[s.key].length > 0).map((s) => (
        <section key={s.key} className="signal-home-section" aria-labelledby={`trash-${s.key}`}>
          <h2 id={`trash-${s.key}`} className="signal-home-section-title">{s.title}</h2>
          <ul className="signal-people-list">
            {data[s.key].map((item) => (
              <li key={item.id} className="signal-member-row">
                <span className="signal-member-who">
                  <span className="signal-person-name">{truncate(s.label(item))}</span>
                  <span className="signal-person-meta">
                    {[s.sub(item), daysLeft(item.deleted_at, data.days)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button type="button" className="signal-btn-primary signal-btn-small" onClick={() => putBack(s, item)}>↩ Put back</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function truncate(text, n = 90) {
  const t = String(text || '');
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function daysLeft(deletedAt, days) {
  const left = Math.ceil(days - (Date.now() - new Date(deletedAt).getTime()) / 86400000);
  if (left <= 1) return 'Gone for good tomorrow';
  return `${left} days left`;
}
