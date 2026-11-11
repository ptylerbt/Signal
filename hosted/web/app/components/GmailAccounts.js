'use client';

import { useEffect, useState } from 'react';

// What Google's permission screen sent back, in plain words. The result
// arrives as ?gmail=... on the page address after connecting.
export const RESULT_MESSAGES = {
  connected: { good: true, text: (account) => `Connected ✓ ${account || 'Your Gmail account'} is ready to send.` },
  cancelled: { text: () => 'Nothing was added. Google’s screen was closed before finishing.' },
  nopermission: {
    text: () => 'That account wasn’t added, because the “Send email on your behalf” box wasn’t ticked. Please try again and tick that box.',
  },
  ownaccount: {
    text: (account) =>
      `${account || 'That account'} is your own Gmail, so it was not added to their Signal. Try again and choose “Use another account” on Google’s screen.`,
  },
  notready: { text: () => 'Gmail sending isn’t set up yet. Please ask Tyler.' },
  failed: { text: () => 'That didn’t work. Please try again.' },
};

// Reads ?gmail=... once, then tidies it out of the address bar so a
// refresh doesn't show the message again.
export function useGmailResult() {
  const [result, setResult] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('gmail');
    if (code && RESULT_MESSAGES[code]) {
      setResult({ code, ...RESULT_MESSAGES[code], account: params.get('account') });
      params.delete('gmail');
      params.delete('account');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
  }, []);
  return [result, setResult];
}

export function GmailResult({ result }) {
  if (!result) return null;
  return (
    <p className={`signal-gmail-result${result.good ? ' good' : ''}`} role="status">
      {result.text(result.account)}
    </p>
  );
}

// Loads the connected accounts plus, in admin View As, who is being viewed.
export function useGmailAccounts() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/gmail/accounts');
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return { data, failed, reload: load };
}

// The list of connected Gmail accounts, with one big button to add another.
// `from` says which page to come back to after adding ('settings' or
// 'compose'). The button goes to the step-by-step guide first.
export default function GmailAccounts({ from = 'settings' }) {
  const { data, failed, reload } = useGmailAccounts();
  const [result, setResult] = useGmailResult();
  const [confirmId, setConfirmId] = useState(null);

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
    await reload();
  }

  if (failed) return <p className="signal-gmail-empty">Your Gmail accounts didn’t load. Please refresh the page.</p>;
  if (!data) return <p className="signal-gmail-empty">Loading…</p>;

  const { accounts, viewingAs } = data;

  return (
    <div className="signal-gmail">
      <GmailResult result={result} />

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

      <a href={`/connect-gmail?from=${from}`} className="signal-btn-primary signal-gmail-add">
        <span aria-hidden="true">＋</span> Add a Gmail account
      </a>
      <p className="signal-gmail-hint">
        A short guide shows you each step. Signal can only send email. It cannot read your inbox.
      </p>

      {viewingAs && <SetupLink viewingAs={viewingAs} />}
    </div>
  );
}

// Admin only (View As): a link to text or email the member. Opening it,
// signed in as themselves, shows the same guide and adds the account to
// their own Signal, so nobody has to share a password.
function SetupLink({ viewingAs }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/connect-gmail`;
  const subject = 'Add your Gmail to Signal';
  const body =
    `Hi ${viewingAs.name},\n\n` +
    `Please open this link to connect your Gmail to Signal:\n${link}\n\n` +
    'It shows you every step. Call me if you get stuck!';

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      window.prompt('Copy this link:', link);
    }
  }

  return (
    <div className="signal-gmail-admin">
      <h3 className="signal-gmail-admin-title">Send {viewingAs.name} a setup link</h3>
      <p>
        Instead of adding it yourself, text or email {viewingAs.name} this link. When {viewingAs.name} opens it, Signal walks
        through each step, and the account is added to their own Signal. No passwords need to be shared.
      </p>
      <p className="signal-gmail-link">{link}</p>
      <div className="signal-gmail-admin-actions">
        <button type="button" className="signal-btn-primary" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
        {viewingAs.email && (
          <a
            className="signal-btn-ghost"
            href={`mailto:${encodeURIComponent(viewingAs.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
          >
            Email it to {viewingAs.name}
          </a>
        )}
      </div>
    </div>
  );
}
