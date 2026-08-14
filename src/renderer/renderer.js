// ---------- NAVIGATION ----------
const topbarTitle = document.getElementById('topbar-title');
const topbarMeta = document.getElementById('topbar-meta');
const SECTION_META = {
  'dashboard-section': { title: 'Dashboard', meta: 'Search teachers and jump into their profile' },
  'roster-section': { title: 'Roster', meta: 'Browse teachers and resolve duplicates' },
  'templates-section': { title: 'Uploads', meta: 'Import a roster, upload a letter, map labels, and generate personalized batches' },
  'groups-section': { title: 'Groups', meta: 'Filter, save, and message custom teacher groups' },
  'profile-section': { title: 'Teacher Profile', meta: 'View and edit this teacher\'s details' },
  'wizard-section': { title: 'Compose Email', meta: 'Step through recipients, content, and review' },
  'projects-section': { title: 'Projects', meta: 'Organize communications and track notes by project' },
  'project-detail-section': { title: 'Project', meta: 'People, notes, and send history for this project' },
};

function showPage(sectionId) {
  document.querySelectorAll('.page').forEach((page) => {
    page.classList.toggle('hidden', page.id !== sectionId);
  });
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.section === sectionId);
  });
  const meta = SECTION_META[sectionId];
  if (meta) {
    topbarTitle.textContent = meta.title;
    topbarMeta.textContent = meta.meta;
  }
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    showPage(btn.dataset.section);
    if (btn.dataset.section === 'dashboard-section') loadDashboard();
    if (btn.dataset.section === 'templates-section') loadTemplates();
    if (btn.dataset.section === 'groups-section') loadGroupsSection();
    if (btn.dataset.section === 'projects-section') loadProjectsList();
  });
});

document.getElementById('sidebar-compose-btn').addEventListener('click', () => startWizard());

// ==================================================
// DASHBOARD
// ==================================================
const dashboardSearch = document.getElementById('dashboard-search');
const dashboardSearchResults = document.getElementById('dashboard-search-results');
const dashboardStats = document.getElementById('dashboard-stats');

function searchResultRowHtml(t) {
  const repTag = t.is_district_rep ? '<span class="chip chip-green">Rep</span>' : '';
  return `
    <div class="search-result-row" data-teacher-id="${t.id}">
      <span>${t.first_name ?? ''} ${t.last_name ?? ''} ${repTag}</span>
      <span class="hint">View Profile &rarr;</span>
    </div>
  `;
}

async function runDashboardSearch() {
  const query = dashboardSearch.value.trim();
  if (!query) {
    dashboardSearchResults.innerHTML = '';
    return;
  }
  const results = await window.signal.searchTeachers(query);
  dashboardSearchResults.innerHTML =
    results.map(searchResultRowHtml).join('') || '<p class="hint">No matches.</p>';

  dashboardSearchResults.querySelectorAll('.search-result-row').forEach((row) => {
    row.addEventListener('click', () => openProfile(Number(row.dataset.teacherId)));
  });
}

dashboardSearch.addEventListener('input', runDashboardSearch);

function statTileHtml(value, label) {
  return `<div class="stat-tile"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}

async function loadDashboard() {
  const stats = await window.signal.getStats();
  dashboardStats.innerHTML = [
    statTileHtml(stats.teacherCount, 'Teachers'),
    statTileHtml(stats.schoolCount, 'Schools'),
    statTileHtml(stats.repCount, 'District Reps'),
    statTileHtml(stats.groupCount, 'Saved Groups'),
  ].join('');

  await loadDashboardRecentProjects();
}

const dashboardRecentProjectsEl = document.getElementById('dashboard-recent-projects');

async function loadDashboardRecentProjects() {
  const projects = await window.signal.listProjects();
  const recent = projects.slice(0, 5);

  dashboardRecentProjectsEl.innerHTML =
    recent.map(projectRowHtml).join('') || '<p class="hint">No projects yet.</p>';

  dashboardRecentProjectsEl.querySelectorAll('.project-row').forEach((row) => {
    row.addEventListener('click', () =>
      openProjectDetail(Number(row.dataset.projectId), 'dashboard-section')
    );
  });
}

const backupStatusEl = document.getElementById('backup-status');

document.getElementById('export-backup-btn').addEventListener('click', async () => {
  const result = await window.signal.exportBackup();
  backupStatusEl.textContent = result.canceled ? '' : `Backup saved to ${result.filePath}`;
});

document.getElementById('restore-backup-btn').addEventListener('click', async () => {
  const confirmed = window.confirm(
    'Restoring will replace everything currently in Signal with the backup\'s contents. Continue?'
  );
  if (!confirmed) return;

  const result = await window.signal.restoreBackup();
  if (result.canceled) return;

  backupStatusEl.textContent = 'Backup restored.';
  await loadDashboard();
  await loadTeachers();
  await loadDuplicates();
});

// ==================================================
// TEACHER PROFILE
// ==================================================
const profileBackBtn = document.getElementById('profile-back-btn');
const profileFirstName = document.getElementById('profile-first-name');
const profileLastName = document.getElementById('profile-last-name');
const profileSaveNameBtn = document.getElementById('profile-save-name-btn');
const profileRepCheckbox = document.getElementById('profile-rep-checkbox');
const profileAssignmentsList = document.getElementById('profile-assignments-list');
const profileAddAssignmentBtn = document.getElementById('profile-add-assignment-btn');
const profileCombineActions = document.getElementById('profile-combine-actions');
const profileHistoryList = document.getElementById('profile-history-list');

let currentProfileTeacherId = null;
let profileReturnSection = 'dashboard-section';

function distinctEmailCount(assignments) {
  const emails = new Set(assignments.map((a) => normalizeForCompare(a.email)).filter(Boolean));
  return emails.size;
}

function profileAssignmentRowHtml(a, showDefaultOption, defaultAssignmentId) {
  const defaultOption = showDefaultOption
    ? `
      <label class="default-email-label">
        <input type="radio" name="default-email" class="default-email-radio" ${a.id === defaultAssignmentId ? 'checked' : ''} />
        Default
      </label>
    `
    : '';

  return `
    <div class="profile-assignment-row" data-assignment-id="${a.id}">
      <input type="text" class="assignment-field" data-field="school" value="${a.school ?? ''}" title="${a.school ?? ''}" placeholder="School" />
      <input type="text" class="assignment-field" data-field="level" value="${a.level ?? ''}" title="${a.level ?? ''}" placeholder="Level" />
      <input type="text" class="assignment-field" data-field="subject" value="${a.subject ?? ''}" title="${a.subject ?? ''}" placeholder="Subject" />
      <input type="text" class="assignment-field" data-field="email" value="${a.email ?? ''}" title="${a.email ?? ''}" placeholder="Email" />
      <input type="text" class="assignment-field" data-field="district" value="${a.district ?? ''}" title="${a.district ?? ''}" placeholder="District" />
      <span>
        <button class="btn btn-navy btn-sm save-assignment-btn">Save</button>
        <button class="btn btn-ghost btn-sm delete-assignment-btn">Delete</button>
      </span>
      ${defaultOption}
    </div>
  `;
}

function profileSendHistoryRowHtml(record) {
  const type = record.template_name || record.group_name || 'Direct';
  const date = record.generated_at ? new Date(record.generated_at).toLocaleString() : '';
  return `
    <tr>
      <td>${date}</td>
      <td>${type}</td>
      <td>${record.school ?? ''}</td>
      <td>${record.recipient_field ?? ''}</td>
      <td>${record.status ?? ''}</td>
    </tr>
  `;
}

async function openProfile(teacherId, fromSection) {
  if (fromSection) profileReturnSection = fromSection;
  currentProfileTeacherId = teacherId;
  await renderProfile();
  showPage('profile-section');
}

async function renderProfile() {
  const teacher = await window.signal.getTeacher(currentProfileTeacherId);
  profileFirstName.value = teacher.first_name ?? '';
  profileLastName.value = teacher.last_name ?? '';
  profileRepCheckbox.checked = !!teacher.is_district_rep;

  const showDefaultOption = distinctEmailCount(teacher.assignments) > 1;
  profileAssignmentsList.innerHTML =
    teacher.assignments
      .map((a) => profileAssignmentRowHtml(a, showDefaultOption, teacher.default_assignment_id))
      .join('') || '<p class="hint">No assignments yet.</p>';

  profileAssignmentsList.querySelectorAll('.default-email-radio').forEach((radio) => {
    radio.addEventListener('change', async (e) => {
      if (!e.target.checked) return;
      const row = e.target.closest('.profile-assignment-row');
      await window.signal.setDefaultAssignment(currentProfileTeacherId, Number(row.dataset.assignmentId));
      await renderProfile();
    });
  });

  const combineButtons = [];
  if (hasDuplicateAssignments(teacher.assignments)) {
    combineButtons.push('<button id="profile-dedupe-btn" class="btn btn-ghost btn-sm">Combine Duplicate Info</button>');
  }
  if (hasEmailMergeOpportunity(teacher.assignments)) {
    combineButtons.push('<button id="profile-combine-email-btn" class="btn btn-ghost btn-sm">Combine Same-Email Assignments</button>');
  }
  profileCombineActions.innerHTML = combineButtons.join(' ') || '<p class="hint">Nothing to clean up.</p>';

  const dedupeBtn = document.getElementById('profile-dedupe-btn');
  if (dedupeBtn) {
    dedupeBtn.addEventListener('click', async () => {
      await window.signal.dedupeTeacherAssignments(currentProfileTeacherId);
      await renderProfile();
    });
  }
  const combineEmailBtn = document.getElementById('profile-combine-email-btn');
  if (combineEmailBtn) {
    combineEmailBtn.addEventListener('click', async () => {
      await window.signal.combineByEmail(currentProfileTeacherId);
      await renderProfile();
    });
  }

  const records = await window.signal.listSendsForTeacher(currentProfileTeacherId);
  profileHistoryList.innerHTML = records.length
    ? `
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>School</th><th>Field</th><th>Status</th></tr></thead>
        <tbody>${records.map(profileSendHistoryRowHtml).join('')}</tbody>
      </table>
    `
    : '<p class="hint">No sends recorded for this teacher yet.</p>';

  profileAssignmentsList.querySelectorAll('.save-assignment-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('.profile-assignment-row');
      const assignmentId = Number(row.dataset.assignmentId);
      const fields = {};
      row.querySelectorAll('.assignment-field').forEach((input) => {
        fields[input.dataset.field] = input.value;
      });
      await window.signal.updateAssignment(assignmentId, fields);
      await renderProfile();
    });
  });

  profileAssignmentsList.querySelectorAll('.delete-assignment-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const row = e.target.closest('.profile-assignment-row');
      await window.signal.deleteAssignment(Number(row.dataset.assignmentId));
      await renderProfile();
    });
  });
}

profileBackBtn.addEventListener('click', () => {
  showPage(profileReturnSection);
  if (profileReturnSection === 'dashboard-section') loadDashboard();
});

profileSaveNameBtn.addEventListener('click', async () => {
  await window.signal.updateTeacherName(currentProfileTeacherId, profileFirstName.value, profileLastName.value);
});

profileRepCheckbox.addEventListener('change', async () => {
  await window.signal.setDistrictRep(currentProfileTeacherId, profileRepCheckbox.checked);
});

profileAddAssignmentBtn.addEventListener('click', async () => {
  await window.signal.addAssignment(currentProfileTeacherId, {
    school: '', level: '', subject: '', email: '', district: '',
  });
  await renderProfile();
});

// ==================================================
// SHARED HELPERS (used by Roster list + Profile)
// ==================================================
function normalizeForCompare(value) {
  return String(value ?? '').trim().toLowerCase();
}

function hasDuplicateAssignments(assignments) {
  const seen = new Set();
  for (const a of assignments) {
    const key = [a.school, a.level, a.subject, a.email].map(normalizeForCompare).join('|');
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function hasEmailMergeOpportunity(assignments) {
  const seen = new Set();
  for (const a of assignments) {
    const email = normalizeForCompare(a.email);
    if (!email) continue;
    if (seen.has(email)) return true;
    seen.add(email);
  }
  return false;
}

// ==================================================
// ROSTER (import + compact teacher list + duplicates)
// ==================================================
const uploadBtn = document.getElementById('upload-btn');
const autoCombineBtn = document.getElementById('auto-combine-btn');
const statusEl = document.getElementById('status');
const teachersList = document.getElementById('teachers-list');
const duplicatesPanel = document.getElementById('duplicates-panel');
const duplicatesList = document.getElementById('duplicates-list');

const importPreviewPanel = document.getElementById('import-preview-panel');
const previewSummary = document.getElementById('preview-summary');
const previewRowsEl = document.getElementById('preview-rows');
const confirmImportBtn = document.getElementById('confirm-import-btn');
const cancelImportBtn = document.getElementById('cancel-import-btn');

let previewRows = [];

function teacherRowHtml(teacher) {
  const schools = [...new Set(teacher.assignments.map((a) => a.school).filter(Boolean))];
  const repBadge = teacher.is_district_rep ? '<span class="badge badge-green">District Rep</span>' : '';
  return `
    <div class="search-result-row" data-teacher-id="${teacher.id}">
      <span>${teacher.first_name ?? ''} ${teacher.last_name ?? ''} ${repBadge} <span class="hint">${schools.join(', ')}</span></span>
      <span class="hint">View Profile &rarr;</span>
    </div>
  `;
}

function renderTeachersAccordion(teachers) {
  if (teachers.length === 0) {
    teachersList.innerHTML = '<p class="hint">No teachers imported yet.</p>';
    return;
  }

  const byDistrict = new Map();
  for (const t of teachers) {
    const districts = new Set(
      t.assignments.map((a) => (a.district && a.district.trim() ? a.district.trim() : null)).filter(Boolean)
    );
    if (districts.size === 0) districts.add('No District');
    for (const d of districts) {
      if (!byDistrict.has(d)) byDistrict.set(d, []);
      byDistrict.get(d).push(t);
    }
  }

  const sortedDistricts = [...byDistrict.keys()].sort((a, b) => a.localeCompare(b));

  teachersList.innerHTML = sortedDistricts
    .map((district) => {
      const members = byDistrict
        .get(district)
        .sort((a, b) =>
          `${a.last_name ?? ''} ${a.first_name ?? ''}`.localeCompare(`${b.last_name ?? ''} ${b.first_name ?? ''}`)
        );
      return `
        <details class="district-accordion" open>
          <summary>${district} (${members.length})</summary>
          ${members.map(teacherRowHtml).join('')}
        </details>
      `;
    })
    .join('');

  teachersList.querySelectorAll('.search-result-row').forEach((row) => {
    row.addEventListener('click', () => openProfile(Number(row.dataset.teacherId), 'roster-section'));
  });
}

async function loadTeachers() {
  const teachers = await window.signal.listTeachers();
  renderTeachersAccordion(teachers);
}

function duplicateGroup(dup) {
  const keepId = dup.teacherIds[0];
  const mergeIds = dup.teacherIds.slice(1);
  const chipClass = dup.reason === 'Same email' ? 'chip-yellow' : 'chip-gray';

  return `
    <div class="duplicate-group">
      <span class="chip ${chipClass}">${dup.reason}</span>
      <strong>${dup.label}</strong> — ${dup.teacherIds.length} separate profiles
      <br />
      <button class="btn btn-navy btn-sm merge-btn" data-keep-id="${keepId}" data-merge-ids="${mergeIds.join(',')}">
        Combine into one profile
      </button>
    </div>
  `;
}

async function loadDuplicates() {
  const duplicates = await window.signal.listDuplicates();

  duplicatesPanel.classList.toggle('hidden', duplicates.length === 0);
  if (duplicates.length === 0) return;

  duplicatesList.innerHTML = duplicates.map(duplicateGroup).join('');

  duplicatesList.querySelectorAll('.merge-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const keepId = Number(e.target.dataset.keepId);
      const mergeIds = e.target.dataset.mergeIds.split(',').map(Number);
      await window.signal.mergeTeachers(keepId, mergeIds);
      await loadTeachers();
      await loadDuplicates();
    });
  });
}

function previewRowHtml(row, index) {
  return `
    <div class="preview-row">
      <input type="checkbox" class="preview-checkbox" data-index="${index}" checked />
      <span>${row.first_name ?? ''} ${row.last_name ?? ''}</span>
      <span>${row.school ?? ''}</span>
      <span>${row.subject ?? ''}</span>
      <span>${row.email ?? ''}</span>
      <span>${row.district ?? ''}</span>
      <span class="chip chip-green">New</span>
    </div>
  `;
}

function renderPreview() {
  const newRows = previewRows.filter((r) => !r.isDuplicate);
  const duplicateCount = previewRows.length - newRows.length;

  previewSummary.textContent =
    duplicateCount > 0
      ? `${duplicateCount} row(s) already imported were skipped automatically. ${newRows.length} new row(s) below — review and import.`
      : `${newRows.length} new row(s) found — review and import.`;

  previewRowsEl.innerHTML = newRows.length
    ? newRows.map(previewRowHtml).join('')
    : '<p class="hint">Nothing new to import.</p>';

  previewRows = newRows;
  importPreviewPanel.classList.remove('hidden');
  confirmImportBtn.classList.remove('hidden');
  cancelImportBtn.classList.remove('hidden');
}

uploadBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Reading file...';
  const result = await window.signal.previewImport();

  if (result.canceled) {
    statusEl.textContent = '';
    return;
  }

  previewRows = result.rows;
  statusEl.textContent = '';
  renderPreview();
});

confirmImportBtn.addEventListener('click', async () => {
  const checked = Array.from(previewRowsEl.querySelectorAll('.preview-checkbox'))
    .filter((cb) => cb.checked)
    .map((cb) => previewRows[Number(cb.dataset.index)]);

  if (checked.length === 0) {
    importPreviewPanel.classList.add('hidden');
    confirmImportBtn.classList.add('hidden');
    cancelImportBtn.classList.add('hidden');
    return;
  }

  const result = await window.signal.confirmImport(checked);
  statusEl.textContent = `Imported ${result.count} row(s).`;
  importPreviewPanel.classList.add('hidden');
  confirmImportBtn.classList.add('hidden');
  cancelImportBtn.classList.add('hidden');
  previewRows = [];

  await loadTeachers();
  await loadDuplicates();
});

cancelImportBtn.addEventListener('click', () => {
  importPreviewPanel.classList.add('hidden');
  confirmImportBtn.classList.add('hidden');
  cancelImportBtn.classList.add('hidden');
  previewRows = [];
  statusEl.textContent = '';
});

autoCombineBtn.addEventListener('click', async () => {
  const result = await window.signal.dedupeAllAssignments();
  statusEl.textContent = `Removed ${result.removed} duplicate row(s) across all teachers.`;
  await loadTeachers();
});

document.getElementById('download-template-btn').addEventListener('click', async () => {
  const result = await window.signal.downloadRosterTemplate();
  statusEl.textContent = result.canceled ? '' : `Template saved to ${result.filePath}`;
});

// ==================================================
// TEMPLATES (standalone quick-access, same as before)
// ==================================================
const uploadTemplateBtn = document.getElementById('upload-template-btn');
const templateStatusEl = document.getElementById('template-status');
const templatesListEl = document.getElementById('templates-list');
const labelMapPanel = document.getElementById('label-map-panel');
const labelMapListEl = document.getElementById('label-map-list');
const recipientPanel = document.getElementById('recipient-panel');
const recipientListEl = document.getElementById('recipient-list');
const selectAllRecipientsBtn = document.getElementById('select-all-recipients-btn');
const clearRecipientsBtn = document.getElementById('clear-recipients-btn');
const generatePreviewBtn = document.getElementById('generate-preview-btn');
const batchPreviewPanel = document.getElementById('batch-preview-panel');
const batchPreviewListEl = document.getElementById('batch-preview-list');
const openAllBtn = document.getElementById('open-all-btn');

let currentTemplateId = null;
let currentTemplateName = '';
let currentRecipients = [];
let currentBatchResults = [];

function templateRowHtml(t) {
  const labels = JSON.parse(t.detected_labels_json || '[]');
  return `
    <div class="template-row">
      <span>${t.file_name} — ${labels.length} label(s) — ${new Date(t.uploaded_at).toLocaleString()}</span>
      <button class="btn btn-ghost btn-sm select-template-btn" data-template-id="${t.id}" data-template-name="${t.file_name}">
        Select
      </button>
    </div>
  `;
}

async function loadTemplates() {
  const templates = await window.signal.listTemplates();
  templatesListEl.innerHTML = templates.map(templateRowHtml).join('') || '<p class="hint">No templates uploaded yet.</p>';

  templatesListEl.querySelectorAll('.select-template-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectTemplate(Number(btn.dataset.templateId), btn.dataset.templateName);
    });
  });
}

function labelMapRowHtml(lm, availableFields) {
  const options = ['<option value="">-- Unmapped --</option>']
    .concat(
      availableFields.map(
        (f) =>
          `<option value="${f.column}" ${lm.matched_column === f.column ? 'selected' : ''}>${f.label}</option>`
      )
    )
    .join('');

  const warning = lm.matched_column ? '' : '<span class="chip chip-yellow">Needs mapping</span>';

  return `
    <div class="label-map-row">
      <span>[${lm.label_name}] ${warning}</span>
      <select class="label-map-select" data-label-map-id="${lm.id}">${options}</select>
    </div>
  `;
}

async function selectTemplate(templateId, templateName) {
  currentTemplateId = templateId;
  currentTemplateName = templateName;

  const { labelMaps, availableFields } = await window.signal.getLabelMaps(templateId);
  labelMapListEl.innerHTML = labelMaps.map((lm) => labelMapRowHtml(lm, availableFields)).join('');
  labelMapPanel.classList.remove('hidden');

  labelMapListEl.querySelectorAll('.label-map-select').forEach((select) => {
    select.addEventListener('change', async (e) => {
      const labelMapId = Number(e.target.dataset.labelMapId);
      await window.signal.setLabelMap(labelMapId, e.target.value || null);
      selectTemplate(templateId, templateName);
    });
  });

  currentRecipients = await window.signal.filterAssignments({});
  recipientListEl.innerHTML = currentRecipients.map(recipientRowHtml).join('') || '<p class="hint">No recipients with an email on file yet.</p>';
  recipientPanel.classList.remove('hidden');
  batchPreviewPanel.classList.add('hidden');
}

function recipientRowHtml(r) {
  return `
    <div class="recipient-row">
      <input type="checkbox" class="recipient-checkbox" data-assignment-id="${r.assignment_id}" />
      <span>${r.first_name ?? ''} ${r.last_name ?? ''}</span>
      <span>${r.school ?? ''}</span>
      <span>${r.subject ?? ''}</span>
      <span>${r.email ?? ''}</span>
    </div>
  `;
}

uploadTemplateBtn.addEventListener('click', async () => {
  templateStatusEl.textContent = 'Reading file...';
  const result = await window.signal.uploadTemplate();

  if (result.canceled) {
    templateStatusEl.textContent = '';
    return;
  }

  templateStatusEl.textContent = `Uploaded "${result.fileName}" — ${result.labels.length} label(s) detected.`;
  await loadTemplates();
  selectTemplate(result.templateId, result.fileName);
});

selectAllRecipientsBtn.addEventListener('click', () => {
  recipientListEl.querySelectorAll('.recipient-checkbox').forEach((cb) => (cb.checked = true));
});

clearRecipientsBtn.addEventListener('click', () => {
  recipientListEl.querySelectorAll('.recipient-checkbox').forEach((cb) => (cb.checked = false));
});

function filledLetterHtml(result, index) {
  return `
    <div class="filled-letter">
      <strong>${result.name}</strong> — ${result.email}
      <pre>${result.filledText}</pre>
      <button class="btn btn-navy btn-sm open-one-btn" data-index="${index}">Open in Mail Client</button>
    </div>
  `;
}

function encodeMailtoQuery(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

function buildMailtoUrl(email, subject, body) {
  const query = encodeMailtoQuery({ subject, body });
  return `mailto:${encodeURIComponent(email)}${query ? `?${query}` : ''}`;
}

async function openBatchEntry(result, templateId, templateName, projectId) {
  const subject = (templateName || '').replace(/\.docx$/i, '');
  const url = buildMailtoUrl(result.email, subject, result.filledText);
  await window.signal.openMailto(url, [
    {
      assignmentId: result.assignmentId,
      templateId,
      groupId: null,
      projectId: projectId ?? null,
      recipientField: 'to',
    },
  ]);
}

generatePreviewBtn.addEventListener('click', async () => {
  const assignmentIds = Array.from(recipientListEl.querySelectorAll('.recipient-checkbox'))
    .filter((cb) => cb.checked)
    .map((cb) => Number(cb.dataset.assignmentId));

  if (assignmentIds.length === 0) {
    templateStatusEl.textContent = 'Select at least one recipient first.';
    return;
  }

  const result = await window.signal.generatePreview(currentTemplateId, assignmentIds);

  if (!result.success) {
    templateStatusEl.textContent = `Map every label before generating. Still unmapped: ${result.unmappedLabels.map((l) => `[${l}]`).join(', ')}`;
    return;
  }

  currentBatchResults = result.results;
  templateStatusEl.textContent = '';
  batchPreviewListEl.innerHTML = currentBatchResults.map(filledLetterHtml).join('');
  batchPreviewPanel.classList.remove('hidden');

  batchPreviewListEl.querySelectorAll('.open-one-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const index = Number(e.target.dataset.index);
      await openBatchEntry(currentBatchResults[index], currentTemplateId, currentTemplateName);
    });
  });
});

openAllBtn.addEventListener('click', async () => {
  for (const result of currentBatchResults) {
    await openBatchEntry(result, currentTemplateId, currentTemplateName);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
});

// ==================================================
// GROUPS (filter + save; accordion by district, live search)
// ==================================================
const filterSchool = document.getElementById('filter-school');
const filterLevel = document.getElementById('filter-level');
const filterSubject = document.getElementById('filter-subject');
const filterDistrict = document.getElementById('filter-district');
const filterGroup = document.getElementById('filter-group');
const filterSearch = document.getElementById('filter-search');
const filterRepsOnly = document.getElementById('filter-reps-only');
const applyFiltersBtn = document.getElementById('apply-filters-btn');
const filterResultsEl = document.getElementById('filter-results');
const selectAllFilteredBtn = document.getElementById('select-all-filtered-btn');
const saveGroupBtn = document.getElementById('save-group-btn');
const groupsSendEmailBtn = document.getElementById('groups-send-email-btn');
const savedGroupsListEl = document.getElementById('saved-groups-list');

let currentFilterResults = [];

function populateSelect(selectEl, values) {
  const current = selectEl.value;
  selectEl.innerHTML =
    `<option value="">${selectEl.dataset.allLabel || 'All'}</option>` +
    values.map((v) => `<option value="${v}">${v}</option>`).join('');
  selectEl.value = current;
}

async function loadGroupsSection() {
  const options = await window.signal.listFilterOptions();
  filterSchool.dataset.allLabel = 'All Schools';
  filterLevel.dataset.allLabel = 'All Levels';
  filterSubject.dataset.allLabel = 'All Subjects';
  filterDistrict.dataset.allLabel = 'All Districts';
  populateSelect(filterSchool, options.schools);
  populateSelect(filterLevel, options.levels);
  populateSelect(filterSubject, options.subjects);
  populateSelect(filterDistrict, options.districts);

  await refreshGroupFilterOptions();
  await applyFilters();
  await loadSavedGroups();
}

async function refreshGroupFilterOptions() {
  const groups = await window.signal.listGroups();
  const current = filterGroup.value;
  filterGroup.innerHTML =
    '<option value="">All Groups</option>' +
    groups.map((g) => `<option value="${g.id}">${g.name}</option>`).join('');
  filterGroup.value = current;
}

async function applyFilters() {
  currentFilterResults = await window.signal.filterAssignments({
    school: filterSchool.value,
    level: filterLevel.value,
    subject: filterSubject.value,
    district: filterDistrict.value,
    groupId: filterGroup.value,
    repsOnly: filterRepsOnly.checked,
  });

  renderFilterResultsAccordion(currentFilterResults, filterSearch.value);
}

function filterResultRowHtml(r) {
  const repTag = r.is_district_rep ? '<span class="chip chip-green">Rep</span>' : '';
  return `
    <div class="filter-result-row">
      <input type="checkbox" class="filter-checkbox" data-assignment-id="${r.assignment_id}" />
      <span>${r.first_name ?? ''} ${r.last_name ?? ''} ${repTag}</span>
      <span>${r.school ?? ''}</span>
      <span>${r.subject ?? ''}</span>
      <span>${r.email ?? ''}</span>
    </div>
  `;
}

function renderFilterResultsAccordion(results, searchTerm) {
  const term = String(searchTerm ?? '').trim().toLowerCase();
  const filtered = term
    ? results.filter((r) =>
        `${r.first_name ?? ''} ${r.last_name ?? ''}`.toLowerCase().includes(term)
      )
    : results;

  if (filtered.length === 0) {
    filterResultsEl.innerHTML = '<p class="hint">No matching teachers.</p>';
    return;
  }

  const byDistrict = new Map();
  for (const r of filtered) {
    const district = r.district && r.district.trim() ? r.district.trim() : 'No District';
    if (!byDistrict.has(district)) byDistrict.set(district, []);
    byDistrict.get(district).push(r);
  }

  const sortedDistricts = [...byDistrict.keys()].sort((a, b) => a.localeCompare(b));

  const hasActiveFilter = Boolean(
    filterSchool.value ||
      filterLevel.value ||
      filterSubject.value ||
      filterDistrict.value ||
      filterRepsOnly.checked ||
      term
  );

  filterResultsEl.innerHTML = sortedDistricts
    .map((district) => {
      const members = byDistrict
        .get(district)
        .sort((a, b) =>
          `${a.last_name ?? ''} ${a.first_name ?? ''}`.localeCompare(`${b.last_name ?? ''} ${b.first_name ?? ''}`)
        );
      return `
        <details class="district-accordion" ${hasActiveFilter ? 'open' : ''}>
          <summary>${district} (${members.length})</summary>
          ${members.map(filterResultRowHtml).join('')}
        </details>
      `;
    })
    .join('');

  updateGroupsSendEmailButton();
}

function updateGroupsSendEmailButton() {
  const checkedCount = filterResultsEl.querySelectorAll('.filter-checkbox:checked').length;
  if (checkedCount > 0) {
    groupsSendEmailBtn.textContent = `Send Email (${checkedCount} selected)`;
    groupsSendEmailBtn.classList.remove('hidden');
  } else {
    groupsSendEmailBtn.classList.add('hidden');
  }
}

function groupRowHtml(g) {
  return `
    <div class="group-row">
      <span>${g.name} — ${g.member_count} member(s)</span>
      <button class="btn btn-ghost btn-sm delete-group-btn" data-group-id="${g.id}">Delete</button>
    </div>
  `;
}

async function loadSavedGroups() {
  const groups = await window.signal.listGroups();
  savedGroupsListEl.innerHTML = groups.map(groupRowHtml).join('') || '<p class="hint">No saved groups yet.</p>';

  savedGroupsListEl.querySelectorAll('.delete-group-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.signal.deleteGroup(Number(btn.dataset.groupId));
      await loadSavedGroups();
      await refreshGroupFilterOptions();
    });
  });
}

applyFiltersBtn.addEventListener('click', applyFilters);

[filterSchool, filterLevel, filterSubject, filterDistrict, filterGroup, filterRepsOnly].forEach((el) => {
  el.addEventListener('change', applyFilters);
});

filterSearch.addEventListener('input', () => {
  renderFilterResultsAccordion(currentFilterResults, filterSearch.value);
});

filterResultsEl.addEventListener('change', (e) => {
  if (e.target.classList.contains('filter-checkbox')) updateGroupsSendEmailButton();
});

selectAllFilteredBtn.addEventListener('click', () => {
  filterResultsEl.querySelectorAll('.filter-checkbox').forEach((cb) => (cb.checked = true));
  updateGroupsSendEmailButton();
});

groupsSendEmailBtn.addEventListener('click', () => {
  const selectedIds = new Set(
    Array.from(filterResultsEl.querySelectorAll('.filter-checkbox:checked')).map((cb) =>
      Number(cb.dataset.assignmentId)
    )
  );
  const selected = currentFilterResults.filter((r) => selectedIds.has(r.assignment_id));
  if (selected.length === 0) return;

  startWizardWithPresetRecipients(selected);
});

saveGroupBtn.addEventListener('click', async () => {
  const selectedIds = Array.from(filterResultsEl.querySelectorAll('.filter-checkbox'))
    .filter((cb) => cb.checked)
    .map((cb) => Number(cb.dataset.assignmentId));

  if (selectedIds.length === 0) return;

  const name = window.prompt('Name this group:');
  if (!name) return;

  await window.signal.createGroup(name, selectedIds);
  await loadSavedGroups();
  await refreshGroupFilterOptions();
});

// ==================================================
// CREATE GROUP (build from scratch: search + add members one at a time)
// ==================================================
const createGroupNameInput = document.getElementById('create-group-name');
const createGroupSearchInput = document.getElementById('create-group-search');
const createGroupSearchResultsEl = document.getElementById('create-group-search-results');
const createGroupMembersEl = document.getElementById('create-group-members');
const createGroupBtn = document.getElementById('create-group-btn');
const createGroupModalOverlay = document.getElementById('create-group-modal-overlay');
const openCreateGroupModalBtn = document.getElementById('open-create-group-modal-btn');
const cancelCreateGroupBtn = document.getElementById('cancel-create-group-btn');

function closeCreateGroupModal() {
  createGroupModalOverlay.classList.add('hidden');
  createGroupNameInput.value = '';
  createGroupSearchInput.value = '';
  createGroupSelectedMembers = new Map();
  createGroupSearchResultsEl.innerHTML = '';
  renderCreateGroupMembers();
}

openCreateGroupModalBtn.addEventListener('click', () => {
  createGroupModalOverlay.classList.remove('hidden');
});

cancelCreateGroupBtn.addEventListener('click', closeCreateGroupModal);

createGroupModalOverlay.addEventListener('click', (e) => {
  if (e.target === createGroupModalOverlay) closeCreateGroupModal();
});

let createGroupSelectedMembers = new Map(); // assignment_id -> recipient row

function createGroupSearchResultRowHtml(r) {
  const already = createGroupSelectedMembers.has(r.assignment_id);
  return `
    <div class="create-group-result-row">
      <span>${r.first_name ?? ''} ${r.last_name ?? ''} — ${r.school ?? ''} — ${r.email ?? ''}</span>
      <button class="btn btn-ghost btn-sm create-group-add-btn" data-assignment-id="${r.assignment_id}" ${already ? 'disabled' : ''}>
        ${already ? 'Added' : '+ Add'}
      </button>
    </div>
  `;
}

async function runCreateGroupSearch() {
  const term = createGroupSearchInput.value.trim();
  if (!term) {
    createGroupSearchResultsEl.innerHTML = '';
    return;
  }
  const results = await window.signal.filterAssignments({ search: term });
  createGroupSearchResultsEl.innerHTML =
    results.map(createGroupSearchResultRowHtml).join('') || '<p class="hint">No matches.</p>';

  createGroupSearchResultsEl.querySelectorAll('.create-group-add-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const assignmentId = Number(btn.dataset.assignmentId);
      const recipient = results.find((r) => r.assignment_id === assignmentId);
      if (recipient) createGroupSelectedMembers.set(assignmentId, recipient);
      renderCreateGroupMembers();
      runCreateGroupSearch();
    });
  });
}

function renderCreateGroupMembers() {
  const members = [...createGroupSelectedMembers.values()];
  createGroupMembersEl.innerHTML =
    members
      .map(
        (r) => `
      <div class="create-group-member-row">
        <span>${r.first_name ?? ''} ${r.last_name ?? ''} — ${r.email ?? ''}</span>
        <button class="btn btn-ghost btn-sm create-group-remove-btn" data-assignment-id="${r.assignment_id}">Remove</button>
      </div>
    `
      )
      .join('') || '<p class="hint">No members added yet.</p>';

  createGroupMembersEl.querySelectorAll('.create-group-remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      createGroupSelectedMembers.delete(Number(btn.dataset.assignmentId));
      renderCreateGroupMembers();
      runCreateGroupSearch();
    });
  });
}

createGroupSearchInput.addEventListener('input', runCreateGroupSearch);

createGroupBtn.addEventListener('click', async () => {
  const name = createGroupNameInput.value.trim();
  if (!name || createGroupSelectedMembers.size === 0) return;

  await window.signal.createGroup(name, [...createGroupSelectedMembers.keys()]);
  closeCreateGroupModal();

  await loadSavedGroups();
  await refreshGroupFilterOptions();
});

// ==================================================
// COMPOSE WIZARD
// ==================================================
const wizardStepIndicator = document.getElementById('wizard-step-indicator');
const wizardSteps = {
  1: document.getElementById('wizard-step-1'),
  2: document.getElementById('wizard-step-2'),
  '3-personalized': document.getElementById('wizard-step-3-personalized'),
  '3-announcement': document.getElementById('wizard-step-3-announcement'),
  '4-personalized': document.getElementById('wizard-step-4-personalized'),
  '4-announcement': document.getElementById('wizard-step-4-announcement'),
};

const wizardState = {
  type: null, // 'personalized' | 'announcement'
  recipients: [], // array of filterAssignments-shaped rows
  templateId: null,
  templateName: '',
  batchResults: [],
  projectId: null,
};

function showWizardStep(key) {
  Object.values(wizardSteps).forEach((el) => el.classList.add('hidden'));
  wizardSteps[key].classList.remove('hidden');
  const stepNumberLabel = { 1: '1 of 4', 2: '2 of 4', '3-personalized': '3 of 4', '3-announcement': '3 of 4', '4-personalized': '4 of 4', '4-announcement': '4 of 4' };
  wizardStepIndicator.textContent = `Step ${stepNumberLabel[key]}`;
}

function resetWizard() {
  wizardState.type = null;
  wizardState.recipients = [];
  wizardState.templateId = null;
  wizardState.templateName = '';
  wizardState.batchResults = [];
  wizardState.projectId = null;
}

async function loadWizardProjectOptions(selectEl) {
  const projects = await window.signal.listProjects();
  const active = projects.filter((p) => p.status !== 'archived');
  selectEl.innerHTML =
    '<option value="">-- No Project --</option>' +
    active.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
}

let presetWizardRecipients = null;

async function startWizard() {
  resetWizard();
  presetWizardRecipients = null;
  showPage('wizard-section');
  showWizardStep(1);
  await loadWizardFilterOptions();
  await loadWizardGroupOptions();
}

function startWizardWithPresetRecipients(recipients) {
  resetWizard();
  presetWizardRecipients = recipients;
  showPage('wizard-section');
  showWizardStep(1);
}

async function proceedToStep3() {
  if (wizardState.type === 'personalized') {
    await loadWizardTemplateOptions();
    showWizardStep('3-personalized');
  } else {
    renderWizardRecipientFields();
    showWizardStep('3-announcement');
  }
}

document.querySelectorAll('.wizard-choice-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    wizardState.type = btn.dataset.type;

    if (presetWizardRecipients) {
      wizardState.recipients = presetWizardRecipients;
      presetWizardRecipients = null;
      await proceedToStep3();
      return;
    }

    await refreshWizardRecipientList();
    showWizardStep(2);
  });
});

document.querySelectorAll('.wizard-cancel-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    resetWizard();
    showPage('dashboard-section');
    loadDashboard();
  });
});

document.querySelectorAll('.wizard-back-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const current = Object.entries(wizardSteps).find(([, el]) => !el.classList.contains('hidden'))[0];
    if (current === '2') showWizardStep(1);
    else if (current === '3-personalized' || current === '3-announcement') showWizardStep(2);
    else if (current === '4-personalized') showWizardStep('3-personalized');
    else if (current === '4-announcement') showWizardStep('3-announcement');
  });
});

// -- Step 2: recipients --
const wizardFilterSchool = document.getElementById('wizard-filter-school');
const wizardFilterLevel = document.getElementById('wizard-filter-level');
const wizardFilterSubject = document.getElementById('wizard-filter-subject');
const wizardFilterDistrict = document.getElementById('wizard-filter-district');
const wizardFilterSearch = document.getElementById('wizard-filter-search');
const wizardFilterRepsOnly = document.getElementById('wizard-filter-reps-only');
const wizardApplyFiltersBtn = document.getElementById('wizard-apply-filters-btn');
const wizardSelectAllBtn = document.getElementById('wizard-select-all-btn');
const wizardSelectedCount = document.getElementById('wizard-selected-count');
const wizardRecipientList = document.getElementById('wizard-recipient-list');
const wizardSavedGroupSelect = document.getElementById('wizard-saved-group-select');
const wizardStep2NextBtn = document.getElementById('wizard-step2-next-btn');

let wizardFilteredResults = [];
let wizardSelectedIds = new Set();

async function loadWizardFilterOptions() {
  const options = await window.signal.listFilterOptions();
  wizardFilterSchool.dataset.allLabel = 'All Schools';
  wizardFilterLevel.dataset.allLabel = 'All Levels';
  wizardFilterSubject.dataset.allLabel = 'All Subjects';
  wizardFilterDistrict.dataset.allLabel = 'All Districts';
  populateSelect(wizardFilterSchool, options.schools);
  populateSelect(wizardFilterLevel, options.levels);
  populateSelect(wizardFilterSubject, options.subjects);
  populateSelect(wizardFilterDistrict, options.districts);
}

async function loadWizardGroupOptions() {
  const groups = await window.signal.listGroups();
  wizardSavedGroupSelect.innerHTML =
    '<option value="">-- Or pick a saved group --</option>' +
    groups.map((g) => `<option value="${g.id}">${g.name} (${g.member_count})</option>`).join('');
}

function wizardRecipientRowHtml(r) {
  const repTag = r.is_district_rep ? '<span class="chip chip-green">Rep</span>' : '';
  const checked = wizardSelectedIds.has(r.assignment_id) ? 'checked' : '';
  return `
    <div class="filter-result-row">
      <input type="checkbox" class="wizard-recipient-checkbox" data-assignment-id="${r.assignment_id}" ${checked} />
      <span>${r.first_name ?? ''} ${r.last_name ?? ''} ${repTag}</span>
      <span>${r.school ?? ''}</span>
      <span>${r.subject ?? ''}</span>
      <span>${r.email ?? ''}</span>
    </div>
  `;
}

function renderWizardRecipientList() {
  wizardRecipientList.innerHTML =
    wizardFilteredResults.map(wizardRecipientRowHtml).join('') || '<p class="hint">No matching teachers.</p>';

  wizardRecipientList.querySelectorAll('.wizard-recipient-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = Number(cb.dataset.assignmentId);
      if (cb.checked) wizardSelectedIds.add(id);
      else wizardSelectedIds.delete(id);
      updateWizardSelectedCount();
    });
  });
  updateWizardSelectedCount();
}

function updateWizardSelectedCount() {
  wizardSelectedCount.textContent = `${wizardSelectedIds.size} recipient(s) selected`;
}

async function refreshWizardRecipientList() {
  wizardFilteredResults = await window.signal.filterAssignments({
    school: wizardFilterSchool.value,
    level: wizardFilterLevel.value,
    subject: wizardFilterSubject.value,
    district: wizardFilterDistrict.value,
    search: wizardFilterSearch.value,
    repsOnly: wizardFilterRepsOnly.checked,
  });
  renderWizardRecipientList();
}

wizardApplyFiltersBtn.addEventListener('click', refreshWizardRecipientList);

wizardSelectAllBtn.addEventListener('click', () => {
  wizardFilteredResults.forEach((r) => wizardSelectedIds.add(r.assignment_id));
  renderWizardRecipientList();
});

wizardSavedGroupSelect.addEventListener('change', async () => {
  if (!wizardSavedGroupSelect.value) return;
  const members = await window.signal.getGroupMembers(Number(wizardSavedGroupSelect.value));
  members.forEach((m) => wizardSelectedIds.add(m.assignment_id));
  wizardFilteredResults = members;
  renderWizardRecipientList();
});

wizardStep2NextBtn.addEventListener('click', async () => {
  if (wizardSelectedIds.size === 0) return;

  // resolve full recipient objects for every selected id, across whatever lists we've seen
  const byId = new Map();
  [...wizardFilteredResults, ...currentFilterResults].forEach((r) => byId.set(r.assignment_id, r));
  wizardState.recipients = [...wizardSelectedIds].map((id) => byId.get(id)).filter(Boolean);
  await proceedToStep3();
});

// -- Step 3a: personalized template + label mapping --
const wizardTemplateSelect = document.getElementById('wizard-template-select');
const wizardUploadTemplateBtn = document.getElementById('wizard-upload-template-btn');
const wizardTemplateStatus = document.getElementById('wizard-template-status');
const wizardLabelMapList = document.getElementById('wizard-label-map-list');
const wizardStep3PersonalizedNextBtn = document.getElementById('wizard-step3-personalized-next-btn');

async function loadWizardTemplateOptions() {
  const templates = await window.signal.listTemplates();
  wizardTemplateSelect.innerHTML =
    '<option value="">-- Select existing template --</option>' +
    templates.map((t) => `<option value="${t.id}" data-name="${t.file_name}">${t.file_name}</option>`).join('');
}

async function loadWizardLabelMaps() {
  if (!wizardState.templateId) {
    wizardLabelMapList.innerHTML = '';
    return;
  }
  const { labelMaps, availableFields } = await window.signal.getLabelMaps(wizardState.templateId);
  wizardLabelMapList.innerHTML = labelMaps.map((lm) => labelMapRowHtml(lm, availableFields)).join('');

  wizardLabelMapList.querySelectorAll('.label-map-select').forEach((select) => {
    select.addEventListener('change', async (e) => {
      await window.signal.setLabelMap(Number(e.target.dataset.labelMapId), e.target.value || null);
      await loadWizardLabelMaps();
    });
  });
}

wizardTemplateSelect.addEventListener('change', async () => {
  const option = wizardTemplateSelect.selectedOptions[0];
  wizardState.templateId = wizardTemplateSelect.value ? Number(wizardTemplateSelect.value) : null;
  wizardState.templateName = option ? option.dataset.name || '' : '';
  await loadWizardLabelMaps();
});

wizardUploadTemplateBtn.addEventListener('click', async () => {
  wizardTemplateStatus.textContent = 'Reading file...';
  const result = await window.signal.uploadTemplate();

  if (result.canceled) {
    wizardTemplateStatus.textContent = '';
    return;
  }

  wizardTemplateStatus.textContent = `Uploaded "${result.fileName}" — ${result.labels.length} label(s) detected.`;
  wizardState.templateId = result.templateId;
  wizardState.templateName = result.fileName;
  await loadWizardTemplateOptions();
  wizardTemplateSelect.value = String(result.templateId);
  await loadWizardLabelMaps();
});

wizardStep3PersonalizedNextBtn.addEventListener('click', async () => {
  if (!wizardState.templateId) {
    wizardTemplateStatus.textContent = 'Choose or upload a template first.';
    return;
  }

  const assignmentIds = wizardState.recipients.map((r) => r.assignment_id);
  const result = await window.signal.generatePreview(wizardState.templateId, assignmentIds);

  if (!result.success) {
    wizardTemplateStatus.textContent = `Map every label before continuing. Still unmapped: ${result.unmappedLabels.map((l) => `[${l}]`).join(', ')}`;
    return;
  }

  wizardState.batchResults = result.results;
  wizardTemplateStatus.textContent = '';
  renderWizardBatchPreview();
  await loadWizardProjectOptions(wizardProjectSelectPersonalized);
  wizardProjectSelectPersonalized.value = wizardState.projectId ? String(wizardState.projectId) : '';
  showWizardStep('4-personalized');
});

// -- Step 4a: personalized review --
const wizardBatchPreviewList = document.getElementById('wizard-batch-preview-list');
const wizardOpenAllBtn = document.getElementById('wizard-open-all-btn');
const wizardFinishBtn = document.getElementById('wizard-finish-btn');
const wizardProjectSelectPersonalized = document.getElementById('wizard-project-select-personalized');

wizardProjectSelectPersonalized.addEventListener('change', () => {
  wizardState.projectId = wizardProjectSelectPersonalized.value ? Number(wizardProjectSelectPersonalized.value) : null;
});

function wizardFilledLetterHtml(result, index) {
  return `
    <div class="filled-letter">
      <strong>${result.name}</strong> — ${result.email}
      <pre>${result.filledText}</pre>
      <button class="btn btn-navy btn-sm wizard-open-one-btn" data-index="${index}">Open in Mail Client</button>
    </div>
  `;
}

function renderWizardBatchPreview() {
  wizardBatchPreviewList.innerHTML = wizardState.batchResults.map(wizardFilledLetterHtml).join('');
  wizardBatchPreviewList.querySelectorAll('.wizard-open-one-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      await openBatchEntry(
        wizardState.batchResults[Number(e.target.dataset.index)],
        wizardState.templateId,
        wizardState.templateName,
        wizardState.projectId
      );
    });
  });
}

wizardOpenAllBtn.addEventListener('click', async () => {
  for (const result of wizardState.batchResults) {
    await openBatchEntry(result, wizardState.templateId, wizardState.templateName, wizardState.projectId);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
});

wizardFinishBtn.addEventListener('click', () => {
  resetWizard();
  showPage('dashboard-section');
  loadDashboard();
});

// -- Step 3b: announcement content --
const wizardSubject = document.getElementById('wizard-subject');
const wizardBody = document.getElementById('wizard-body');
const wizardRecipientFields = document.getElementById('wizard-recipient-fields');
const wizardStep3AnnouncementNextBtn = document.getElementById('wizard-step3-announcement-next-btn');

function wizardRecipientFieldRowHtml(r, index) {
  return `
    <div class="compose-recipient-row">
      <span>${r.first_name ?? ''} ${r.last_name ?? ''}</span>
      <span>${r.email ?? ''}</span>
      <select class="wizard-field-select" data-index="${index}">
        <option value="to">To</option>
        <option value="cc">Cc</option>
        <option value="bcc" selected>Bcc</option>
      </select>
    </div>
  `;
}

function renderWizardRecipientFields() {
  wizardRecipientFields.innerHTML = wizardState.recipients.map(wizardRecipientFieldRowHtml).join('');
}

wizardStep3AnnouncementNextBtn.addEventListener('click', async () => {
  renderWizardAnnouncementSummary();
  await loadWizardProjectOptions(wizardProjectSelectAnnouncement);
  wizardProjectSelectAnnouncement.value = wizardState.projectId ? String(wizardState.projectId) : '';
  showWizardStep('4-announcement');
});

// -- Step 4b: announcement review --
const wizardAnnouncementSummary = document.getElementById('wizard-announcement-summary');
const wizardSendAnnouncementBtn = document.getElementById('wizard-send-announcement-btn');
const wizardFinishAnnouncementBtn = document.getElementById('wizard-finish-announcement-btn');
const wizardProjectSelectAnnouncement = document.getElementById('wizard-project-select-announcement');

wizardProjectSelectAnnouncement.addEventListener('change', () => {
  wizardState.projectId = wizardProjectSelectAnnouncement.value ? Number(wizardProjectSelectAnnouncement.value) : null;
});

function renderWizardAnnouncementSummary() {
  const selects = Array.from(wizardRecipientFields.querySelectorAll('.wizard-field-select'));
  const counts = { to: 0, cc: 0, bcc: 0 };
  selects.forEach((s) => counts[s.value]++);

  wizardAnnouncementSummary.innerHTML = `
    <p><strong>Subject:</strong> ${wizardSubject.value || '(none)'}</p>
    <pre>${wizardBody.value}</pre>
    <p class="hint">To: ${counts.to} · Cc: ${counts.cc} · Bcc: ${counts.bcc}</p>
  `;
}

wizardSendAnnouncementBtn.addEventListener('click', async () => {
  const selects = Array.from(wizardRecipientFields.querySelectorAll('.wizard-field-select'));
  const buckets = { to: [], cc: [], bcc: [] };
  const sendRecords = [];

  selects.forEach((select) => {
    const index = Number(select.dataset.index);
    const recipient = wizardState.recipients[index];
    if (!recipient.email) return;
    buckets[select.value].push(recipient.email);
    sendRecords.push({
      assignmentId: recipient.assignment_id,
      templateId: null,
      groupId: null,
      projectId: wizardState.projectId,
      recipientField: select.value,
    });
  });

  const query = encodeMailtoQuery({
    to: buckets.to.join(','),
    cc: buckets.cc.join(','),
    bcc: buckets.bcc.join(','),
    subject: wizardSubject.value,
    body: wizardBody.value,
  });

  await window.signal.openMailto(`mailto:?${query}`, sendRecords);
});

wizardFinishAnnouncementBtn.addEventListener('click', () => {
  resetWizard();
  showPage('dashboard-section');
  loadDashboard();
});

// ==================================================
// PROJECTS
// ==================================================
const newProjectNameInput = document.getElementById('new-project-name');
const newProjectDescriptionInput = document.getElementById('new-project-description');
const createProjectBtn = document.getElementById('create-project-btn');
const projectsListEl = document.getElementById('projects-list');

const projectBackBtn = document.getElementById('project-back-btn');
const projectDetailNameInput = document.getElementById('project-detail-name-input');
const projectDetailDescriptionInput = document.getElementById('project-detail-description-input');
const projectSaveNameBtn = document.getElementById('project-save-name-btn');
const projectToggleStatusBtn = document.getElementById('project-toggle-status-btn');
const projectDeleteBtn = document.getElementById('project-delete-btn');
const projectAddSearchInput = document.getElementById('project-add-search');
const projectAddResultsEl = document.getElementById('project-add-results');
const projectMembersListEl = document.getElementById('project-members-list');
const projectSendsListEl = document.getElementById('project-sends-list');

const projectPersonPanel = document.getElementById('project-person-panel');
const projectPersonTitle = document.getElementById('project-person-title');
const projectPersonStatusSelect = document.getElementById('project-person-status-select');
const projectRemovePersonBtn = document.getElementById('project-remove-person-btn');
const projectNewNoteTextarea = document.getElementById('project-new-note');
const projectAddNoteBtn = document.getElementById('project-add-note-btn');
const projectNotesListEl = document.getElementById('project-notes-list');
const projectPersonSendsEl = document.getElementById('project-person-sends');

let currentProjectId = null;
let currentProjectPersonTeacherId = null;

function statusChipHtml(status) {
  if (!status) return '<span class="chip chip-gray">No Status</span>';
  const slug = status.replace(/\s+/g, '-');
  return `<span class="chip status-chip-${slug}">${status}</span>`;
}

function projectRowHtml(p) {
  const statusBadge =
    p.status === 'archived'
      ? '<span class="chip chip-gray">Archived</span>'
      : '<span class="chip chip-green">Active</span>';
  return `
    <div class="project-row" data-project-id="${p.id}">
      <span>
        <strong>${p.name}</strong> ${statusBadge}
        <div class="project-row-meta">${p.description ?? ''}</div>
      </span>
      <span class="project-row-meta">${p.member_count} people · ${p.send_count} sends</span>
    </div>
  `;
}

async function loadProjectsList() {
  const projects = await window.signal.listProjects();
  projectsListEl.innerHTML = projects.map(projectRowHtml).join('') || '<p class="hint">No projects yet.</p>';

  projectsListEl.querySelectorAll('.project-row').forEach((row) => {
    row.addEventListener('click', () => openProjectDetail(Number(row.dataset.projectId)));
  });
}

createProjectBtn.addEventListener('click', async () => {
  const name = newProjectNameInput.value.trim();
  if (!name) return;

  const result = await window.signal.createProject(name, newProjectDescriptionInput.value.trim());
  newProjectNameInput.value = '';
  newProjectDescriptionInput.value = '';
  await loadProjectsList();
  openProjectDetail(result.projectId);
});

let projectReturnSection = 'projects-section';

async function openProjectDetail(projectId, fromSection) {
  currentProjectId = projectId;
  currentProjectPersonTeacherId = null;
  projectReturnSection = fromSection || 'projects-section';
  projectPersonPanel.classList.add('hidden');
  projectAddSearchInput.value = '';
  projectAddResultsEl.innerHTML = '';
  await renderProjectDetail();
  showPage('project-detail-section');
}

function projectMemberRowHtml(m) {
  return `
    <div class="project-member-row" data-teacher-id="${m.teacher_id}">
      <span>${m.first_name ?? ''} ${m.last_name ?? ''}</span>
      <span>${statusChipHtml(m.status)}</span>
      <span class="latest-note">${m.latest_note ? m.latest_note : `${m.send_count} send(s), no notes yet`}</span>
    </div>
  `;
}

function projectSendRowHtml(s) {
  const type = s.template_name || (s.group_id ? 'Group' : 'Direct');
  const date = s.generated_at ? new Date(s.generated_at).toLocaleString() : '';
  return `
    <tr>
      <td>${date}</td>
      <td>${s.first_name ?? ''} ${s.last_name ?? ''}</td>
      <td>${type}</td>
      <td>${s.recipient_field ?? ''}</td>
    </tr>
  `;
}

async function renderProjectDetail() {
  const { project, members, sends } = await window.signal.getProject(currentProjectId);

  projectDetailNameInput.value = project.name || '';
  projectDetailDescriptionInput.value = project.description || '';
  projectToggleStatusBtn.textContent = project.status === 'archived' ? 'Reactivate' : 'Archive';

  projectMembersListEl.innerHTML =
    members.map(projectMemberRowHtml).join('') || '<p class="hint">No one added to this project yet.</p>';

  projectMembersListEl.querySelectorAll('.project-member-row').forEach((row) => {
    row.addEventListener('click', () => openProjectPerson(Number(row.dataset.teacherId)));
  });

  projectSendsListEl.innerHTML = sends.length
    ? `
      <table>
        <thead><tr><th>Date</th><th>Recipient</th><th>Type</th><th>Field</th></tr></thead>
        <tbody>${sends.map(projectSendRowHtml).join('')}</tbody>
      </table>
    `
    : '<p class="hint">No sends recorded for this project yet.</p>';
}

function projectAddResultRowHtml(t) {
  return `
    <div class="search-result-row" data-teacher-id="${t.id}">
      <span>${t.first_name ?? ''} ${t.last_name ?? ''}</span>
      <button class="btn btn-ghost btn-sm project-add-person-btn" data-teacher-id="${t.id}">+ Add</button>
    </div>
  `;
}

async function runProjectAddSearch() {
  const query = projectAddSearchInput.value.trim();
  if (!query) {
    projectAddResultsEl.innerHTML = '';
    return;
  }
  const results = await window.signal.searchTeachers(query);
  projectAddResultsEl.innerHTML = results.map(projectAddResultRowHtml).join('') || '<p class="hint">No matches.</p>';

  async function addPerson(teacherId) {
    await window.signal.addProjectPerson(currentProjectId, teacherId);
    projectAddSearchInput.value = '';
    projectAddResultsEl.innerHTML = '';
    await renderProjectDetail();
  }

  projectAddResultsEl.querySelectorAll('.search-result-row').forEach((row) => {
    row.addEventListener('click', () => addPerson(Number(row.dataset.teacherId)));
  });

  projectAddResultsEl.querySelectorAll('.project-add-person-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addPerson(Number(btn.dataset.teacherId));
    });
  });
}

projectAddSearchInput.addEventListener('input', runProjectAddSearch);

function projectNoteItemHtml(note) {
  const date = note.created_at ? new Date(note.created_at).toLocaleString() : '';
  return `
    <div class="project-note-item">
      <div class="note-date">${date}</div>
      <div>${note.note_text}</div>
    </div>
  `;
}

async function openProjectPerson(teacherId) {
  currentProjectPersonTeacherId = teacherId;

  const { project, members } = await window.signal.getProject(currentProjectId);
  const member = members.find((m) => m.teacher_id === teacherId);
  projectPersonTitle.textContent = member ? `${member.first_name ?? ''} ${member.last_name ?? ''}` : 'Person';

  const detail = await window.signal.getProjectPersonDetail(currentProjectId, teacherId);
  projectPersonStatusSelect.value = detail.status || '';
  projectNewNoteTextarea.value = '';

  projectNotesListEl.innerHTML =
    detail.notes.map(projectNoteItemHtml).join('') || '<p class="hint">No notes yet.</p>';

  projectPersonSendsEl.innerHTML = detail.sends.length
    ? `
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Field</th></tr></thead>
        <tbody>${detail.sends
          .map(
            (s) => `
          <tr>
            <td>${s.generated_at ? new Date(s.generated_at).toLocaleString() : ''}</td>
            <td>${s.template_name || 'Direct'}</td>
            <td>${s.recipient_field ?? ''}</td>
          </tr>
        `
          )
          .join('')}</tbody>
      </table>
    `
    : '<p class="hint">No sends recorded for this person in this project yet.</p>';

  projectPersonPanel.classList.remove('hidden');
}

projectPersonStatusSelect.addEventListener('change', async () => {
  await window.signal.setProjectPersonStatus(
    currentProjectId,
    currentProjectPersonTeacherId,
    projectPersonStatusSelect.value
  );
  await renderProjectDetail();
});

projectAddNoteBtn.addEventListener('click', async () => {
  const text = projectNewNoteTextarea.value.trim();
  if (!text) return;

  await window.signal.addProjectNote(currentProjectId, currentProjectPersonTeacherId, text);
  await openProjectPerson(currentProjectPersonTeacherId);
  await renderProjectDetail();
});

projectRemovePersonBtn.addEventListener('click', async () => {
  const confirmed = window.confirm('Remove this person from the project? Their notes and status will be deleted.');
  if (!confirmed) return;

  await window.signal.removeProjectPerson(currentProjectId, currentProjectPersonTeacherId);
  projectPersonPanel.classList.add('hidden');
  currentProjectPersonTeacherId = null;
  await renderProjectDetail();
});

projectSaveNameBtn.addEventListener('click', async () => {
  const name = projectDetailNameInput.value.trim();
  if (!name) return;

  await window.signal.updateProject(currentProjectId, name, projectDetailDescriptionInput.value.trim());
  await renderProjectDetail();
});

projectToggleStatusBtn.addEventListener('click', async () => {
  const { project } = await window.signal.getProject(currentProjectId);
  const newStatus = project.status === 'archived' ? 'active' : 'archived';
  await window.signal.setProjectStatus(currentProjectId, newStatus);
  await renderProjectDetail();
});

projectDeleteBtn.addEventListener('click', async () => {
  const confirmed = window.confirm('Delete this project? Notes and status tags will be removed; past sends stay in history but unlinked from this project.');
  if (!confirmed) return;

  await window.signal.deleteProject(currentProjectId);
  showPage('projects-section');
  await loadProjectsList();
});

projectBackBtn.addEventListener('click', async () => {
  showPage(projectReturnSection);
  if (projectReturnSection === 'dashboard-section') {
    await loadDashboard();
  } else {
    await loadProjectsList();
  }
});

// ---------- INITIAL LOAD ----------
loadDashboard();
loadTeachers();
loadDuplicates();
