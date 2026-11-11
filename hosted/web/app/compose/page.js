'use client';

import { useEffect, useMemo, useState } from 'react';
import HelpBubble from '../components/HelpBubble.js';
import { useGmailResult, GmailResult } from '../components/GmailAccounts.js';

// Write Email, as a 3-step wizard: Who → What → Check & send.
// Signal sends the email itself, from one of her connected Gmail accounts.
// The last step shows everything (still editable), which account it sends
// from, and how many people get it, before the one Send button.

const STEPS = ['Who', 'What', 'Check & send'];

// Saved while she goes to add a Gmail account, so nothing she typed is lost.
const DRAFT_KEY = 'signal_compose_draft';
// Vercel caps a request at 4.5 MB; files travel a third bigger as base64.
const ATTACHMENT_LIMIT = 3 * 1024 * 1024;

export default function ComposePage() {
  const [step, setStep] = useState(1);
  const [lists, setLists] = useState(null);
  const [signature, setSignature] = useState('');
  const [gmail, setGmail] = useState(null); // { accounts, suggestedId, practice, ready }
  const [accountId, setAccountId] = useState(null);
  const [gmailResult] = useGmailResult();

  // Who
  const [source, setSource] = useState(null); // { kind: 'list', list } | { kind: 'people' }
  const [recipients, setRecipients] = useState([]); // [{ teacherId, assignmentId, name, email }]
  const [picking, setPicking] = useState(false);

  // What
  const [mode, setMode] = useState(null); // 'message' | 'letter'
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState([]); // [{ name, type, size, data }]
  const [templates, setTemplates] = useState(null);
  const [template, setTemplate] = useState(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  // Check & send
  const [delivery, setDelivery] = useState('separate'); // 'separate' | 'bcc'
  const [letters, setLetters] = useState([]); // [{ assignmentId, name, email, filledText }]
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(null); // null | 'test' | 'real'
  const [testResult, setTestResult] = useState(null);
  const [result, setResult] = useState(null); // the response after the real send

  useEffect(() => {
    fetch('/api/lists').then((r) => (r.ok ? r.json() : [])).then(setLists).catch(() => setLists([]));
    fetch('/api/settings')
      .then((r) => r.ok && r.json())
      .then((d) => d?.defaultSignature && setSignature(d.defaultSignature))
      .catch(() => {});
    loadAccounts();

    // Back from adding a Gmail account: put everything back where it was.
    const params = new URLSearchParams(window.location.search);
    let draft = null;
    try {
      draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // Storage unavailable; start fresh.
    }
    if (draft && params.get('gmail')) {
      setSource(draft.source);
      setRecipients(draft.recipients);
      setMode(draft.mode);
      setSubject(draft.subject);
      setBody(draft.body);
      setAttachments(draft.attachments || []);
      setTemplate(draft.template);
      setLetters(draft.letters || []);
      setDelivery(draft.delivery || 'separate');
      setStep(draft.step || 1);
      return;
    }

    // Arrived from a list's "Email this list" button: start at step 2.
    const listId = params.get('list');
    if (listId) chooseList({ id: Number(listId) });
  }, []);

  async function loadAccounts() {
    try {
      const res = await fetch('/api/gmail/accounts');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGmail(data);
      // Newly added account wins; otherwise the one last used in this workspace.
      const added = new URLSearchParams(window.location.search).get('account');
      const match = data.accounts.find((a) => a.email === added);
      setAccountId(match ? Number(match.id) : data.suggestedId);
    } catch {
      setGmail({ accounts: [], suggestedId: null, practice: false, ready: false, failed: true });
    }
  }

  function addAccount() {
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ step, source, recipients, mode, subject, body, attachments, template, letters, delivery })
      );
    } catch {
      // Too big to save (large attachments); she'll need to attach them again.
    }
    window.location.href = '/connect-gmail?from=compose';
  }

  const withEmail = recipients.filter((r) => r.email);
  const withoutEmail = recipients.filter((r) => !r.email);
  const account = gmail?.accounts.find((a) => Number(a.id) === accountId) || null;
  const practice = !!gmail?.practice;

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

  function enterCheck() {
    setConfirming(false);
    setTestResult(null);
    setStep(3);
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
      enterCheck();
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
        setSubject((s) => s || template.file_name.replace(/\.docx$/i, ''));
        enterCheck();
      } catch {
        setError('Something went wrong. Please try again.');
      }
      setWorking(false);
      return;
    }
    setError('Choose “Write a message” or “Use a saved letter”.');
  }

  const listId = source?.kind === 'list' ? source.list.id : null;
  const finalBody = signature ? `${body}\n\n${signature}` : body;
  const count = mode === 'letter' ? letters.length : withEmail.length;
  const countText = `${count} ${count === 1 ? 'person' : 'people'}`;

  async function send(test) {
    setError('');
    if (!account) {
      setError('Choose which Gmail account to send from.');
      return;
    }
    if (mode === 'message' && !subject.trim() && !body.trim()) {
      setError('Type a subject or a message first.');
      return;
    }
    if (mode === 'letter' && !subject.trim()) {
      setError('Please type a subject.');
      return;
    }
    setSending(test ? 'test' : 'real');
    setTestResult(null);
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          kind: mode,
          test,
          delivery,
          subject: subject.trim(),
          body: finalBody,
          recipients: withEmail.map((r) => ({ assignmentId: r.assignmentId })),
          letters: letters.map((l) => ({ assignmentId: l.assignmentId, text: l.filledText })),
          templateId: template?.id,
          listId,
          attachments: attachments.map(({ name, type, data }) => ({ name, type, data })),
        }),
      });
      const data = await res.json();
      if (data.test) {
        if (data.error) setError(data.error);
        else setTestResult(data);
      } else if (data.sentTo > 0 || data.success) {
        setResult(data);
      } else {
        setError(data.error || 'That didn’t send. Please try again.');
      }
    } catch {
      setError('Something went wrong, and the email may not have sent. Check your Gmail Sent folder before trying again.');
    }
    setSending(null);
    setConfirming(false);
  }

  function startOver() {
    window.location.href = '/compose';
  }

  function updateLetter(assignmentId, text) {
    setLetters((all) => all.map((l) => (l.assignmentId === assignmentId ? { ...l, filledText: text } : l)));
  }

  const noAccounts = gmail && !gmail.failed && gmail.accounts.length === 0;

  return (
    <div className="signal-home signal-wizard">
      <div className="signal-title-row">
        <h1 className="signal-home-title">Write an email</h1>
        <HelpBubble text="Three steps: pick who, pick what to send, then check it. Nothing is sent until you press the Send button on the last step." />
      </div>
      <ol className="signal-steps" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={`signal-step${step === i + 1 ? ' current' : ''}${step > i + 1 ? ' done' : ''}`} aria-current={step === i + 1 ? 'step' : undefined}>
            <span className="signal-step-num">{step > i + 1 ? '✓' : i + 1}</span>
            <span className="signal-step-label">{label}</span>
          </li>
        ))}
      </ol>

      <GmailResult result={gmailResult} />
      {noAccounts && step === 1 && <NoAccountBox onAdd={addAccount} />}
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
                <span className="signal-choice-sub">The same message to everyone</span>
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
              <MessageFields subject={subject} setSubject={setSubject} body={body} setBody={setBody} signature={signature} />
              <Attachments files={attachments} onChange={setAttachments} />
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
              {template && <Attachments files={attachments} onChange={setAttachments} />}
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

      {/* ---------- Step 3: Check & send ---------- */}
      {step === 3 && result && (
        <SentBox result={result} onAgain={startOver} />
      )}

      {step === 3 && !result && (
        <section aria-labelledby="check-title">
          <h2 id="check-title" className="signal-wizard-question">
            Check your email{' '}
            <HelpBubble text="You can still change anything on this page. Nothing is sent until you press the big Send button." />
          </h2>

          {/* From */}
          <div className="signal-send-section">
            <h3 className="signal-send-label">Send from</h3>
            {gmail === null && <p className="signal-home-sub">Loading your Gmail accounts…</p>}
            {noAccounts && <NoAccountBox onAdd={addAccount} />}
            {gmail && gmail.accounts.length > 0 && (
              <div className="signal-from-choices" role="radiogroup" aria-label="Send from">
                {gmail.accounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={Number(a.id) === accountId}
                    className={`signal-from-choice${Number(a.id) === accountId ? ' selected' : ''}`}
                    onClick={() => setAccountId(Number(a.id))}
                  >
                    <span className="signal-from-dot" aria-hidden="true">{Number(a.id) === accountId ? '●' : '○'}</span>
                    {a.email}
                  </button>
                ))}
                <button type="button" className="signal-link-btn" onClick={addAccount}>＋ Add another Gmail account</button>
              </div>
            )}
          </div>

          {/* What (still editable) */}
          {mode === 'message' && (
            <div className="signal-send-section">
              <h3 className="signal-send-label">Your message <span className="signal-send-hint">(you can still change it)</span></h3>
              <MessageFields subject={subject} setSubject={setSubject} body={body} setBody={setBody} signature={signature} />
              <Attachments files={attachments} onChange={setAttachments} />
            </div>
          )}

          {mode === 'letter' && (
            <div className="signal-send-section">
              <h3 className="signal-send-label">Your letters <span className="signal-send-hint">(you can still change them)</span></h3>
              <label className="signal-field-label" htmlFor="l-subject">Subject (same for everyone)</label>
              <input id="l-subject" className="signal-big-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <ul className="signal-letter-list">
                {letters.map((l) => (
                  <li key={l.assignmentId} className="signal-letter-card">
                    <details>
                      <summary>
                        <span className="signal-person-name">{l.name}</span> <span className="signal-person-meta">{l.email}</span>
                      </summary>
                      <textarea
                        className="signal-notes-input signal-message-input"
                        rows={10}
                        aria-label={`Letter to ${l.name}`}
                        value={l.filledText}
                        onChange={(e) => updateLetter(l.assignmentId, e.target.value)}
                      />
                    </details>
                  </li>
                ))}
              </ul>
              <Attachments files={attachments} onChange={setAttachments} />
            </div>
          )}

          {/* How (messages only) */}
          {mode === 'message' && withEmail.length > 1 && (
            <div className="signal-send-section">
              <h3 className="signal-send-label">How should it go out?</h3>
              <div className="signal-choice-cards signal-choice-two">
                <button type="button" className={`signal-choice-card${delivery === 'separate' ? ' selected' : ''}`} onClick={() => setDelivery('separate')} aria-pressed={delivery === 'separate'}>
                  <span className="signal-choice-icon" aria-hidden="true">✉</span>
                  <span className="signal-choice-text">
                    <span className="signal-choice-title">A separate email to each person</span>
                    <span className="signal-choice-sub">Each person gets their own email. Nobody sees the others.</span>
                  </span>
                </button>
                <button type="button" className={`signal-choice-card${delivery === 'bcc' ? ' selected' : ''}`} onClick={() => setDelivery('bcc')} aria-pressed={delivery === 'bcc'}>
                  <span className="signal-choice-icon" aria-hidden="true">👥</span>
                  <span className="signal-choice-text">
                    <span className="signal-choice-title">One email, everyone hidden</span>
                    <span className="signal-choice-sub">One email with everyone in Bcc. Nobody sees the others.</span>
                  </span>
                </button>
              </div>
            </div>
          )}

          {withoutEmail.length > 0 && (
            <p className="signal-home-sub">
              {withoutEmail.length} {withoutEmail.length === 1 ? 'person has' : 'people have'} no email and will be skipped: {withoutEmail.map((r) => r.name).join(', ')}.
            </p>
          )}

          {/* Send */}
          <div className="signal-send-box">
            {practice ? (
              <p className="signal-send-summary">
                🧪 This is Practice. The email goes <strong>only to you</strong>
                {account ? <> at <strong>{account.email}</strong></> : null}, so you can see how it looks. Nobody else gets it.
              </p>
            ) : (
              <p className="signal-send-summary">
                This will send to <strong>{countText}</strong>
                {source?.kind === 'list' ? <> on <strong>“{source.list.name}”</strong></> : null}
                {account ? <> from <strong>{account.email}</strong></> : null}.
              </p>
            )}

            {testResult && (
              <p className="signal-gmail-result good" role="status">
                ✓ A {testResult.practice ? 'practice' : 'test'} email was sent to {testResult.from}. Check that inbox to see how it looks.
              </p>
            )}

            {practice ? (
              <button type="button" className="signal-btn-email signal-send-btn" onClick={() => send(true)} disabled={!account || !!sending}>
                {sending ? 'Sending…' : '✉ Send practice email to me'}
              </button>
            ) : confirming ? (
              <div className="signal-send-confirm" role="alertdialog" aria-label="Send now?">
                <p className="signal-send-confirm-text">Send this email to {countText} now?</p>
                <div className="signal-people-actions">
                  <button type="button" className="signal-btn-email signal-send-btn" onClick={() => send(false)} disabled={!!sending} autoFocus>
                    {sending === 'real' ? `Sending to ${countText}…` : 'Yes, send it now'}
                  </button>
                  <button type="button" className="signal-btn-ghost" onClick={() => setConfirming(false)} disabled={!!sending}>
                    No, go back
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button type="button" className="signal-btn-email signal-send-btn" onClick={() => { setError(''); setConfirming(true); }} disabled={!account || !!sending}>
                  ✉ Send to {countText}
                </button>
                <button type="button" className="signal-link-btn signal-send-test" onClick={() => send(true)} disabled={!account || !!sending}>
                  {sending === 'test' ? 'Sending a test…' : 'Send a test to myself first'}
                </button>
              </>
            )}
          </div>

          <div className="signal-wizard-nav">
            <button type="button" className="signal-btn-ghost" onClick={() => setStep(2)} disabled={!!sending}>← Back</button>
          </div>
        </section>
      )}
    </div>
  );
}

function MessageFields({ subject, setSubject, body, setBody, signature }) {
  return (
    <>
      <label className="signal-field-label" htmlFor="c-subject">Subject</label>
      <input id="c-subject" className="signal-big-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Rehearsal moved to Thursday" />
      <label className="signal-field-label" htmlFor="c-body">Message</label>
      <textarea id="c-body" className="signal-notes-input signal-message-input" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message…" />
      {signature && <p className="signal-home-sub">Your signature from Settings will be added at the end.</p>}
    </>
  );
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// "Attach a file". Files are read in the browser and sent along with the
// email; together they must stay under 3 MB.
function Attachments({ files, onChange }) {
  const [problem, setProblem] = useState('');
  const total = files.reduce((n, f) => n + f.size, 0);

  async function add(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    setProblem('');
    let running = total;
    const added = [];
    for (const file of picked) {
      if (running + file.size > ATTACHMENT_LIMIT) {
        setProblem(`“${file.name}” is too big. All files together must be under 3 MB.`);
        continue;
      }
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }).catch(() => null);
      if (data === null) {
        setProblem(`“${file.name}” couldn’t be read. Please try again.`);
        continue;
      }
      running += file.size;
      added.push({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, data });
    }
    if (added.length) onChange([...files, ...added]);
  }

  return (
    <div className="signal-attach">
      {files.length > 0 && (
        <ul className="signal-attach-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="signal-attach-row">
              <span>📎 {f.name} <span className="signal-person-meta">({formatSize(f.size)})</span></span>
              <button type="button" className="signal-gmail-remove" onClick={() => onChange(files.filter((_, j) => j !== i))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <label className="signal-btn-ghost signal-attach-btn">
        📎 Attach a file
        <input type="file" multiple onChange={add} className="signal-visually-hidden" />
      </label>
      {problem && <p className="signal-modal-error" role="alert">{problem}</p>}
    </div>
  );
}

function NoAccountBox({ onAdd }) {
  return (
    <div className="signal-noaccount" role="note">
      <p className="signal-noaccount-title">No Gmail account is connected yet</p>
      <p>Signal needs a Gmail account to send from. Call Tyler and he can add one for you, or add it yourself. It takes about a minute.</p>
      <button type="button" className="signal-btn-primary" onClick={onAdd}>＋ Add a Gmail account</button>
    </div>
  );
}

function SentBox({ result, onAgain }) {
  const all = result.notSent.length === 0;
  return (
    <div className="signal-empty-big signal-done-box">
      <p className="signal-empty-big-title">{all ? '✓ Sent!' : 'Partly sent'}</p>
      <p className="signal-home-sub">
        Sent to {result.sentTo} {result.sentTo === 1 ? 'person' : 'people'} from {result.from}. You’ll find {result.sentTo === 1 ? 'it' : 'them'} in that account’s Sent folder in Gmail.
      </p>
      {!all && (
        <p className="signal-modal-error" role="alert">
          {result.error} These people did not get it: {result.notSent.join(', ')}.
        </p>
      )}
      <div className="signal-people-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
        <a href="/" className="signal-btn-primary signal-btn-link">Back to Home</a>
        <button type="button" className="signal-btn-ghost" onClick={onAgain}>Write another email</button>
      </div>
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
