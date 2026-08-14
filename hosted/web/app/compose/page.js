'use client';

import { useEffect, useState } from 'react';
import { buildMailtoUrl, buildAnnouncementMailtoUrl } from '../../lib/mailto.js';
import { cardStyle, titleStyle, subtitleStyle, selectStyle, inputStyle, primaryBtnStyle, ghostBtnStyle } from '../components/ui.js';

const STEP_TYPE = 'type';
const STEP_RECIPIENTS = 'recipients';
const STEP_PERSONALIZED_TEMPLATE = 'personalized-template';
const STEP_PERSONALIZED_REVIEW = 'personalized-review';
const STEP_ANNOUNCEMENT_CONTENT = 'announcement-content';
const STEP_ANNOUNCEMENT_REVIEW = 'announcement-review';

export default function ComposePage() {
  const [step, setStep] = useState(STEP_TYPE);
  const [type, setType] = useState(null);

  // Recipient picking
  const [options, setOptions] = useState({ schools: [], levels: [], subjects: [], districts: [] });
  const [groups, setGroups] = useState([]);
  const [filters, setFilters] = useState({ school: '', level: '', subject: '', district: '', search: '', repsOnly: false });
  const [filterResults, setFilterResults] = useState([]);
  const [recipients, setRecipients] = useState(new Map()); // assignment_id -> row

  // Personalized
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [templateStatus, setTemplateStatus] = useState('');
  const [batchResults, setBatchResults] = useState([]);

  // Announcement
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientFields, setRecipientFields] = useState(new Map()); // assignment_id -> to|cc|bcc

  // Optional project link
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);

  // Signature from Settings, auto-appended to announcements
  const [signature, setSignature] = useState('');

  useEffect(() => {
    fetch('/api/groups/filter-options').then((r) => r.ok && r.json()).then((d) => d && setOptions(d));
    fetch('/api/groups').then((r) => r.ok && r.json()).then((d) => d && setGroups(d));
    fetch('/api/projects').then((r) => r.ok && r.json()).then((d) => d && setProjects(d.filter((p) => p.status !== 'archived')));
    fetch('/api/settings').then((r) => r.ok && r.json()).then((d) => d?.defaultSignature && setSignature(d.defaultSignature));
  }, []);

  useEffect(() => {
    if (step !== STEP_RECIPIENTS) return;
    runFilter();
  }, [filters, step]);

  async function runFilter() {
    const res = await fetch('/api/groups/filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filters),
    });
    if (res.ok) setFilterResults(await res.json());
  }

  function toggleRecipient(r) {
    setRecipients((prev) => {
      const next = new Map(prev);
      if (next.has(r.assignment_id)) next.delete(r.assignment_id);
      else next.set(r.assignment_id, r);
      return next;
    });
  }

  function selectAllFiltered() {
    setRecipients((prev) => {
      const next = new Map(prev);
      filterResults.forEach((r) => next.set(r.assignment_id, r));
      return next;
    });
  }

  async function addGroup(groupId) {
    if (!groupId) return;
    const res = await fetch(`/api/groups/${groupId}/members`);
    if (!res.ok) return;
    const members = await res.json();
    setRecipients((prev) => {
      const next = new Map(prev);
      members.forEach((m) => next.set(m.assignment_id, m));
      return next;
    });
  }

  function removeRecipient(assignmentId) {
    setRecipients((prev) => {
      const next = new Map(prev);
      next.delete(assignmentId);
      return next;
    });
  }

  function chooseType(t) {
    setType(t);
    setStep(STEP_RECIPIENTS);
  }

  async function proceedFromRecipients() {
    if (recipients.size === 0) return;
    if (type === 'personalized') {
      const res = await fetch('/api/templates');
      if (res.ok) setTemplates(await res.json());
      setStep(STEP_PERSONALIZED_TEMPLATE);
    } else {
      const initial = new Map();
      [...recipients.keys()].forEach((id) => initial.set(id, 'bcc'));
      setRecipientFields(initial);
      setStep(STEP_ANNOUNCEMENT_CONTENT);
    }
  }

  function setRecipientField(assignmentId, field) {
    setRecipientFields((prev) => new Map(prev).set(assignmentId, field));
  }

  async function generatePreviews() {
    if (!templateId) {
      setTemplateStatus('Choose a template first.');
      return;
    }
    const res = await fetch(`/api/templates/${templateId}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentIds: [...recipients.keys()] }),
    });
    const data = await res.json();
    if (!data.success) {
      if (data.reason === 'unmapped_labels') {
        setTemplateStatus(
          `Map every label before continuing (see the Templates page): ${data.unmappedLabels.map((l) => `[${l}]`).join(', ')}`
        );
      } else {
        setTemplateStatus('Could not generate letters for this template.');
      }
      return;
    }
    setTemplateStatus('');
    setBatchResults(data.results);
    setStep(STEP_PERSONALIZED_REVIEW);
  }

  async function openPersonalized(result) {
    const subjectLine = (templateName || '').replace(/\.docx$/i, '');
    const url = buildMailtoUrl(result.email, subjectLine, result.filledText);

    await fetch('/api/sends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [{ assignmentId: result.assignmentId, templateId, groupId: null, projectId, recipientField: 'to' }],
      }),
    });

    window.location.href = url;
  }

  async function openAllPersonalized() {
    for (const result of batchResults) {
      await openPersonalized(result);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  function reviewAnnouncement() {
    setStep(STEP_ANNOUNCEMENT_REVIEW);
  }

  async function sendAnnouncement() {
    const buckets = { to: [], cc: [], bcc: [] };
    const records = [];

    for (const [assignmentId, r] of recipients) {
      const field = recipientFields.get(assignmentId) || 'bcc';
      if (!r.email) continue;
      buckets[field].push(r.email);
      records.push({ assignmentId, templateId: null, groupId: null, projectId, recipientField: field });
    }

    const finalBody = signature ? `${body}\n\n${signature}` : body;
    const url = buildAnnouncementMailtoUrl({ to: buckets.to, cc: buckets.cc, bcc: buckets.bcc, subject, body: finalBody });

    await fetch('/api/sends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });

    window.location.href = url;
  }

  function finish() {
    setStep(STEP_TYPE);
    setType(null);
    setRecipients(new Map());
    setTemplateId(null);
    setTemplateName('');
    setTemplateStatus('');
    setBatchResults([]);
    setSubject('');
    setBody('');
    setRecipientFields(new Map());
    setProjectId(null);
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>Compose</h2>
        <p style={{ fontSize: 15, color: '#666', marginTop: 0 }}>
          Step: {stepLabel(step)}
        </p>
      </div>

      {step === STEP_TYPE && (
        <div style={cardStyle}>
          <h3 style={subtitleStyle}>What are you sending?</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button onClick={() => chooseType('personalized')} style={choiceBtnStyle}>
              <strong>Personalized Letters</strong>
              <div style={{ fontSize: 14, color: '#666', marginTop: 6 }}>Fill a template per recipient, open each in your mail client.</div>
            </button>
            <button onClick={() => chooseType('announcement')} style={choiceBtnStyle}>
              <strong>Group Announcement</strong>
              <div style={{ fontSize: 14, color: '#666', marginTop: 6 }}>One message, To/Cc/Bcc across a group.</div>
            </button>
          </div>
        </div>
      )}

      {step === STEP_RECIPIENTS && (
        <>
          <div style={cardStyle}>
            <h3 style={subtitleStyle}>Pick Recipients</h3>
            <div style={filterBarStyle}>
              <select value={filters.school} onChange={(e) => setFilters({ ...filters, school: e.target.value })} style={selectStyle}>
                <option value="">All Schools</option>
                {options.schools.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })} style={selectStyle}>
                <option value="">All Levels</option>
                {options.levels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })} style={selectStyle}>
                <option value="">All Subjects</option>
                {options.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.district} onChange={(e) => setFilters({ ...filters, district: e.target.value })} style={selectStyle}>
                <option value="">All Districts</option>
                {options.districts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select onChange={(e) => addGroup(e.target.value)} value="" style={selectStyle}>
                <option value="">-- Add a saved group --</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.member_count})</option>)}
              </select>
            </div>
            <div style={{ ...filterBarStyle, marginTop: 8 }}>
              <input
                type="text"
                placeholder="Search name..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                style={inputStyle}
              />
              <button onClick={selectAllFiltered} style={ghostBtnStyle}>Select All Shown</button>
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 10, border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)' }}>
              {filterResults.map((r) => (
                <div key={r.assignment_id} style={resultRowStyle}>
                  <input type="checkbox" checked={recipients.has(r.assignment_id)} onChange={() => toggleRecipient(r)} style={{ width: 20, height: 20 }} />
                  <span>{r.first_name} {r.last_name}</span>
                  <span>{r.school}</span>
                  <span>{r.email}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={subtitleStyle}>Selected ({recipients.size})</h3>
            {[...recipients.values()].map((r) => (
              <div key={r.assignment_id} style={resultRowStyle}>
                <span>{r.first_name} {r.last_name}</span>
                <span>{r.email}</span>
                <button onClick={() => removeRecipient(r.assignment_id)} style={ghostBtnStyle}>Remove</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setStep(STEP_TYPE)} style={ghostBtnStyle}>Back</button>
              <button onClick={proceedFromRecipients} disabled={recipients.size === 0} style={primaryBtnStyle}>Next</button>
            </div>
          </div>
        </>
      )}

      {step === STEP_PERSONALIZED_TEMPLATE && (
        <div style={cardStyle}>
          <h3 style={subtitleStyle}>Choose a Template</h3>
          <select
            value={templateId || ''}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              setTemplateId(id);
              const t = templates.find((x) => x.id === id);
              setTemplateName(t ? t.file_name : '');
            }}
            style={{ ...selectStyle, width: '100%', marginBottom: 10 }}
          >
            <option value="">-- Select a template --</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.file_name}</option>)}
          </select>
          {templates.length === 0 && (
            <p style={{ fontSize: 15, color: '#666' }}>No templates yet — upload one on the Templates page first.</p>
          )}
          {templateStatus && <p style={{ fontSize: 15, color: '#a33' }}>{templateStatus}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => setStep(STEP_RECIPIENTS)} style={ghostBtnStyle}>Back</button>
            <button onClick={generatePreviews} style={primaryBtnStyle}>Generate Letters</button>
          </div>
        </div>
      )}

      {step === STEP_PERSONALIZED_REVIEW && (
        <div style={cardStyle}>
          <h3 style={subtitleStyle}>Review &amp; Send ({batchResults.length})</h3>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 15, color: '#555' }}>
              Link to project (optional):{' '}
              <select value={projectId || ''} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
                <option value="">— None —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={openAllPersonalized} style={primaryBtnStyle}>Open All in Mail Client</button>
            <button onClick={finish} style={ghostBtnStyle}>Finish</button>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {batchResults.map((result) => (
              <div key={result.assignmentId} style={letterCardStyle}>
                <strong>{result.name}</strong> — {result.email}
                <pre style={preStyle}>{result.filledText}</pre>
                <button onClick={() => openPersonalized(result)} style={ghostBtnStyle}>Open in Mail Client</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === STEP_ANNOUNCEMENT_CONTENT && (
        <>
          <div style={cardStyle}>
            <h3 style={subtitleStyle}>Message</h3>
            <input
              type="text"
              placeholder="Subject..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: 8 }}
            />
            <textarea
              placeholder="Body..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              style={{ ...inputStyle, width: '100%', fontFamily: 'inherit' }}
            />
          </div>
          <div style={cardStyle}>
            <h3 style={subtitleStyle}>Recipient Fields</h3>
            {[...recipients.values()].map((r) => (
              <div key={r.assignment_id} style={resultRowStyle}>
                <span>{r.first_name} {r.last_name}</span>
                <span>{r.email}</span>
                <select
                  value={recipientFields.get(r.assignment_id) || 'bcc'}
                  onChange={(e) => setRecipientField(r.assignment_id, e.target.value)}
                  style={selectStyle}
                >
                  <option value="to">To</option>
                  <option value="cc">Cc</option>
                  <option value="bcc">Bcc</option>
                </select>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setStep(STEP_RECIPIENTS)} style={ghostBtnStyle}>Back</button>
              <button onClick={reviewAnnouncement} style={primaryBtnStyle}>Review</button>
            </div>
          </div>
        </>
      )}

      {step === STEP_ANNOUNCEMENT_REVIEW && (
        <div style={cardStyle}>
          <h3 style={subtitleStyle}>Review &amp; Send</h3>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 15, color: '#555' }}>
              Link to project (optional):{' '}
              <select value={projectId || ''} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
                <option value="">— None —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <p><strong>Subject:</strong> {subject || '(none)'}</p>
          <pre style={preStyle}>{signature ? `${body}\n\n${signature}` : body}</pre>
          {signature && <p style={{ fontSize: 13, color: '#888', marginTop: -6 }}>Your Compose signature (set in Settings) is appended automatically.</p>}
          <p style={{ fontSize: 15, color: '#666' }}>
            To: {[...recipientFields.values()].filter((f) => f === 'to').length} ·
            {' '}Cc: {[...recipientFields.values()].filter((f) => f === 'cc').length} ·
            {' '}Bcc: {[...recipientFields.values()].filter((f) => f === 'bcc').length}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => setStep(STEP_ANNOUNCEMENT_CONTENT)} style={ghostBtnStyle}>Back</button>
            <button onClick={sendAnnouncement} style={primaryBtnStyle}>Open in Mail Client</button>
            <button onClick={finish} style={ghostBtnStyle}>Finish</button>
          </div>
        </div>
      )}
    </div>
  );
}

function stepLabel(step) {
  switch (step) {
    case STEP_TYPE: return '1 of 4 — Type';
    case STEP_RECIPIENTS: return '2 of 4 — Recipients';
    case STEP_PERSONALIZED_TEMPLATE: return '3 of 4 — Template';
    case STEP_PERSONALIZED_REVIEW: return '4 of 4 — Review & Send';
    case STEP_ANNOUNCEMENT_CONTENT: return '3 of 4 — Message';
    case STEP_ANNOUNCEMENT_REVIEW: return '4 of 4 — Review & Send';
    default: return '';
  }
}

const filterBarStyle = { display: 'flex', gap: 10, flexWrap: 'wrap' };
const choiceBtnStyle = { flex: '1 1 240px', textAlign: 'left', padding: 20, border: '1px solid var(--card-border)', borderRadius: 'var(--radius-2xl)', background: '#fff', cursor: 'pointer', fontSize: 16 };
const resultRowStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid #f2f2f2', fontSize: 15 };
const letterCardStyle = { border: '1px solid var(--card-border)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 12, fontSize: 15 };
const preStyle = { whiteSpace: 'pre-wrap', background: '#f7f9fc', border: '1px solid #eef1f7', borderRadius: 'var(--radius-md)', padding: 12, fontSize: 14.5, margin: '10px 0' };
