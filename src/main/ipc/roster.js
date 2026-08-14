const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { getDb, saveDb } = require('../db');

const ROSTER_TEMPLATE_PATH = path.join(__dirname, '../assets/roster-template.xlsx');

const COLUMN_ALIASES = {
  first_name: ['first name', 'first', 'firstname'],
  last_name: ['last name', 'last', 'lastname'],
  school: ['school', 'school/district', 'district'],
  level: ['level', 'grade level', 'school level'],
  subject: ['subject', 'subject area', 'instrument'],
  email: ['email', 'e-mail', 'email address'],
};

function normalizeHeader(header) {
  return String(header).trim().toLowerCase();
}

function normalizeName(name) {
  return String(name ?? '').trim().toLowerCase();
}

function mapRow(row) {
  const fields = {
    first_name: null,
    last_name: null,
    school: null,
    level: null,
    subject: null,
    email: null,
  };
  const extra = {};

  for (const [rawKey, value] of Object.entries(row)) {
    const normalized = normalizeHeader(rawKey);
    const matchedField = Object.entries(COLUMN_ALIASES).find(([, aliases]) =>
      aliases.includes(normalized)
    );

    if (matchedField) {
      fields[matchedField[0]] = value ?? null;
    } else {
      extra[rawKey] = value;
    }
  }

  fields.extra_json = JSON.stringify(extra);
  return fields;
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function findExistingAssignment(db, fields) {
  const stmt = db.prepare(`
    SELECT ta.id
    FROM teacher_assignments ta
    JOIN teachers t ON t.id = ta.teacher_id
    WHERE lower(trim(coalesce(t.first_name, ''))) = :first_name
      AND lower(trim(coalesce(t.last_name, ''))) = :last_name
      AND lower(trim(coalesce(ta.school, ''))) = :school
      AND lower(trim(coalesce(ta.subject, ''))) = :subject
      AND lower(trim(coalesce(ta.email, ''))) = :email
    LIMIT 1
  `);
  stmt.bind({
    ':first_name': normalizeName(fields.first_name),
    ':last_name': normalizeName(fields.last_name),
    ':school': normalizeName(fields.school),
    ':subject': normalizeName(fields.subject),
    ':email': normalizeName(fields.email),
  });
  const found = stmt.step();
  stmt.free();
  return found;
}

// Same name + same email is treated as certainly the same person, so imports
// attach the new assignment to that existing teacher instead of creating a duplicate profile.
function findTeacherByNameAndEmail(db, fields) {
  const normEmail = normalizeName(fields.email);
  if (!normEmail) return null;

  const stmt = db.prepare(`
    SELECT t.id
    FROM teachers t
    JOIN teacher_assignments ta ON ta.teacher_id = t.id
    WHERE lower(trim(coalesce(t.first_name, ''))) = :first_name
      AND lower(trim(coalesce(t.last_name, ''))) = :last_name
      AND lower(trim(coalesce(ta.email, ''))) = :email
    LIMIT 1
  `);
  stmt.bind({
    ':first_name': normalizeName(fields.first_name),
    ':last_name': normalizeName(fields.last_name),
    ':email': normEmail,
  });
  const found = stmt.step();
  const teacherId = found ? stmt.getAsObject().id : null;
  stmt.free();
  return teacherId;
}

function registerRosterHandlers() {
  ipcMain.handle('roster:previewImport', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Roster File',
      properties: ['openFile'],
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });

    if (canceled || filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = filePaths[0];
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const db = await getDb();

    const rows = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: null });

      for (const row of sheetRows) {
        const fields = mapRow(row);
        if (isBlank(fields.first_name) && isBlank(fields.last_name)) continue;

        rows.push({
          ...fields,
          district: sheetName,
          source_sheet: sheetName,
          isDuplicate: findExistingAssignment(db, fields),
        });
      }
    }

    const newCount = rows.filter((r) => !r.isDuplicate).length;
    const duplicateCount = rows.length - newCount;

    return {
      canceled: false,
      rows,
      newCount,
      duplicateCount,
      sheetCount: workbook.SheetNames.length,
    };
  });

  ipcMain.handle('roster:confirmImport', async (_event, { rows }) => {
    const db = await getDb();

    const insertTeacher = db.prepare(`
      INSERT INTO teachers (first_name, last_name) VALUES (:first_name, :last_name)
    `);
    const insertAssignment = db.prepare(`
      INSERT INTO teacher_assignments
        (teacher_id, school, district, subject, level, email, source_sheet, extra_json)
      VALUES
        (:teacher_id, :school, :district, :subject, :level, :email, :source_sheet, :extra_json)
    `);

    const touchedTeacherIds = new Set();

    for (const fields of rows) {
      let teacherId = findTeacherByNameAndEmail(db, fields);

      if (!teacherId) {
        insertTeacher.run({
          ':first_name': fields.first_name,
          ':last_name': fields.last_name,
        });
        teacherId = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
      }

      insertAssignment.run({
        ':teacher_id': teacherId,
        ':school': fields.school,
        ':district': fields.district,
        ':subject': fields.subject,
        ':level': fields.level,
        ':email': fields.email,
        ':source_sheet': fields.source_sheet,
        ':extra_json': fields.extra_json,
      });

      touchedTeacherIds.add(teacherId);
    }

    insertTeacher.free();
    insertAssignment.free();

    // Auto-clean up right after import: collapse exact-duplicate rows and merge
    // same-email assignments (e.g. one teacher, two subjects) for anyone this import touched.
    for (const teacherId of touchedTeacherIds) {
      dedupeAssignmentsForTeacher(db, teacherId);
      combineAssignmentsByEmail(db, teacherId);
    }

    saveDb();

    return { success: true, count: rows.length };
  });

  ipcMain.handle('roster:listTeachers', async () => {
    const db = await getDb();
    const teachers = queryAll(
      db,
      'SELECT * FROM teachers ORDER BY last_name, first_name'
    );
    const assignments = queryAll(
      db,
      'SELECT * FROM teacher_assignments ORDER BY id'
    );

    const assignmentsByTeacher = new Map();
    for (const a of assignments) {
      if (!assignmentsByTeacher.has(a.teacher_id)) {
        assignmentsByTeacher.set(a.teacher_id, []);
      }
      assignmentsByTeacher.get(a.teacher_id).push(a);
    }

    return teachers.map((t) => ({
      ...t,
      assignments: assignmentsByTeacher.get(t.id) || [],
    }));
  });

  ipcMain.handle('roster:listDuplicates', async () => {
    const db = await getDb();

    const nameGroups = queryAll(
      db,
      `SELECT lower(trim(first_name)) AS norm_first, lower(trim(last_name)) AS norm_last,
              first_name, last_name, GROUP_CONCAT(id) AS teacher_ids
       FROM teachers
       WHERE first_name IS NOT NULL AND last_name IS NOT NULL
         AND trim(first_name) != '' AND trim(last_name) != ''
       GROUP BY norm_first, norm_last
       HAVING COUNT(*) > 1`
    ).map((g) => ({
      reason: 'Same name',
      label: `${g.first_name} ${g.last_name}`,
      teacherIds: g.teacher_ids.split(',').map(Number),
    }));

    const emailGroupsRaw = queryAll(
      db,
      `SELECT lower(trim(email)) AS norm_email, GROUP_CONCAT(DISTINCT teacher_id) AS teacher_ids
       FROM teacher_assignments
       WHERE email IS NOT NULL AND trim(email) != ''
       GROUP BY norm_email
       HAVING COUNT(DISTINCT teacher_id) > 1`
    );

    const emailGroups = emailGroupsRaw
      .map((g) => {
        const teacherIds = g.teacher_ids.split(',').map(Number);
        const teachers = queryAll(
          db,
          `SELECT id, first_name, last_name FROM teachers WHERE id IN (${teacherIds.join(',')})`
        );
        const names = teachers
          .map((t) => `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim())
          .join(', ');
        return {
          reason: 'Same email',
          label: `${names} — ${g.norm_email}`,
          teacherIds,
        };
      })
      .filter((emailGroup) => {
        const key = [...emailGroup.teacherIds].sort().join(',');
        return !nameGroups.some((ng) => [...ng.teacherIds].sort().join(',') === key);
      });

    return [...nameGroups, ...emailGroups];
  });

  ipcMain.handle('roster:mergeTeachers', async (_event, { keepId, mergeIds }) => {
    const db = await getDb();
    const reassign = db.prepare(
      'UPDATE teacher_assignments SET teacher_id = :keepId WHERE teacher_id = :mergeId'
    );
    const deleteTeacher = db.prepare('DELETE FROM teachers WHERE id = :mergeId');

    for (const mergeId of mergeIds) {
      reassign.run({ ':keepId': keepId, ':mergeId': mergeId });
      deleteTeacher.run({ ':mergeId': mergeId });
    }
    reassign.free();
    deleteTeacher.free();
    saveDb();

    return { success: true };
  });

  ipcMain.handle('roster:setDistrictRep', async (_event, { teacherId, isRep }) => {
    const db = await getDb();
    const stmt = db.prepare(
      'UPDATE teachers SET is_district_rep = :isRep WHERE id = :teacherId'
    );
    stmt.run({ ':isRep': isRep ? 1 : 0, ':teacherId': teacherId });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('roster:setDefaultAssignment', async (_event, { teacherId, assignmentId }) => {
    const db = await getDb();
    const stmt = db.prepare(
      'UPDATE teachers SET default_assignment_id = :assignmentId WHERE id = :teacherId'
    );
    stmt.run({ ':assignmentId': assignmentId, ':teacherId': teacherId });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('roster:dedupeTeacherAssignments', async (_event, { teacherId }) => {
    const db = await getDb();
    const removed = dedupeAssignmentsForTeacher(db, teacherId);
    if (removed > 0) saveDb();
    return { removed };
  });

  ipcMain.handle('roster:dedupeAllAssignments', async () => {
    const db = await getDb();
    const teachers = queryAll(db, 'SELECT id FROM teachers');
    let totalRemoved = 0;
    for (const t of teachers) {
      totalRemoved += dedupeAssignmentsForTeacher(db, t.id);
      totalRemoved += combineAssignmentsByEmail(db, t.id);
    }
    if (totalRemoved > 0) saveDb();
    return { removed: totalRemoved };
  });

  ipcMain.handle('roster:combineByEmail', async (_event, { teacherId }) => {
    const db = await getDb();
    const removed = combineAssignmentsByEmail(db, teacherId);
    if (removed > 0) saveDb();
    return { removed };
  });

  ipcMain.handle('roster:searchTeachers', async (_event, { query }) => {
    const db = await getDb();
    const term = String(query ?? '').trim().toLowerCase().replace(/'/g, "''");
    if (!term) return [];

    return queryAll(
      db,
      `SELECT DISTINCT t.id, t.first_name, t.last_name, t.is_district_rep
       FROM teachers t
       LEFT JOIN teacher_assignments ta ON ta.teacher_id = t.id
       WHERE lower(t.first_name) LIKE '%${term}%'
          OR lower(t.last_name) LIKE '%${term}%'
          OR lower(coalesce(ta.school, '')) LIKE '%${term}%'
       ORDER BY t.last_name, t.first_name
       LIMIT 25`
    );
  });

  ipcMain.handle('roster:getTeacher', async (_event, { teacherId }) => {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM teachers WHERE id = :id');
    stmt.bind({ ':id': teacherId });
    stmt.step();
    const teacher = stmt.getAsObject();
    stmt.free();

    const assignments = getAssignmentsForTeacher(db, teacherId);
    return { ...teacher, assignments };
  });

  ipcMain.handle('roster:updateTeacherName', async (_event, { teacherId, firstName, lastName }) => {
    const db = await getDb();
    const stmt = db.prepare(
      'UPDATE teachers SET first_name = :firstName, last_name = :lastName WHERE id = :teacherId'
    );
    stmt.run({ ':firstName': firstName, ':lastName': lastName, ':teacherId': teacherId });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('roster:updateAssignment', async (_event, { assignmentId, fields }) => {
    const db = await getDb();
    const stmt = db.prepare(`
      UPDATE teacher_assignments
      SET school = :school, level = :level, subject = :subject, email = :email, district = :district
      WHERE id = :id
    `);
    stmt.run({
      ':school': fields.school || null,
      ':level': fields.level || null,
      ':subject': fields.subject || null,
      ':email': fields.email || null,
      ':district': fields.district || null,
      ':id': assignmentId,
    });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('roster:addAssignment', async (_event, { teacherId, fields }) => {
    const db = await getDb();
    const stmt = db.prepare(`
      INSERT INTO teacher_assignments (teacher_id, school, level, subject, email, district)
      VALUES (:teacher_id, :school, :level, :subject, :email, :district)
    `);
    stmt.run({
      ':teacher_id': teacherId,
      ':school': fields.school || null,
      ':level': fields.level || null,
      ':subject': fields.subject || null,
      ':email': fields.email || null,
      ':district': fields.district || null,
    });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('roster:deleteAssignment', async (_event, { assignmentId }) => {
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM teacher_assignments WHERE id = :id');
    stmt.run({ ':id': assignmentId });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('roster:getStats', async () => {
    const db = await getDb();
    const teacherCount = queryAll(db, 'SELECT COUNT(*) AS c FROM teachers')[0].c;
    const schoolCount = queryAll(
      db,
      "SELECT COUNT(DISTINCT school) AS c FROM teacher_assignments WHERE school IS NOT NULL AND trim(school) != ''"
    )[0].c;
    const repCount = queryAll(db, 'SELECT COUNT(*) AS c FROM teachers WHERE is_district_rep = 1')[0].c;
    const groupCount = queryAll(db, 'SELECT COUNT(*) AS c FROM groups')[0].c;
    return { teacherCount, schoolCount, repCount, groupCount };
  });

  ipcMain.handle('roster:downloadTemplate', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Roster Import Template',
      defaultPath: 'Signal Roster Template.xlsx',
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });

    if (canceled || !filePath) return { canceled: true };

    fs.copyFileSync(ROSTER_TEMPLATE_PATH, filePath);
    return { canceled: false, filePath };
  });
}

function getAssignmentsForTeacher(db, teacherId) {
  const stmt = db.prepare(
    'SELECT * FROM teacher_assignments WHERE teacher_id = :teacherId ORDER BY id'
  );
  stmt.bind({ ':teacherId': teacherId });
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function assignmentKey(a) {
  return [a.school, a.level, a.subject, a.email]
    .map((v) => normalizeName(v))
    .join('|');
}

function dedupeAssignmentsForTeacher(db, teacherId) {
  const assignments = getAssignmentsForTeacher(db, teacherId);
  const seen = new Set();
  const toDelete = [];

  for (const a of assignments) {
    const key = assignmentKey(a);
    if (seen.has(key)) {
      toDelete.push(a.id);
    } else {
      seen.add(key);
    }
  }

  if (toDelete.length > 0) {
    const stmt = db.prepare(
      `DELETE FROM teacher_assignments WHERE id IN (${toDelete.join(',')})`
    );
    stmt.run();
    stmt.free();
  }

  return toDelete.length;
}

function mergeFieldValues(values) {
  const unique = [];
  const seen = new Set();
  for (const v of values) {
    if (isBlank(v)) continue;
    const norm = normalizeName(v);
    if (!seen.has(norm)) {
      seen.add(norm);
      unique.push(String(v).trim());
    }
  }
  return unique.length > 0 ? unique.join('; ') : null;
}

function combineAssignmentsByEmail(db, teacherId) {
  const assignments = getAssignmentsForTeacher(db, teacherId);
  const groups = new Map();

  for (const a of assignments) {
    const email = normalizeName(a.email);
    if (!email) continue;
    if (!groups.has(email)) groups.set(email, []);
    groups.get(email).push(a);
  }

  let removed = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const keep = group[0];
    const rest = group.slice(1);

    const updateStmt = db.prepare(`
      UPDATE teacher_assignments
      SET school = :school, level = :level, subject = :subject, district = :district
      WHERE id = :id
    `);
    updateStmt.run({
      ':school': mergeFieldValues(group.map((g) => g.school)),
      ':level': mergeFieldValues(group.map((g) => g.level)),
      ':subject': mergeFieldValues(group.map((g) => g.subject)),
      ':district': mergeFieldValues(group.map((g) => g.district)),
      ':id': keep.id,
    });
    updateStmt.free();

    const deleteIds = rest.map((r) => r.id);
    const delStmt = db.prepare(
      `DELETE FROM teacher_assignments WHERE id IN (${deleteIds.join(',')})`
    );
    delStmt.run();
    delStmt.free();

    removed += deleteIds.length;
  }

  return removed;
}

function queryAll(db, sql) {
  const results = [];
  const stmt = db.prepare(sql);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

module.exports = { registerRosterHandlers };
