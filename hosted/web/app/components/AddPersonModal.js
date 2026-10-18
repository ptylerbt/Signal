'use client';

import { useState } from 'react';
import Modal from './Modal.js';

// The "+ Add Person" form. Name and email are required; the rest is
// optional. Pass `listId` to also put them straight onto that list.
export default function AddPersonModal({ onClose, onAdded, listId = null, listName = null }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: '', organization: '', grade: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (error) setError('');
  }

  async function save(e) {
    e.preventDefault();
    if (!form.firstName.trim() && !form.lastName.trim()) {
      setError('Please type their name.');
      return;
    }
    if (!form.email.trim()) {
      setError('Please type their email address.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, listId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Something went wrong. Please try again.');
        setSaving(false);
        return;
      }
      const name = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ');
      onAdded({ ...body, name });
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  return (
    <Modal as="form" onSubmit={save} onClose={onClose} labelledBy="add-person-title">
      <h2 id="add-person-title" className="signal-modal-title">Add a person</h2>
      <p className="signal-modal-help">
        {listName ? `They'll be added to “${listName}”. ` : ''}Only name and email are needed. You can fill in the rest later.
      </p>

      <div className="signal-form-row">
        <div>
          <label className="signal-field-label" htmlFor="ap-first">First name</label>
          <input id="ap-first" className="signal-big-input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />
        </div>
        <div>
          <label className="signal-field-label" htmlFor="ap-last">Last name</label>
          <input id="ap-last" className="signal-big-input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </div>
      </div>

      <label className="signal-field-label" htmlFor="ap-email">Email</label>
      <input id="ap-email" type="email" className="signal-big-input" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" />

      <p className="signal-optional-heading">Optional</p>
      <label className="signal-field-label" htmlFor="ap-role">Role or subject</label>
      <input id="ap-role" className="signal-big-input" value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="e.g. Band director, Choir member, Parent" />

      <label className="signal-field-label" htmlFor="ap-org">School or organization</label>
      <input id="ap-org" className="signal-big-input" value={form.organization} onChange={(e) => set('organization', e.target.value)} placeholder="e.g. Lincoln Middle School" />

      <label className="signal-field-label" htmlFor="ap-grade">Grade or level</label>
      <input id="ap-grade" className="signal-big-input" value={form.grade} onChange={(e) => set('grade', e.target.value)} placeholder="e.g. Middle school" />

      {error && <p className="signal-modal-error" role="alert">{error}</p>}

      <div className="signal-modal-buttons">
        <button type="button" className="signal-btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="signal-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add person'}</button>
      </div>
    </Modal>
  );
}
