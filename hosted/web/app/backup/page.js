'use client';

import { useState } from 'react';
import { cardStyle, titleStyle, primaryBtnStyle } from '../components/ui.js';

export default function BackupPage() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState('');

  async function handleExport() {
    setExporting(true);
    setStatus('');
    const res = await fetch('/api/backup/export');
    if (!res.ok) {
      setStatus('Export failed.');
      setExporting(false);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmed = window.confirm(
      'Import this backup? This adds its data to your account as new records — it will not delete or overwrite anything you already have.'
    );
    if (!confirmed) {
      e.target.value = '';
      return;
    }

    setImporting(true);
    setStatus('Importing...');
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/backup/import', { method: 'POST', body: formData });
    e.target.value = '';
    setImporting(false);

    if (res.ok) {
      const { counts } = await res.json();
      setStatus(
        `Imported: ${counts.teachers} teacher(s), ${counts.teacher_assignments} assignment(s), ${counts.groups} group(s), ` +
        `${counts.templates} template(s), ${counts.projects} project(s), ${counts.send_records} send record(s).`
      );
    } else {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error || 'Import failed.');
    }
  }

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>Export Backup</h2>
        <p style={{ fontSize: 15, color: '#666', marginTop: 0 }}>
          Downloads all of your data — roster, groups, templates, projects, and send history — as a single JSON file you keep.
        </p>
        <button onClick={handleExport} disabled={exporting} style={primaryBtnStyle}>
          {exporting ? 'Exporting...' : 'Export Backup'}
        </button>
      </div>

      <div style={cardStyle}>
        <h2 style={titleStyle}>Restore from Backup</h2>
        <p style={{ fontSize: 15, color: '#666', marginTop: 0 }}>
          Adds a previously exported backup's data to your account. This never deletes or overwrites anything currently
          in your account — it's additive, so it's safe to import the same file more than once (you'll just get duplicates).
        </p>
        <input type="file" accept=".json" onChange={handleImport} disabled={importing} style={{ fontSize: 15 }} />
        {status && <p style={{ fontSize: 15, color: '#1F3864', marginTop: 10 }}>{status}</p>}
      </div>
    </div>
  );
}
