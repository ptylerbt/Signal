export const BACKUP_VERSION = 1;

const TABLES = [
  'teachers',
  'teacher_assignments',
  'groups',
  'group_members',
  'templates',
  'label_maps',
  'projects',
  'project_members',
  'notes',
  'project_person_status',
  'send_records',
];

export async function buildExport(client, ownerId) {
  const data = { version: BACKUP_VERSION, exportedAt: new Date().toISOString() };

  for (const table of TABLES) {
    const { rows } = await client.query(`select * from ${table} where owner_id = $1`, [ownerId]);
    data[table] = rows;
  }

  return data;
}

function validateBackupShape(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.version !== 'number') return false;
  return TABLES.every((t) => Array.isArray(data[t]));
}

// Additive merge-import: every row from the backup is inserted as new rows
// owned by `ownerId`, with all ids remapped so nothing collides with (or
// overwrites) whatever the account already has. Never deletes anything.
export async function importBackup(client, ownerId, data) {
  if (!validateBackupShape(data)) {
    throw new Error('This file is not a recognized Signal backup.');
  }

  const teacherIdMap = new Map();
  const assignmentIdMap = new Map();
  const groupIdMap = new Map();
  const templateIdMap = new Map();
  const projectIdMap = new Map();

  const counts = {};

  for (const teacher of data.teachers) {
    const { rows } = await client.query(
      'insert into teachers (owner_id, first_name, last_name, is_district_rep) values ($1, $2, $3, $4) returning id',
      [ownerId, teacher.first_name, teacher.last_name, !!teacher.is_district_rep]
    );
    teacherIdMap.set(teacher.id, rows[0].id);
  }
  counts.teachers = data.teachers.length;

  for (const assignment of data.teacher_assignments) {
    const newTeacherId = teacherIdMap.get(assignment.teacher_id);
    if (!newTeacherId) continue;
    const { rows } = await client.query(
      `insert into teacher_assignments
         (owner_id, teacher_id, school, district, subject, level, email, source_sheet, extra_json)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [
        ownerId,
        newTeacherId,
        assignment.school,
        assignment.district,
        assignment.subject,
        assignment.level,
        assignment.email,
        assignment.source_sheet,
        assignment.extra_json ? JSON.stringify(assignment.extra_json) : null,
      ]
    );
    assignmentIdMap.set(assignment.id, rows[0].id);
  }
  counts.teacher_assignments = data.teacher_assignments.length;

  for (const teacher of data.teachers) {
    if (!teacher.default_assignment_id) continue;
    const newTeacherId = teacherIdMap.get(teacher.id);
    const newAssignmentId = assignmentIdMap.get(teacher.default_assignment_id);
    if (!newTeacherId || !newAssignmentId) continue;
    await client.query('update teachers set default_assignment_id = $1 where owner_id = $2 and id = $3', [
      newAssignmentId,
      ownerId,
      newTeacherId,
    ]);
  }

  for (const group of data.groups) {
    const { rows } = await client.query('insert into groups (owner_id, name) values ($1, $2) returning id', [ownerId, group.name]);
    groupIdMap.set(group.id, rows[0].id);
  }
  counts.groups = data.groups.length;

  for (const member of data.group_members) {
    const newGroupId = groupIdMap.get(member.group_id);
    const newAssignmentId = assignmentIdMap.get(member.assignment_id);
    if (!newGroupId || !newAssignmentId) continue;
    await client.query(
      'insert into group_members (owner_id, group_id, assignment_id) values ($1, $2, $3) on conflict do nothing',
      [ownerId, newGroupId, newAssignmentId]
    );
  }
  counts.group_members = data.group_members.length;

  for (const template of data.templates) {
    const { rows } = await client.query(
      'insert into templates (owner_id, file_name, raw_text, detected_labels_json) values ($1, $2, $3, $4) returning id',
      [ownerId, template.file_name, template.raw_text, template.detected_labels_json ? JSON.stringify(template.detected_labels_json) : null]
    );
    templateIdMap.set(template.id, rows[0].id);
  }
  counts.templates = data.templates.length;

  for (const labelMap of data.label_maps) {
    const newTemplateId = templateIdMap.get(labelMap.template_id);
    if (!newTemplateId) continue;
    await client.query(
      'insert into label_maps (owner_id, template_id, label_name, matched_column, manual_override) values ($1, $2, $3, $4, $5)',
      [ownerId, newTemplateId, labelMap.label_name, labelMap.matched_column, !!labelMap.manual_override]
    );
  }
  counts.label_maps = data.label_maps.length;

  for (const project of data.projects) {
    const { rows } = await client.query(
      'insert into projects (owner_id, name, description, status) values ($1, $2, $3, $4) returning id',
      [ownerId, project.name, project.description, project.status || 'active']
    );
    projectIdMap.set(project.id, rows[0].id);
  }
  counts.projects = data.projects.length;

  for (const member of data.project_members) {
    const newProjectId = projectIdMap.get(member.project_id);
    const newTeacherId = teacherIdMap.get(member.teacher_id);
    if (!newProjectId || !newTeacherId) continue;
    await client.query(
      'insert into project_members (owner_id, project_id, teacher_id) values ($1, $2, $3) on conflict do nothing',
      [ownerId, newProjectId, newTeacherId]
    );
  }
  counts.project_members = data.project_members.length;

  for (const note of data.notes) {
    // Notes can stand alone, so a missing link is only skipped if the
    // original note actually had one that we failed to remap.
    if (note.project_id && !projectIdMap.has(note.project_id)) continue;
    if (note.teacher_id && !teacherIdMap.has(note.teacher_id)) continue;
    await client.query('insert into notes (owner_id, project_id, teacher_id, note_text, created_at) values ($1, $2, $3, $4, $5)', [
      ownerId,
      note.project_id ? projectIdMap.get(note.project_id) : null,
      note.teacher_id ? teacherIdMap.get(note.teacher_id) : null,
      note.note_text,
      note.created_at || new Date().toISOString(),
    ]);
  }
  counts.notes = data.notes.length;

  for (const status of data.project_person_status) {
    const newProjectId = projectIdMap.get(status.project_id);
    const newTeacherId = teacherIdMap.get(status.teacher_id);
    if (!newProjectId || !newTeacherId) continue;
    await client.query(
      `insert into project_person_status (owner_id, project_id, teacher_id, status, updated_at)
       values ($1, $2, $3, $4, $5) on conflict (project_id, teacher_id) do update set status = $4, updated_at = $5`,
      [ownerId, newProjectId, newTeacherId, status.status, status.updated_at || new Date().toISOString()]
    );
  }
  counts.project_person_status = data.project_person_status.length;

  for (const send of data.send_records) {
    await client.query(
      `insert into send_records
         (owner_id, assignment_id, template_id, group_id, project_id, recipient_field, generated_at, opened_at, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ownerId,
        assignmentIdMap.get(send.assignment_id) || null,
        templateIdMap.get(send.template_id) || null,
        groupIdMap.get(send.group_id) || null,
        projectIdMap.get(send.project_id) || null,
        send.recipient_field,
        send.generated_at,
        send.opened_at,
        send.status,
      ]
    );
  }
  counts.send_records = data.send_records.length;

  return counts;
}
