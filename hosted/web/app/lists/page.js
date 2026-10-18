'use client';

import { useEffect, useState } from 'react';
import ListsGrid from '../components/ListsGrid.js';

export default function ListsPage() {
  const [lists, setLists] = useState(null);
  const [failed, setFailed] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/lists');
      if (!res.ok) throw new Error();
      setLists(await res.json());
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="signal-home">
      <header className="signal-home-header">
        <h1 className="signal-home-title">Lists</h1>
        <p className="signal-home-sub">A list is a group of people you email together, like “Choir Members” or “Festival Judges”.</p>
      </header>

      {failed && <p className="signal-home-empty">Something went wrong loading your lists. Please refresh the page.</p>}
      {!failed && !lists && <p className="signal-home-empty">Loading…</p>}
      {lists && <ListsGrid lists={lists} onCreated={load} />}
    </div>
  );
}
