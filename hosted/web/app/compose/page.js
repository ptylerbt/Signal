'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildMailtoUrl, buildAnnouncementMailtoUrl, buildGmailComposeUrl, GMAIL_URL_LIMIT } from '../../lib/mailto.js';
import HelpBubble from '../components/HelpBubble.js';

// Write Email, as a 3-step wizard: Who → What → Check & send.
// Nothing is ever sent from here: each step ends by opening Gmail in a new
// tab (or, if she prefers, her email app) with the message ready, and she
// presses Send there.

// Remembered per browser; Gmail unless she switches.
const MAIL_APP_KEY = 'signal_mail_app';
// Which Gmail account to open, if not the one she signs into Signal with.
const GMAIL_ACCOUNT_KEY = 'signal_gmail_account';

const STEPS = ['Who', 'What', 'Check & send'];

export default function ComposePage() {
  const [step, setStep] = useState(1);
  const [lists, setLists] = useState(null);
  const [signature, setSignature] = useState('');
  const [account, setAccount] = useState(''); // her email, so Gmail opens the right account
  const [mailApp, setMailApp] = useState('gmail'); // 'gmail' | 'app'
  const [blockedUrl, setBlockedUrl] = useState(null); // set if the browser blocked the new tab

  // Who
  const [source, setSource] = useState(null); // { kind: 'list', list } | { kind: 'people' }
  const [recipients, setRecipients] = useState([]); // [{ teacherId, assignmentId, name, email }]
  const [picking, setPicking] = useState(false);

  // What
  const [mode, setMode] = useState(null); // 'message' | 'letter'
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showAddresses, setShowAddresses] = useState(false);
  const [templates, setTemplates] = useState(null);
  const [template, setTemplate] = useState(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  // Check & send
  const [letters, setLetters] = useState([]);
  const [opened, setOpened] = useState(new Set());
  const [messageOpened, setMessageOpened] = useState(false);

  useEffect(() => {
    fetch('/api/lists').then((r) => (r.ok ? r.json() : [])).then(setLists).catch(() => setLists([]));
    fetch('/api/settings')
      .then((r) => r.ok && r.json())
      .then((d) => {
        if (d?.defaultSignature) setSignature(d.defaultSignature);
        let saved = null;
        try {
          saved = localStorage.getItem(GMAIL_ACCOUNT_KEY);
        } catch {
          // Storage unavailable; use the sign-in email.
        }
        if (saved) setAccount(saved);
        else if (d?.email) setAccount(d.email);
      })
      .catch(() => {});
    try {
      if (localStorage.getItem(MAIL_APP_KEY) === 'app') setMailApp('app');
    } catch {
      // Storage unavailable; stay on Gmail.
    }

    // Arrived from a list's "Email this list" button: start at step 2.
    const listId = new URLSearchParams(window.location.search).get('list');
    if (listId) chooseList({ id: Number(listId) });
  }, []);

  const withEmail = recipients.filter((r) => r.email);
  const withoutEmail = recipients.filter((r) => !r.email);

  async function chooseList(list) {
    setError('');
    try {
      const res = await fetch(`/api/lists/${list.id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSource({ kind: 'list', list: data.list });
      setRecipients(
        data.members.map((m) => ({
          teacherId: m.teacher_id,
          assignmentId: m.assignment_id,
          name: [m.first_name, m.last_name].filter(Boolean).join(' ') || '(no name)',
          email: m.email,
        }))
      );
      setPicking(false);
      setStep(2);
    } catch {
      setError('That list couldn’t be opened. Please try again.');
    }
  }

  function choosePeople(people) {
    setSource({ kind: 'people' });
    setRecipients(people);
    setPicking(false);
    setStep(2);
  }

  async function chooseMode(next) {
    setMode(next);
    setError('');
    if (next === 'letter' && templates === null) {
      try {
        const res = await fetch('/api/templates');
        setTemplates(res.ok ? await res.json() : []);
      } catch {
        setTemplates([]);
      }
    }
  }

  async function goToCheck() {
    setError('');
    if (withEmail.length === 0) {
      setError('None of these people have an email address yet.');
      return;
    }
    if (mode === 'message') {
      if (!subject.trim() && !body.trim()) {
        setError('Type a subject or a message first.');
        return;
      }
      setMessageOpened(false);
      setStep(3);
      return;
    }
    if (mode === 'letter') {
      if (!template) {
        setError('Pick a letter first.');
        return;
      }
      setWorking(true);
      try {
        const res = await fetch(`/api/templates/${template.id}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignmentIds: withEmail.map((r) => r.assignmentId) }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(
            data.reason === 'unmapped_labels'
              ? 'This letter needs setting up first. Open Letters (under More) to finish it.'
              : 'That letter couldn’t be filled in. Please try another.'
          );
          setWorking(false);
          return;
        }
        setLetters(data.results);
        setOpened(new Set());
        setSubject((s) => s || template.file_name.replace(/\.docx$/i, ''));
        setStep(3);
      } catch {
        setError('Something went wrong. Please try again.');
      }
      setWorking(false);
      return;
    }
    setError('Choose “Write a message” or “Use a saved letter”.');
  }

  const listId = source?.kind === 'list' ? source.list.id : null;

  async function recordSends(records) {
    try {
      await fetch('/api/sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });
    } catch {
      // Recording is a nice-to-have; never block opening the email.
    }
  }

  function chooseMailApp(next) {
    setMailApp(next);
    setBlockedUrl(null);
    try {
      localStorage.setItem(MAIL_APP_KEY, next);
    } catch {
      // Not remembered; fine.
    }
  }

  function chooseAccount(email) {
    setAccount(email);
    setBlockedUrl(null);
    try {
      localStorage.setItem(GMAIL_ACCOUNT_KEY, email);
    } catch {
      // Not remembered; fine.
    }
  }

  // Opens the email. Gmail goes in a NEW tab so Signal stays open behind it
  // for the next step. The tab must open straight from the click (before
  // any awaiting), or the browser treats it as a pop-up and blocks it.
  function openEmail({ to = [], bcc = [], subject: su, body: text }) {
    setBlockedUrl(null);
    if (mailApp === 'app') {
      window.location.href =
        to.length === 1 && bcc.length === 0
          ? buildMailtoUrl(to[0], su, text)
          : buildAnnouncementMailtoUrl({ to, bcc, subject: su, body: text });
      return;
    }
    const url = buildGmailComposeUrl({ to, bcc, subject: su, body: text, account });
    const tab = window.open(url, '_blank');
    if (!tab) setBlockedUrl(url);
  }

  const field = showAddresses ? 'to' : 'bcc';
  const finalBody = signature ? `${body}\n\n${signature}` : body;
  const messageEmails = withEmail.map((r) => r.email);
  const messageTo = field === 'to' ? messageEmails : [];
  const messageBcc = field === 'bcc' ? messageEmails : [];
  const messageTooLong =
    mailApp === 'gmail' &&
    buildGmailComposeUrl({ to: messageTo, bcc: messageBcc, subject, body: finalBody, account }).length > GMAIL_URL_LIMIT;

  async function openMessage() {
    openEmail({ to: messageTo, bcc: messageBcc, subject, body: finalBody });
    setMessageOpened(true);
    await recordSends(withEmail.map((r) => ({ assignmentId: r.assignmentId, listId, recipientField: field })));
  }

  async function openLetter(letter) {
    openEmail({ to: [letter.email], subject, body: letter.filledText });
    setOpened((prev) => new Set(prev).add(letter.assignmentId));
    await recordSends([{ assignmentId: letter.assignmentId, templateId: template.id, listId, recipientField: 'to' }]);
  }

  const appName = mailApp === 'gmail' ? 'Gmail' : 'your email app';

  function startOver() {
    window.location.href = '/compose';
  }

  const nextLetter = letters.find((l) => !opened.has(l.assignmentId));

  return (
    <div className="signal-home signal-wizard">
      <div className="signal-title-row">
        <h1 className="signal-home-title">Write an email</h1>
        <HelpBubble text="Three steps: pick who, pick what to send, then check it. Signal never sends anything by itself. It opens the email in Gmail, and you press Send there." />
      </div>
      <ol className="signal-steps" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={`signal-step${step === i + 1 ? ' current' : ''}${step > i + 1 ? ' done' : ''}`} aria-current={step === i + 1 ? 'step' : undefined}>
            <span className="signal-step-num">{step > i + 1 ? '✓' : i + 1}</span>
            <span className="signal-step-label">{label}</span>
          </li>
        ))}
      </ol>

      {error && <p className="signal-modal-error" role="alert" style={{ marginBottom: 16 }}>{error}</p>}

      {/* ---------- Step 1: Who ---------- */}
      {step === 1 && !picking && (
        <section aria-labelledby="who-title">
          <h2 id="who-title" className="signal-wizard-question">Who are you writing to?</h2>
          {lists === null && <p className="signal-home-empty">Loading…</p>}
          {lists && (
            <div className="signal-choice-cards">
              {lists.map((l) => (
                <button key={l.id} type="button" className="signal-choice-card" onClick={() => chooseList(l)}>
                  <span className="signal-choice-icon" aria-hidden="true">☰</span>
                  <span className="signal-choice-text">
                    <span className="signal-choice-title">{l.name}</span>
                    <span className="signal-choice-sub">{l.member_count} {l.member_count === 1 ? 'person' : 'people'}</span>
                  </span>
                  <span className="signal-choice-arrow" aria-hidden="true">→</span>
                </button>
              ))}
              <button type="button" className="signal-choice-card signal-choice-card-alt" onClick={() => setPicking(true)}>
                <span className="signal-choice-icon" aria-hidden="true">☺</span>
                <span className="signal-choice-text">
                  <span className="signal-choice-title">Pick people myself</span>
                  <span className="signal-choice-sub">Tick the people you want</span>
                </span>
                <span className="signal-choice-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          )}
          {lists && lists.length === 0 && (
            <p className="signal-home-sub" style={{ marginTop: 14 }}>
              Tip: make a <a href="/lists">list</a> for groups you email often, so next time it’s one click.
            </p>
          )}
        </section>
      )}

      {step === 1 && picking && <PeoplePicker onBack={() => setPicking(false)} onDone={choosePeople} />}

      {/* ---------- Step 2: What ---------- */}
      {step === 2 && (
        <section aria-labelledby="what-title">
          <WhoSummary source={source} withEmail={withEmail} withoutEmail={withoutEmail} onChange={() => setStep(1)} />

          <h2 id="what-title" className="signal-wizard-question">
            What do you want to send?{' '}
            <HelpBubble text="Write a message to type something new. Use a saved letter to send a letter from the Letters page, with each person's name filled in." />
          </h2>
          <div className="signal-choice-cards signal-choice-two">
            <button type="button" className={`signal-choice-card${mode === 'message' ? ' selected' : ''}`} onClick={() => chooseMode('message')} aria-pressed={mode === 'message'}>
              <span className="signal-choice-icon" aria-hidden="true">✎</span>
              <span className="signal-choice-text">
                <span className="signal-choice-title">Write a message</span>
                <span className="signal-choice-sub">One email to everyone</span>
              </span>
            </button>
            <button type="button" className={`signal-choice-card${mode === 'letter' ? ' selected' : ''}`} onClick={() => chooseMode('letter')} aria-pressed={mode === 'letter'}>
              <span className="signal-choice-icon" aria-hidden="true">📄</span>
              <span className="signal-choice-text">
                <span className="signal-choice-title">Use a saved letter</span>
                <span className="signal-choice-sub">Each person gets their own copy with their name filled in</span>
              </span>
            </button>
          </div>

          {mode === 'message' && (
            <div className="signal-wizard-panel">
              <label className="signal-field-label" htmlFor="c-subject">Subject</label>
              <input id="c-subject" className="signal-big-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Rehearsal moved to Thursday" />
              <label className="signal-field-label" htmlFor="c-body">Message</label>
              <textarea id="c-body" className="signal-notes-input signal-message-input" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message…" />
              {signature && <p className="signal-home-sub">Your signature from Settings will be added at the end.</p>}
              <label className="signal-check-row">
                <input type="checkbox" checked={showAddresses} onChange={(e) => setShowAddresses(e.target.checked)} />
                <span>
                  Let everyone see who else got this email
                  <span className="signal-check-sub">Leave this off to keep everyone’s email address private (recommended).</span>
                </span>
              </label>
            </div>
          )}

          {mode === 'letter' && (
            <div className="signal-wizard-panel">
              {templates === null && <p className="signal-home-sub">Loading your letters…</p>}
              {templates && templates.length === 0 && (
                <p className="signal-home-empty">
                  You don’t have any saved letters yet. Add one on the <a href="/templates">Letters</a> page (under More), or choose “Write a message” instead.
                </p>
              )}
              {templates && templates.length > 0 && (
                <div className="signal-choice-cards">
                  {templates.map((t) => {
                    const needsSetup = t.unmapped_count > 0;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`signal-choice-card${template?.id === t.id ? ' selected' : ''}${needsSetup ? ' disabled' : ''}`}
                        onClick={() => !needsSetup && setTemplate(t)}
                        aria-pressed={template?.id === t.id}
                        aria-disabled={needsSetup}
                      >
                        <span className="signal-choice-icon" aria-hidden="true">📄</span>
                        <span className="signal-choice-text">
                          <span className="signal-choice-title">{t.file_name.replace(/\.docx$/i, '')}</span>
                          <span className="signal-choice-sub">
                            {needsSetup ? 'Needs setting up on the Letters page first' : `Fills in ${(t.detected_labels_json || []).map((l) => `[${l}]`).join(' ') || 'nothing — same for everyone'}`}
                          </span>
                        </span>
                        {template?.id === t.id && <span className="signal-choice-arrow" aria-label="Selected">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="signal-wizard-nav">
            <button type="button" className="signal-btn-ghost" onClick={() => setStep(1)}>← Back</button>
            <button type="button" className="signal-btn-primary signal-btn-next" onClick={goToCheck} disabled={!mode || working}>
              {working ? 'Getting letters ready…' : 'Next: check it →'}
            </button>
          </div>
        </section>
      )}

      {/* ---------- Step 3: Check & send (message) ---------- */}
      {step === 3 && mode === 'message' && (
        <section aria-labelledby="check-title">
          <h2 id="check-title" className="signal-wizard-question">{messageOpened ? 'Your email is ready' : 'Check your email'}</h2>
          {!messageOpened ? (
            <>
              <div className="signal-email-preview">
                <div className="signal-email-line"><span>To</span><strong>{withEmail.length} {withEmail.length === 1 ? 'person' : 'people'}{source?.kind === 'list' ? ` on “${source.list.name}”` : ''}{showAddresses ? '' : ' (addresses kept private)'}</strong></div>
                <div className="signal-email-line"><span>Subject</span><strong>{subject || '(no subject)'}</strong></div>
                <pre className="signal-email-body">{signature ? `${body}\n\n${signature}` : body}</pre>
              </div>
              {withoutEmail.length > 0 && (
                <p className="signal-home-sub">{withoutEmail.length} {withoutEmail.length === 1 ? 'person has' : 'people have'} no email and will be skipped: {withoutEmail.map((r) => r.name).join(', ')}.</p>
              )}
              {messageTooLong && (
                <p className="signal-modal-error" role="alert">
                  This email is too long for Gmail to open in one go. Make the message shorter, or choose “my email app” below.
                </p>
              )}
              <div className="signal-wizard-nav">
                <button type="button" className="signal-btn-ghost" onClick={() => setStep(2)}>← Back to change it</button>
                <button type="button" className="signal-btn-email signal-btn-next" onClick={openMessage} disabled={messageTooLong}>✉ Open in {mailApp === 'gmail' ? 'Gmail' : 'my email app'}</button>
              </div>
              <MailAppChoice mailApp={mailApp} onChange={chooseMailApp} account={account} onChangeAccount={chooseAccount} />
            </>
          ) : (
            <>
              <BlockedTab url={blockedUrl} />
              <DoneBox
                onAgain={startOver}
                onReopen={openMessage}
                text={mailApp === 'gmail'
                  ? 'Gmail opened in a new tab with your message ready. Check it, press Send there, then come back to this tab.'
                  : 'Your email app should now be open with the message ready. Check it, then press Send there.'}
              />
            </>
          )}
        </section>
      )}

      {/* ---------- Step 3: Check & send (letters) ---------- */}
      {step === 3 && mode === 'letter' && (
        <section aria-labelledby="check-letters-title">
          <h2 id="check-letters-title" className="signal-wizard-question">
            {nextLetter ? `Open each email (${opened.size} of ${letters.length} done)` : 'All emails are ready'}
          </h2>
          <div className="signal-progress" aria-hidden="true">
            <div className="signal-progress-fill" style={{ width: `${letters.length ? (opened.size / letters.length) * 100 : 0}%` }} />
          </div>

          <label className="signal-field-label" htmlFor="l-subject">Subject (same for everyone)</label>
          <input id="l-subject" className="signal-big-input" value={subject} onChange={(e) => setSubject(e.target.value)} />

          {nextLetter ? (
            <div className="signal-next-box">
              <p className="signal-home-sub">
                {mailApp === 'gmail'
                  ? 'Press the button. Gmail opens in a new tab with the email ready. Press Send there, close that tab, and come back here for the next one.'
                  : 'Press the button, check the email in your email app, press Send there, then come back here for the next one.'}
              </p>
              <button type="button" className="signal-btn-email signal-btn-next" onClick={() => openLetter(nextLetter)}>
                ✉ Open email to {nextLetter.name || nextLetter.email}
              </button>
              <MailAppChoice mailApp={mailApp} onChange={chooseMailApp} account={account} onChangeAccount={chooseAccount} />
            </div>
          ) : (
            <DoneBox onAgain={startOver} text={`All ${letters.length} emails have been opened in ${appName}. Make sure you pressed Send on each one.`} />
          )}
          <BlockedTab url={blockedUrl} />

          {withoutEmail.length > 0 && (
            <p className="signal-home-sub">Skipped (no email): {withoutEmail.map((r) => r.name).join(', ')}.</p>
          )}

          <ul className="signal-letter-list">
            {letters.map((l) => (
              <li key={l.assignmentId} className={`signal-letter-card${opened.has(l.assignmentId) ? ' opened' : ''}`}>
                <div className="signal-letter-head">
                  <span>
                    <span className="signal-person-name">{opened.has(l.assignmentId) ? '✓ ' : ''}{l.name}</span>
                    <span className="signal-person-meta">{l.email}</span>
                  </span>
                  <button type="button" className="signal-btn-ghost signal-btn-small" onClick={() => openLetter(l)}>
                    {opened.has(l.assignmentId) ? 'Open again' : 'Open this one'}
                  </button>
                </div>
                <details>
                  <summary>Show the letter</summary>
                  <pre className="signal-email-body">{l.filledText}</pre>
                </details>
              </li>
            ))}
          </ul>

          {nextLetter && (
            <div className="signal-wizard-nav">
              <button type="button" className="signal-btn-ghost" onClick={() => setStep(2)}>← Back</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// Small switch under the Open button: Gmail (in the browser) or the
// computer's own email app. Remembered for next time.
function MailAppChoice({ mailApp, onChange, account, onChangeAccount }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  function save(e) {
    e.preventDefault();
    const email = draft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Type the full Gmail address, like name@gmail.com.');
      return;
    }
    onChangeAccount(email);
    setEditing(false);
    setError('');
  }

  return (
    <div className="signal-mail-choice-wrap">
      {mailApp === 'gmail' && !editing && (
        <p className="signal-sends-from">
          Sends from: <strong>{account || 'your Gmail'}</strong>{' '}
          <button type="button" className="signal-link-btn" onClick={() => { setDraft(account); setEditing(true); }}>
            Change
          </button>
        </p>
      )}
      {mailApp === 'gmail' && editing && (
        <form className="signal-sends-from-form" onSubmit={save}>
          <label className="signal-field-label" htmlFor="gmail-account">Which Gmail account should this send from?</label>
          <input
            id="gmail-account"
            type="email"
            className="signal-big-input"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(''); }}
            placeholder="name@gmail.com"
            autoFocus
          />
          <p className="signal-check-sub">You need to be signed into that account in this browser. Signal will remember it on this computer.</p>
          {error && <p className="signal-modal-error" role="alert">{error}</p>}
          <div className="signal-people-actions" style={{ marginTop: 10, marginBottom: 0 }}>
            <button type="submit" className="signal-btn-primary signal-btn-small">Use this account</button>
            <button type="button" className="signal-btn-ghost signal-btn-small" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
      <p className="signal-mail-choice">
        Opens in:{' '}
        <button type="button" className={`signal-mail-choice-btn${mailApp === 'gmail' ? ' on' : ''}`} onClick={() => onChange('gmail')} aria-pressed={mailApp === 'gmail'}>
          Gmail
        </button>
        <button type="button" className={`signal-mail-choice-btn${mailApp === 'app' ? ' on' : ''}`} onClick={() => onChange('app')} aria-pressed={mailApp === 'app'}>
          My email app
        </button>
      </p>
    </div>
  );
}

// If the browser blocked the new Gmail tab, give her a plain link to click.
function BlockedTab({ url }) {
  if (!url) return null;
  return (
    <div className="signal-next-box" role="alert">
      <p className="signal-home-sub">Your browser stopped Gmail from opening by itself. Press this button to open it:</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="signal-btn-email signal-btn-link">
        ✉ Open Gmail
      </a>
    </div>
  );
}

function WhoSummary({ source, withEmail, withoutEmail, onChange }) {
  const label = source?.kind === 'list' ? `“${source.list.name}”` : 'people you picked';
  return (
    <div className="signal-who-summary">
      <span>
        <span className="signal-who-label">Writing to</span>
        <strong>{label}</strong> · {withEmail.length} {withEmail.length === 1 ? 'person' : 'people'}
        {withoutEmail.length > 0 && <span className="signal-who-warn"> ({withoutEmail.length} without an email will be skipped)</span>}
      </span>
      <button type="button" className="signal-link-btn" onClick={onChange}>Change</button>
    </div>
  );
}

function DoneBox({ text, onAgain, onReopen }) {
  return (
    <div className="signal-empty-big signal-done-box">
      <p className="signal-empty-big-title">✓ Done</p>
      <p className="signal-home-sub">{text}</p>
      <div className="signal-people-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
        <a href="/" className="signal-btn-primary signal-btn-link">Back to Home</a>
        <button type="button" className="signal-btn-ghost" onClick={onAgain}>Write another email</button>
        {onReopen && <button type="button" className="signal-btn-ghost" onClick={onReopen}>Open it again</button>}
      </div>
    </div>
  );
}

function PeoplePicker({ onBack, onDone }) {
  const [people, setPeople] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/people')
      .then((r) => (r.ok ? r.json() : { people: [] }))
      .then((d) => setPeople(d.people))
      .catch(() => setPeople([]));
  }, []);

  const shown = useMemo(() => {
    if (!people) return [];
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.first_name, p.last_name, ...p.assignments.flatMap((a) => [a.email, a.subject, a.school])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [people, search]);

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function done() {
    const chosen = people
      .filter((p) => selected.has(p.id))
      .map((p) => {
        const a = p.assignments.find((x) => x.email) || p.assignments[0];
        return {
          teacherId: p.id,
          assignmentId: a?.id,
          name: [p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)',
          email: a?.email || null,
        };
      });
    onDone(chosen);
  }

  return (
    <section aria-labelledby="pick-people-title">
      <h2 id="pick-people-title" className="signal-wizard-question">Tick the people you want</h2>
      {people === null && <p className="signal-home-empty">Loading…</p>}
      {people && people.length === 0 && (
        <p className="signal-home-empty">There’s no one in this workspace yet. Add people on the <a href="/people">People</a> page first.</p>
      )}
      {people && people.length > 0 && (
        <>
          <input className="signal-big-input signal-search" placeholder="Find someone…" aria-label="Find someone" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="signal-pick-actions">
            <button type="button" className="signal-link-btn" onClick={() => setSelected(new Set([...selected, ...shown.map((p) => p.id)]))}>Tick all {shown.length}</button>
            {selected.size > 0 && <button type="button" className="signal-link-btn" onClick={() => setSelected(new Set())}>Untick all</button>}
          </div>
          <ul className="signal-pick-list signal-pick-list-page">
            {shown.map((p) => (
              <li key={p.id}>
                <label className="signal-import-row">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="signal-import-name">{[p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)'}</span>
                  <span className="signal-import-meta">{[p.assignments[0]?.email || 'No email', p.assignments[0]?.subject].filter(Boolean).join(' · ')}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="signal-wizard-nav">
        <button type="button" className="signal-btn-ghost" onClick={onBack}>← Back</button>
        <button type="button" className="signal-btn-primary signal-btn-next" onClick={done} disabled={selected.size === 0}>
          {selected.size === 0 ? 'Next →' : `Next: ${selected.size} ${selected.size === 1 ? 'person' : 'people'} →`}
        </button>
      </div>
    </section>
  );
}
