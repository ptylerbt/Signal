'use client';

import { useEffect, useState } from 'react';

// What Google's permission screen sent back, in plain words. The result
// arrives as ?gmail=... on the page address after connecting.
const RESULT_MESSAGES = {
  connected: { good: true, text: (account) => `Connected ✓ ${account || 'Your Gmail account'} is ready to send.` },
  cancelled: { text: () => 'Nothing was added. You closed Google’s screen before finishing.' },
  nopermission: {
    text: () => 'That account wasn’t added, because the “Send email on your behalf” box wasn’t ticked. Please try again and tick that box.',
  },
  viewing: { text: () => 'You are viewing someone else’s account, so Gmail accounts can’t be added here.' },
  notready: { text: () => 'Gmail sending isn’t set up yet. Please ask Tyler.' },
  failed: { text: () => 'That didn’t work. Please try again.' },
};

// The list of connected Gmail accounts, with one big button to add another.
// `from` says which page Google should send her back to ('settings' or
// 'compose'). `onChange` fires with the fresh list whenever it loads.
export default function GmailAccounts({ from = 'settings', onChange }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  async function load() {
    try {
      const res = await fetch('/api/gmail/accounts');
      if (!res.ok) throw new Error();
      const next = await res.json();
      setData(next);
      if (onChange) onChange(next.accounts);
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    load();

    // Show the result once, then tidy it out of the address bar so a
    // refresh doesn't show it again.
    const params = new URLSearchParams(window.location.search);
    const code = params.get('gmail');
    if (code && RESULT_MESSAGES[code]) {
      setResult({ ...RESULT_MESSAGES[code], account: params.get('account') });
      params.delete('gmail');
      params.delete('account');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
  }, []);

  async function remove(id) {
    setConfirmId(null);
    setResult(null);
    const res = await fetch(`/api/gmail/accounts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const { email } = await res.json();
      setResult({ good: true, text: () => `${email} was removed. You can add it again any time.` });
    } else {
      setResult(RESULT_MESSAGES.failed);
    }
    await load();
  }

  if (failed) return <p className="signal-gmail-empty">Your Gmail accounts didn’t load. Please refresh the page.</p>;
  if (!data) return <p className="signal-gmail-empty">Loading…</p>;

  const { accounts, viewingAs } = data;

  return (
    <div className="signal-gmail">
      {result && (
        <p className={`signal-gmail-result${result.good ? ' good' : ''}`} role="status">
          {result.text(result.account)}
        </p>
      )}

      {accounts.length === 0 ? (
        <p className="signal-gmail-empty">No Gmail account is connected yet. Add one to start sending.</p>
      ) : (
        <ul className="signal-gmail-list">
          {accounts.map((a) => (
            <li key={a.id} className="signal-gmail-row">
              <span className="signal-gmail-email">
                <span aria-hidden="true">✉</span> {a.email}
              </span>
              {confirmId === a.id ? (
                <span className="signal-gmail-confirm">
                  <span>Remove this account?</span>
                  <button type="button" className="signal-btn-danger" onClick={() => remove(a.id)}>Yes, remove</button>
                  <button type="button" className="signal-btn-ghost" onClick={() => setConfirmId(null)}>Keep it</button>
                </span>
              ) : (
                <button type="button" className="signal-gmail-remove" onClick={() => setConfirmId(a.id)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {viewingAs ? (
        <p className="signal-gmail-empty">Only the account’s owner can add a Gmail account.</p>
      ) : (
        <>
          <a href={`/api/gmail/connect?from=${from}`} className="signal-btn-primary signal-gmail-add">
            <span aria-hidden="true">＋</span> Add a Gmail account
          </a>
          <p className="signal-gmail-hint">
            Google will ask you to pick an account and allow Signal to send email. Signal can only send. It cannot read your inbox.
          </p>
        </>
      )}
    </div>
  );
}
