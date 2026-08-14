'use client';

import { useEffect, useRef, useState } from 'react';
import { titleStyle, selectStyle } from '../components/ui.js';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [labelMaps, setLabelMaps] = useState([]);
  const [availableFields, setAvailableFields] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const fileInputRef = useRef(null);

  async function loadTemplates() {
    const res = await fetch('/api/templates');
    if (res.ok) setTemplates(await res.json());
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadLabelMaps(templateId) {
    const res = await fetch(`/api/templates/${templateId}/label-maps`);
    if (res.ok) {
      const data = await res.json();
      setLabelMaps(data.labelMaps);
      setAvailableFields(data.availableFields);
    }
  }

  function selectTemplate(t) {
    setSelectedId(t.id);
    loadLabelMaps(t.id);
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatus('Uploading and scanning for [Labels]...');
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/templates', { method: 'POST', body: formData });
    setUploading(false);
    e.target.value = '';

    if (res.ok) {
      const data = await res.json();
      setStatus(`Found ${data.labels.length} label(s): ${data.labels.join(', ') || 'none'}`);
      await loadTemplates();
      selectTemplate({ id: data.templateId });
    } else {
      setStatus('Upload failed.');
    }
  }

  async function updateMapping(labelMapId, matchedColumn) {
    setLabelMaps((prev) =>
      prev.map((lm) => (lm.id === labelMapId ? { ...lm, matched_column: matchedColumn, manual_override: true } : lm))
    );
    await fetch(`/api/templates/${selectedId}/label-maps`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labelMapId, matchedColumn: matchedColumn || null }),
    });
  }

  const selectedTemplate = templates.find((t) => t.id === selectedId);
  const unmappedCount = labelMaps.filter((lm) => !lm.matched_column).length;

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="signal-card">
        <h2 style={titleStyle}>Upload Letter Template</h2>
        <p style={{ fontSize: 15, color: '#666', marginTop: 0 }}>
          Upload a .docx letter with bracketed labels like <code>[First]</code> or <code>[School]</code>.
          Signal will detect them and let you map each one to a roster column.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".docx"
          onChange={handleUpload}
          disabled={uploading}
          className="signal-visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="signal-upload-btn"
        >
          {uploading ? 'Uploading...' : 'Choose .docx file'}
        </button>

        {status && <p style={{ fontSize: 15, color: '#1F3864', marginTop: 10 }}>{status}</p>}
      </div>

      <div className="signal-card">
        <h2 style={titleStyle}>Templates</h2>
        {templates.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>No templates uploaded yet.</p>}
        {templates.map((t) => (
          <div
            key={t.id}
            onClick={() => selectTemplate(t)}
            style={{
              ...templateRowStyle,
              background: t.id === selectedId ? '#f2f5fb' : 'transparent',
            }}
          >
            <span>{t.file_name}</span>
            <span style={{ fontSize: 13, color: '#666' }}>
              {new Date(t.uploaded_at).toLocaleDateString()} — {(t.detected_labels_json || []).length} label(s)
            </span>
          </div>
        ))}
      </div>

      {selectedTemplate && (
        <div className="signal-card">
          <h2 style={titleStyle}>Map Labels — {selectedTemplate.file_name}</h2>
          {unmappedCount > 0 && (
            <p style={{ fontSize: 15, color: '#a33', marginTop: 0 }}>
              {unmappedCount} label(s) still unmapped — generating letters will be blocked until every label has a column.
            </p>
          )}
          {labelMaps.length === 0 && <p style={{ color: '#666', fontSize: 15 }}>No labels detected in this document.</p>}
          {labelMaps.map((lm) => (
            <div key={lm.id} style={labelRowStyle}>
              <span style={{ fontFamily: 'monospace', fontSize: 16 }}>[{lm.label_name}]</span>
              <select
                value={lm.matched_column || ''}
                onChange={(e) => updateMapping(lm.id, e.target.value)}
                style={selectStyle}
              >
                <option value="">— Unmapped —</option>
                {availableFields.map((f) => (
                  <option key={f.column} value={f.column}>{f.label}</option>
                ))}
              </select>
              {lm.manual_override && <span style={{ fontSize: 13, color: '#666' }}>manually set</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const templateRowStyle = { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid #f2f2f2', fontSize: 16, cursor: 'pointer', borderRadius: 'var(--radius-md)' };
const labelRowStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid #f2f2f2', fontSize: 15 };
