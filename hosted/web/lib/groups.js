// DB-touching group filter/dedupe logic, shared by API routes and tests.
import { mergeUniqueValues } from './roster.js';

const FILTERABLE_COLUMNS = ['school', 'level', 'subject', 'district'];

export async function distinctValues(client, ownerId, column) {
  if (!FILTERABLE_COLUMNS.includes(column)) throw new Error('Invalid column');

  const { rows } = await client.query(
    `select distinct ${column} as value from teacher_assignments
     where owner_id = $1 and ${column} is not null and trim(${column}) != ''`,
    [ownerId]
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

// Collapses one-row-per-assignment results down to one row per teacher, merging
// subject/school/level/district across all of that teacher's matching assignments
// so someone who teaches multiple subjects still shows all of them.
export function dedupeByTeacher(rows) {
  const byTeacher = new Map();
  for (const row of rows) {
    if (!byTeacher.has(row.teacher_id)) byTeacher.set(row.teacher_id, []);
    byTeacher.get(row.teacher_id).push(row);
  }

  const results = [];
  for (const [teacherId, teacherRows] of byTeacher) {
    const defaultId = teacherRows[0].default_assignment_id;
    const chosen = (defaultId && teacherRows.find((r) => r.assignment_id === defaultId)) || teacherRows[0];

    results.push({
      assignment_id: chosen.assignment_id,
      school: mergeUniqueValues(teacherRows.map((r) => r.school)),
      level: mergeUniqueValues(teacherRows.map((r) => r.level)),
      subject: mergeUniqueValues(teacherRows.map((r) => r.subject)),
      email: chosen.email,
      district: mergeUniqueValues(teacherRows.map((r) => r.district)),
      teacher_id: teacherId,
      first_name: chosen.first_name,
      last_name: chosen.last_name,
      is_district_rep: chosen.is_district_rep,
    });
  }
  return results;
}

// Matches a single value against a column that may hold a merged "A; B; C" list,
// so filtering by "Band" still finds a teacher whose subject field is "Band; Choir".
export async function filterAssignments(client, ownerId, filters) {
  const conditions = ['ta.owner_id = $1'];
  const params = [ownerId];

  function addTokenFilter(column, value) {
    if (!value || !FILTERABLE_COLUMNS.includes(column)) return;
    params.push(value);
    conditions.push(
      `(';' || replace(ta.${column}, '; ', ';') || ';') LIKE ('%;' || $${params.length} || ';%')`
    );
  }

  addTokenFilter('school', filters.school);
  addTokenFilter('level', filters.level);
  addTokenFilter('subject', filters.subject);
  addTokenFilter('district', filters.district);

  if (filters.repsOnly) conditions.push('t.is_district_rep = true');

  if (filters.groupId) {
    params.push(filters.groupId);
    conditions.push(
      `ta.id in (select assignment_id from group_members where owner_id = ta.owner_id and group_id = $${params.length})`
    );
  }

  if (filters.search) {
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    conditions.push(`(lower(t.first_name) like $${params.length} or lower(t.last_name) like $${params.length})`);
  }

  conditions.push("ta.email is not null and trim(ta.email) != ''");

  const { rows } = await client.query(
    `select ta.id as assignment_id, ta.school, ta.level, ta.subject, ta.email, ta.district,
            t.id as teacher_id, t.first_name, t.last_name, t.is_district_rep, t.default_assignment_id
     from teacher_assignments ta
     join teachers t on t.id = ta.teacher_id
     where ${conditions.join(' and ')}
     order by t.last_name, t.first_name, ta.id`,
    params
  );

  return dedupeByTeacher(rows);
}
