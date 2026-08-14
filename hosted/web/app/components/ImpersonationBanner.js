'use client';

import { useEffect, useState } from 'react';

export default function ImpersonationBanner() {
  const [me, setMe] = useState(null);

  async function load() {
    const res = await fetch('/api/me');
    if (res.ok) setMe(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  if (!me || !me.isImpersonating) return null;

  async function stop() {
    await fetch('/api/admin/view-as', { method: 'DELETE' });
    window.location.href = '/admin';
  }

  return (
    <div className="signal-impersonation-banner">
      <span>
        Viewing as <strong>{me.viewAsName}</strong> — anything you do here affects their account, not yours.
      </span>
      <button onClick={stop} className="signal-impersonation-stop">Stop Viewing As</button>
    </div>
  );
}
