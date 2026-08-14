'use client';

import { useEffect } from 'react';
import { titleStyle, primaryBtnStyle, ghostBtnStyle, chipBlueStyle, chipGrayStyle } from './ui.js';

// Shared "what happened here" overlay, opened by clicking a calendar entry
// (a send or a status change) or a note. Shows the full record and offers
// direct jumps to the associated project and teacher profile.
//
// `item` shape: { kind: 'send' | 'status' | 'note', ...row }
export default function DetailOverlay({ item, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!item) return null;

  const name = `${item.first_name ?? item.teacher_first_name ?? ''} ${item.last_name ?? item.teacher_last_name ?? ''}`.trim();
  const teacherId = item.teacher_id;

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={panelStyle} role="dialog" aria-modal="true" aria-label={heading(item)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h2 style={{ ...titleStyle, marginBottom: 6 }}>{heading(item)}</h2>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">✕</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {item.kind === 'send' && <span style={chipBlueStyle}>Communication sent</span>}
          {item.kind === 'status' && <span style={chipBlueStyle}>Status change</span>}
          {item.kind === 'note' && <span style={chipBlueStyle}>Note</span>}
          {item.project_name && <span style={chipGrayStyle}>Project: {item.project_name}</span>}
          {item.group_name && <span style={chipGrayStyle}>Group: {item.group_name}</span>}
        </div>

        <dl style={dlStyle}>
          {name && <Row label="Person" value={name} />}
          {item.kind === 'send' && (
            <>
              <Row label="When" value={formatFull(item.generated_at)} />
              <Row label="Letter" value={item.template_name || 'Group announcement'} />
              {item.email && <Row label="Sent to" value={item.email} />}
              {item.recipient_field && <Row label="Field" value={item.recipient_field.toUpperCase()} />}
              {item.school && <Row label="School" value={item.school} />}
              {item.subject && <Row label="Subject" value={item.subject} />}
              {item.level && <Row label="Level" value={item.level} />}
              {item.district && <Row label="District" value={item.district} />}
              <Row label="Status" value={item.status || 'Opened in mail client'} />
            </>
          )}
          {item.kind === 'status' && (
            <>
              <Row label="When" value={formatFull(item.updated_at)} />
              <Row label="Marked" value={item.status || '—'} />
            </>
          )}
          {item.kind === 'note' && (
            <>
              <Row label="When" value={formatFull(item.created_at)} />
              <Row label="Note" value={item.note_text} wrap />
            </>
          )}
        </dl>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
          {item.project_id && (
            <a href={`/projects?open=${item.project_id}`} style={{ ...primaryBtnStyle, textDecoration: 'none', display: 'inline-block' }}>
              Go to Project →
            </a>
          )}
          {teacherId && (
            <a href={`/teachers/${teacherId}`} style={{ ...ghostBtnStyle, textDecoration: 'none', display: 'inline-block' }}>
              Open Profile →
            </a>
          )}
          <button onClick={onClose} style={ghostBtnStyle}>Close</button>
        </div>

        {!item.project_id && (
          <p style={{ fontSize: 13.5, color: '#888', marginTop: 14, marginBottom: 0 }}>
            This one isn’t linked to a project.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, wrap }) {
  return (
    <>
      <dt style={dtStyle}>{label}</dt>
      <dd style={{ ...ddStyle, whiteSpace: wrap ? 'pre-wrap' : 'normal' }}>{value}</dd>
    </>
  );
}

function heading(item) {
  if (item.kind === 'send') return 'Communication';
  if (item.kind === 'status') return 'Status Change';
  return 'Note';
}

function formatFull(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  backdropFilter: 'blur(2px)',
  WebkitBackdropFilter: 'blur(2px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 1000,
};

const panelStyle = {
  background: '#fff',
  borderRadius: 'var(--radius-3xl)',
  border: '1px solid var(--card-border)',
  boxShadow: 'var(--shadow-soft-lg)',
  padding: 28,
  width: '100%',
  maxWidth: 560,
  maxHeight: '85vh',
  overflowY: 'auto',
};

const closeBtnStyle = {
  background: 'transparent',
  border: 'none',
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
  color: '#666',
  padding: 6,
  borderRadius: 'var(--radius-pill)',
  flexShrink: 0,
};

const dlStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(90px, auto) 1fr',
  gap: '10px 18px',
  margin: 0,
  fontSize: 15,
};
const dtStyle = { color: '#888', fontSize: 14 };
const ddStyle = { margin: 0, color: '#1a1a1a', overflowWrap: 'anywhere' };
