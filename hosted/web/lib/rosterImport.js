// DB-touching roster import/cleanup logic, shared by the API route and tests.
import { normalizeName, assignmentKey, mergeUniqueValues } from './roster.js';
import { snapshotTeachers } from './undo.js';

// With a workspaceId, a row only counts as "already imported" if that
// person is already IN that workspace — someone known from another
// workspace is still offered, so importing links them here too.
export async function findExistingAssignment(client, ownerId, fields, workspaceId = null) {
  const { rows } = await client.query(
    `select ta.id
     from teacher_assignments ta
     join teachers t on t.id = ta.teacher_id
     where ta.owner_id = $1
       and ($7::bigint is null or exists (
         select 1 from workspace_people wp where wp.workspace_id = $7 and wp.teacher_id = t.id
       ))
       and t.deleted_at is null
       and lower(trim(coalesce(t.first_name, ''))) = $2
       and lower(trim(coalesce(t.last_name, ''))) = $3
       and lower(trim(coalesce(ta.school, ''))) = $4
       and lower(trim(coalesce(ta.subject, ''))) = $5
       and lower(trim(coalesce(ta.email, ''))) = $6
     limit 1`,
    [
      ownerId,
      normalizeName(fields.first_name),
      normalizeName(fields.last_name),
      normalizeName(fields.school),
      normalizeName(fields.subject),
      normalizeName(fields.email),
      workspaceId,
    ]
  );
  return rows.length > 0;
}

export async function findTeacherByNameAndEmail(client, ownerId, fields) {
  const normEmail = normalizeName(fields.email);
  if (!normEmail) return null;

  const { rows } = await client.query(
    `select t.id
     from teachers t
     join teacher_assignments ta on ta.teacher_id = t.id
     where t.owner_id = $1
       and lower(trim(coalesce(t.first_name, ''))) = $2
       and lower(trim(coalesce(t.last_name, ''))) = $3
       and lower(trim(coalesce(ta.email, ''))) = $4
     limit 1`,
    [ownerId, normalizeName(fields.first_name), normalizeName(fields.last_name), normEmail]
  );
  return rows.length > 0 ? rows[0].id : null;
}

export async function getAssignmentsForTeacher(client, ownerId, teacherId) {
  const { rows } = await client.query(
    'select * from teacher_assignments where owner_id = $1 and teacher_id = $2 order by id',
    [ownerId, teacherId]
  );
  return rows;
}

export async function dedupeAssignmentsForTeacher(client, ownerId, teacherId) {
  const assignments = await getAssignmentsForTeacher(client, ownerId, teacherId);
  const seen = new Set();
  const toDelete = [];

  for (const a of assignments) {
    const key = assignmentKey(a);
    if (seen.has(key)) toDelete.push(a.id);
    else seen.add(key);
  }

  if (toDelete.length > 0) {
    await client.query('delete from teacher_assignments where owner_id = $1 and id = any($2)', [
      ownerId,
      toDelete,
    ]);
  }
  return toDelete.length;
}

export async function combineAssignmentsByEmail(client, ownerId, teacherId) {
  const assignments = await getAssignmentsForTeacher(client, ownerId, teacherId);
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

    await client.query(
      `update teacher_assignments
       set school = $1, level = $2, subject = $3, district = $4
       where owner_id = $5 and id = $6`,
      [
        mergeUniqueValues(group.map((g) => g.school)),
        mergeUniqueValues(group.map((g) => g.level)),
        mergeUniqueValues(group.map((g) => g.subject)),
        mergeUniqueValues(group.map((g) => g.district)),
        ownerId,
        keep.id,
      ]
    );

    const deleteIds = rest.map((r) => r.id);
    await client.query('delete from teacher_assignments where owner_id = $1 and id = any($2)', [
      ownerId,
      deleteIds,
    ]);
    removed += deleteIds.length;
  }

  return removed;
}

// "Auto Combine All": runs the same per-teacher cleanup (dedupe + same-email
// combine) across EVERY teacher on the roster in one pass, rather than
// waiting for an import to touch them or doing it one profile at a time.
export async function dedupeAllAssignments(client, ownerId) {
  const { rows: teachers } = await client.query('select id from teachers where owner_id = $1', [ownerId]);
  const teacherIds = teachers.map((t) => t.id);

  const snapshot = await snapshotTeachers(client, ownerId, teacherIds);

  let removed = 0;
  for (const id of teacherIds) {
    removed += await dedupeAssignmentsForTeacher(client, ownerId, id);
    removed += await combineAssignmentsByEmail(client, ownerId, id);
  }

  return { removed, undo: { label: 'Auto Combine All', teacherIds, snapshot } };
}

// Inserts every row (creating or reusing a teacher per name+email), then
// auto-cleans up (dedupe + same-email combine) every teacher touched.
// Also returns an `undo` snapshot of any PRE-EXISTING teacher this import
// touched (brand-new teachers just get deleted outright on undo, so they
// need no prior-state snapshot).
export async function importRows(client, ownerId, rows, { workspaceId = null } = {}) {
  const resolved = [];
  const preExistingTeacherIds = new Set();

  for (const fields of rows) {
    const existingId = await findTeacherByNameAndEmail(client, ownerId, fields);
    if (existingId) preExistingTeacherIds.add(existingId);
    resolved.push({ fields, existingId });
  }

  const snapshot = await snapshotTeachers(client, ownerId, [...preExistingTeacherIds]);

  const touchedTeacherIds = new Set();
  const newTeacherIds = [];

  for (const { fields, existingId } of resolved) {
    let teacherId = existingId;

    if (!teacherId) {
      const { rows: inserted } = await client.query(
        'insert into teachers (owner_id, first_name, last_name) values ($1, $2, $3) returning id',
        [ownerId, fields.first_name || null, fields.last_name || null]
      );
      teacherId = inserted[0].id;
      newTeacherIds.push(teacherId);
    }

    await client.query(
      `insert into teacher_assignments
         (owner_id, teacher_id, school, district, subject, level, email, source_sheet, extra_json)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ownerId,
        teacherId,
        fields.school || null,
        fields.district || null,
        fields.subject || null,
        fields.level || null,
        fields.email || null,
        fields.source_sheet || null,
        JSON.stringify(fields.extra_json || {}),
      ]
    );

    touchedTeacherIds.add(teacherId);
  }

  for (const teacherId of touchedTeacherIds) {
    await dedupeAssignmentsForTeacher(client, ownerId, teacherId);
    await combineAssignmentsByEmail(client, ownerId, teacherId);
  }

  // Everyone imported belongs to the workspace they were imported into, and
  // a re-imported person who'd been sent to Trash comes back.
  if (workspaceId && touchedTeacherIds.size > 0) {
    await client.query(
      `insert into workspace_people (owner_id, workspace_id, teacher_id)
       select $1, $2, unnest($3::bigint[])
       on conflict do nothing`,
      [ownerId, workspaceId, [...touchedTeacherIds]]
    );
    await client.query('update teachers set deleted_at = null where owner_id = $1 and id = any($2)', [
      ownerId,
      [...touchedTeacherIds],
    ]);
  }

  // The snapshot only captured PRE-EXISTING teachers (new ones didn't exist
  // yet to snapshot) — but restore needs the full touched-id list so it
  // knows to wipe the brand-new ones out entirely too (no prior row for
  // them means "delete on undo", which is exactly correct).
  const allTouchedIds = [...preExistingTeacherIds, ...newTeacherIds];
  snapshot.teacherIds = allTouchedIds;

  return {
    count: rows.length,
    undo: {
      label: `Imported ${rows.length} row(s)`,
      teacherIds: allTouchedIds,
      snapshot,
    },
  };
}
