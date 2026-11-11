'use client';

import { useEffect, useState } from 'react';
import { useGmailAccounts, useGmailResult, GmailResult } from '../components/GmailAccounts.js';

// Where she comes back to after Google's screens.
const BACK_LINKS = {
  compose: { href: '/compose', label: 'Back to Write Email' },
  settings: { href: '/settings', label: 'Back to Settings' },
};

// "Add a Gmail account", one step at a time. Google's screens can't be
// changed, so this shows a simple picture of each one with the exact thing
// to press marked. Also the page the admin's setup link points to.
export default function ConnectGmailPage() {
  const { data, failed } = useGmailAccounts();
  const [result] = useGmailResult();
  const [from, setFrom] = useState('connect');

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('from');
    if (BACK_LINKS[value]) setFrom(value);
  }, []);

  if (failed) return <p className="signal-home-empty">Something went wrong. Please refresh the page.</p>;
  if (!data) return <p className="signal-home-empty">Loading…</p>;

  const { accounts, viewingAs, ready } = data;
  const back = BACK_LINKS[from];
  const done = result?.code === 'connected';

  return (
    <div className="signal-connect">
      <h1 className="signal-home-title">
        <span aria-hidden="true">✉</span> Add a Gmail account
      </h1>

      {viewingAs && (
        <div className="signal-connect-admin" role="note">
          <strong>You are adding a Gmail account to {viewingAs.name}’s Signal.</strong>
          <ul>
            <li>On Google’s first screen, choose <strong>“Use another account”</strong> and sign in with <strong>{viewingAs.name}’s</strong> Gmail, not yours.</li>
            <li>Google may send a code to {viewingAs.name}’s phone. Have {viewingAs.name} on the call.</li>
            <li>When you’re done, sign out of {viewingAs.name}’s Google account in this browser.</li>
          </ul>
        </div>
      )}

      <GmailResult result={result} />

      {done ? (
        <div className="signal-connect-done">
          <p className="signal-connect-done-big">🎉 All done!</p>
          <p>Signal can now send email from this account.</p>
          <div className="signal-connect-actions">
            {back && <a href={back.href} className="signal-btn-primary">{back.label}</a>}
            <a href={`/api/gmail/connect?from=${from}`} className="signal-btn-ghost">Add another account</a>
            {!back && <a href="/" className="signal-btn-ghost">Go Home</a>}
          </div>
        </div>
      ) : (
        <>
          <p className="signal-connect-intro">
            This takes about one minute. Google will show you 3 screens. Here is what to press on each one.
          </p>

          <ol className="signal-connect-steps">
            <li className="signal-connect-step">
              <div className="signal-connect-step-text">
                <span className="signal-connect-num">1</span>
                <div>
                  <p className="signal-connect-step-title">Pick your Gmail account</p>
                  <p>Tap the account you want Signal to send from. If it isn’t in the list, tap <strong>Use another account</strong>.</p>
                </div>
              </div>
              <div className="signal-mock" aria-hidden="true">
                <p className="signal-mock-title">Choose an account</p>
                <p className="signal-mock-row signal-mock-mark">● yourname@gmail.com</p>
                <p className="signal-mock-row">Use another account</p>
              </div>
            </li>

            <li className="signal-connect-step">
              <div className="signal-connect-step-text">
                <span className="signal-connect-num">2</span>
                <div>
                  <p className="signal-connect-step-title">Google shows a warning. That’s OK.</p>
                  <p>
                    It says Google hasn’t checked Signal yet. Tap <strong>Advanced</strong> at the bottom, then tap{' '}
                    <strong>Go to jessgreene.app (unsafe)</strong>.
                  </p>
                </div>
              </div>
              <div className="signal-mock" aria-hidden="true">
                <p className="signal-mock-title">⚠ Google hasn’t verified this app</p>
                <p className="signal-mock-row signal-mock-faint">Back to safety</p>
                <p className="signal-mock-row signal-mock-mark">Advanced</p>
                <p className="signal-mock-row signal-mock-mark">Go to jessgreene.app (unsafe)</p>
              </div>
            </li>

            <li className="signal-connect-step">
              <div className="signal-connect-step-text">
                <span className="signal-connect-num">3</span>
                <div>
                  <p className="signal-connect-step-title">Tick the box, then tap Continue</p>
                  <p>
                    Make sure the box next to <strong>Send email on your behalf</strong> has a tick. Then tap <strong>Continue</strong>.
                  </p>
                </div>
              </div>
              <div className="signal-mock" aria-hidden="true">
                <p className="signal-mock-title">Signal wants access to your Google Account</p>
                <p className="signal-mock-row signal-mock-mark">☑ Send email on your behalf</p>
                <p className="signal-mock-row signal-mock-mark signal-mock-button">Continue</p>
              </div>
            </li>
          </ol>

          <p className="signal-connect-intro">After that, Google brings you back here.</p>

          {ready ? (
            <a href={`/api/gmail/connect?from=${from}`} className="signal-btn-primary signal-connect-go">
              I’m ready. Go to Google →
            </a>
          ) : (
            <p className="signal-gmail-result">Gmail sending isn’t set up yet. Please ask Tyler.</p>
          )}
          {back && (
            <p>
              <a href={back.href} className="signal-home-link">← {back.label}</a>
            </p>
          )}
        </>
      )}

      {accounts.length > 0 && (
        <section className="signal-connect-have">
          <h2 className="signal-home-section-title">Already connected</h2>
          <ul className="signal-gmail-list">
            {accounts.map((a) => (
              <li key={a.id} className="signal-gmail-row">
                <span className="signal-gmail-email"><span aria-hidden="true">✉</span> {a.email}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
