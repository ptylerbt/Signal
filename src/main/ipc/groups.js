const { ipcMain } = require('electron');
const { getDb, saveDb } = require('../db');

function queryAll(db, sql) {
  const results = [];
  const stmt = db.prepare(sql);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

// Assignment fields can hold merged "A; B; C" values (from same-email combining), so
// split those back into individual atomic values for filter dropdown options.
function distinctValues(db, column) {
  const rows = queryAll(
    db,
    `SELECT DISTINCT ${column} AS value FROM teacher_assignments
     WHERE ${column} IS NOT NULL AND trim(${column}) != ''`
  );

  const unique = new Set();
  for (const row of rows) {
    String(row.value)
      .split(';')
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach((v) => unique.add(v));
  }

  return [...unique].sort((a, b) => a.localeCompare(b));
}

// Matches a single value against a column that may hold a merged "A; B; C" list,
// so filtering by "Band" still finds a teacher whose subject field is "Band; Choir".
function containsToken(column, value) {
  const escaped = String(value).replace(/'/g, "''");
  return `(';' || replace(${column}, '; ', ';') || ';') LIKE '%;${escaped};%'`;
}

function mergeUniqueValues(values) {
  const unique = [];
  const seen = new Set();
  for (const v of values) {
    if (v === null || v === undefined || String(v).trim() === '') continue;
    const norm = String(v).trim().toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      unique.push(String(v).trim());
    }
  }
  return unique.length > 0 ? unique.join('; ') : null;
}

// Collapses one-row-per-assignment results down to one row per teacher, so a teacher
// with several assignments doesn't appear (and get emailed) more than once. Subject/school/
// level/district are merged across all of that teacher's matching assignments so a teacher
// who teaches multiple subjects still shows all of them, even if their profile hasn't been
// manually cleaned up yet.
function dedupeByTeacher(db, rows) {
  const byTeacher = new Map();
  for (const row of rows) {
    if (!byTeacher.has(row.teacher_id)) byTeacher.set(row.teacher_id, []);
    byTeacher.get(row.teacher_id).push(row);
  }

  const chosenByTeacher = new Map();
  const missingDefaultIds = new Set();

  for (const [teacherId, teacherRows] of byTeacher) {
    const defaultId = teacherRows[0].default_assignment_id;
    let chosen = defaultId ? teacherRows.find((r) => r.assignment_id === defaultId) : null;

    if (defaultId && !chosen) missingDefaultIds.add(defaultId);
    if (!chosen) chosen = teacherRows[0];

    chosenByTeacher.set(teacherId, { chosen, defaultId, teacherRows });
  }

  if (missingDefaultIds.size > 0) {
    const defaultRows = queryAll(
      db,
      `SELECT id AS assignment_id, school, level, subject, email, district
       FROM teacher_assignments WHERE id IN (${[...missingDefaultIds].join(',')})`
    );
    const byId = new Map(defaultRows.map((r) => [r.assignment_id, r]));

    for (const entry of chosenByTeacher.values()) {
      if (entry.defaultId && byId.has(entry.defaultId)) {
        entry.chosen = { ...entry.chosen, email: byId.get(entry.defaultId).email };
      }
    }
  }

  return [...chosenByTeacher.values()].map(({ chosen, teacherRows }) => ({
    assignment_id: chosen.assignment_id,
    school: mergeUniqueValues(teacherRows.map((r) => r.school)),
    level: mergeUniqueValues(teacherRows.map((r) => r.level)),
    subject: mergeUniqueValues(teacherRows.map((r) => r.subject)),
    email: chosen.email,
    district: mergeUniqueValues(teacherRows.map((r) => r.district)),
    teacher_id: chosen.teacher_id,
    first_name: chosen.first_name,
    last_name: chosen.last_name,
    is_district_rep: chosen.is_district_rep,
  }));
}

function registerGroupHandlers() {
  ipcMain.handle('groups:listFilterOptions', async () => {
    const db = await getDb();
    return {
      schools: distinctValues(db, 'school'),
      levels: distinctValues(db, 'level'),
      subjects: distinctValues(db, 'subject'),
      districts: distinctValues(db, 'district'),
    };
  });

  ipcMain.handle('groups:filterAssignments', async (_event, filters) => {
    const db = await getDb();
    const conditions = [];

    if (filters.school) conditions.push(containsToken('ta.school', filters.school));
    if (filters.level) conditions.push(containsToken('ta.level', filters.level));
    if (filters.subject) conditions.push(containsToken('ta.subject', filters.subject));
    if (filters.district) conditions.push(containsToken('ta.district', filters.district));
    if (filters.repsOnly) conditions.push('t.is_district_rep = 1');
    if (filters.groupId) {
      conditions.push(
        `ta.id IN (SELECT assignment_id FROM group_members WHERE group_id = ${Number(filters.groupId)})`
      );
    }
    if (filters.search) {
      const term = filters.search.replace(/'/g, "''").toLowerCase();
      conditions.push(
        `(lower(t.first_name) LIKE '%${term}%' OR lower(t.last_name) LIKE '%${term}%')`
      );
    }
    conditions.push("ta.email IS NOT NULL AND trim(ta.email) != ''");

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = queryAll(
      db,
      `SELECT ta.id AS assignment_id, ta.school, ta.level, ta.subject, ta.email, ta.district,
              t.id AS teacher_id, t.first_name, t.last_name, t.is_district_rep, t.default_assignment_id
       FROM teacher_assignments ta
       JOIN teachers t ON t.id = ta.teacher_id
       ${whereClause}
       ORDER BY t.last_name, t.first_name, ta.id`
    );

    return dedupeByTeacher(db, rows);
  });

  ipcMain.handle('groups:create', async (_event, { name, assignmentIds }) => {
    const db = await getDb();

    const insertGroup = db.prepare('INSERT INTO groups (name) VALUES (:name)');
    insertGroup.run({ ':name': name });
    insertGroup.free();

    const groupId = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];

    const insertMember = db.prepare(
      'INSERT INTO group_members (group_id, assignment_id) VALUES (:group_id, :assignment_id)'
    );
    for (const assignmentId of assignmentIds) {
      insertMember.run({ ':group_id': groupId, ':assignment_id': assignmentId });
    }
    insertMember.free();
    saveDb();

    return { success: true, groupId };
  });

  ipcMain.handle('groups:list', async () => {
    const db = await getDb();
    return queryAll(
      db,
      `SELECT g.id, g.name, g.created_at, COUNT(gm.assignment_id) AS member_count
       FROM groups g
       LEFT JOIN group_members gm ON gm.group_id = g.id
       GROUP BY g.id
       ORDER BY g.created_at DESC`
    );
  });

  ipcMain.handle('groups:getMembers', async (_event, { groupId }) => {
    const db = await getDb();
    return queryAll(
      db,
      `SELECT ta.id AS assignment_id, ta.school, ta.level, ta.subject, ta.email, ta.district,
              t.id AS teacher_id, t.first_name, t.last_name, t.is_district_rep
       FROM group_members gm
       JOIN teacher_assignments ta ON ta.id = gm.assignment_id
       JOIN teachers t ON t.id = ta.teacher_id
       WHERE gm.group_id = ${groupId}
       ORDER BY t.last_name, t.first_name`
    );
  });

  ipcMain.handle('groups:delete', async (_event, { groupId }) => {
    const db = await getDb();
    const delMembers = db.prepare('DELETE FROM group_members WHERE group_id = :groupId');
    delMembers.run({ ':groupId': groupId });
    delMembers.free();
    const delGroup = db.prepare('DELETE FROM groups WHERE id = :groupId');
    delGroup.run({ ':groupId': groupId });
    delGroup.free();
    saveDb();
    return { success: true };
  });
}

module.exports = { registerGroupHandlers };
