// "People" = the teachers + teacher_assignments tables, shown in plain
// language and scoped to workspaces. A person is stored once and linked to
// any number of workspaces (workspace_people). Each assignment row is one
// set of contact details: email, role/subject, school/organization, grade.
//
// Functions take a client already inside withActingClient() and the
// effective owner id.
import { findTeacherByNameAndEmail, dedupeAssignmentsForTeacher, combineAssignmentsByEmail } from './rosterImport.js';
import { snapshotTeachers } from './undo.js';

function clean(value) {
  const v = String(value ?? '').trim();
  return v === '' ? null : v;
}

export function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

// People added before workspaces existed (or by any older screen) belong to
// no workspace, which would make them invisible. Adopt them into the given
// one. Cheap no-op once everyone has a home.
export async function adoptPeopleWithoutWorkspace(client, ownerId, workspaceId) {
  await client.query(
    `insert into workspace_people (owner_id, workspace_id, teacher_id)
     select $1, $2, t.id from teachers t
      where t.owner_id = $1 and t.deleted_at is null
        and not exists (select 1 from workspace_people wp where wp.teacher_id = t.id)
     on conflict do nothing`,
    [ownerId, workspaceId]
  );
}

// People in one workspace, each with their contact details, sorted by name.
export async function listPeople(client, ownerId, workspaceId) {
  const { rows: people } = await client.query(
    `select t.id, t.first_name, t.last_name, t.created_at
       from teachers t
       join workspace_people wp on wp.teacher_id = t.id and wp.workspace_id = $2
      where t.owner_id = $1 and t.deleted_at is null
      order by lower(coalesce(t.last_name, '')), lower(coalesce(t.first_name, ''))`,
    [ownerId, workspaceId]
  );
  if (people.length === 0) return [];

  const ids = people.map((p) => p.id);
  const { rows: assignments } = await client.query(
    `select id, teacher_id, email, subject, school, level, district
       from teacher_assignments where owner_id = $1 and teacher_id = any($2) order by id`,
    [ownerId, ids]
  );
  const { rows: listCounts } = await client.query(
    `select m.teacher_id, count(*)::int as list_count
       from list_members m join lists l on l.id = m.list_id and l.deleted_at is null and l.workspace_id = $2
      where m.owner_id = $1 and m.teacher_id = any($3)
      group by m.teacher_id`,
    [ownerId, workspaceId, ids]
  );

  const byTeacher = new Map(ids.map((id) => [id, []]));
  for (const a of assignments) byTeacher.get(a.teacher_id).push(a);
  const countByTeacher = new Map(listCounts.map((r) => [r.teacher_id, r.list_count]));

  return people.map((p) => ({
    ...p,
    assignments: byTeacher.get(p.id),
    list_count: countByTeacher.get(p.id) || 0,
  }));
}

export async function linkPersonToWorkspace(client, ownerId, workspaceId, teacherId) {
  const { rowCount } = await client.query(
    `insert into workspace_people (owner_id, workspace_id, teacher_id)
     select $1, w.id, t.id
       from workspaces w, teachers t
      where w.id = $2 and w.owner_id = $1 and w.deleted_at is null
        and t.id = $3 and t.owner_id = $1
     on conflict do nothing`,
    [ownerId, workspaceId, teacherId]
  );
  await client.query('update teachers set deleted_at = null where owner_id = $1 and id = $2', [ownerId, teacherId]);
  return rowCount > 0;
}

// Adds a person by hand. If someone with the same name + email already
// exists (in any workspace, or in Trash), that person is reused and linked
// here instead of creating a duplicate.
export async function addPerson(client, ownerId, workspaceId, input) {
  const fields = {
    first_name: clean(input.firstName),
    last_name: clean(input.lastName),
    email: clean(input.email),
    subject: clean(input.role),
    school: clean(input.organization),
    level: clean(input.grade),
  };

  const existingId = await findTeacherByNameAndEmail(client, ownerId, fields);
  if (existingId) {
    const { rows: before } = await client.query(
      'select 1 from workspace_people where workspace_id = $1 and teacher_id = $2',
      [workspaceId, existingId]
    );
    // Keep any new details typed in (e.g. a second role) — the same cleanup
    // as import folds them into the existing same-email contact row.
    if (fields.subject || fields.school || fields.level) {
      await client.query(
        `insert into teacher_assignments (owner_id, teacher_id, email, subject, school, level)
         values ($1, $2, $3, $4, $5, $6)`,
        [ownerId, existingId, fields.email, fields.subject, fields.school, fields.level]
      );
      await dedupeAssignmentsForTeacher(client, ownerId, existingId);
      await combineAssignmentsByEmail(client, ownerId, existingId);
    }
    await linkPersonToWorkspace(client, ownerId, workspaceId, existingId);
    return { teacherId: existingId, reused: true, alreadyHere: before.length > 0 };
  }

  const { rows: [teacher] } = await client.query(
    'insert into teachers (owner_id, first_name, last_name) values ($1, $2, $3) returning id',
    [ownerId, fields.first_name, fields.last_name]
  );
  await client.query(
    `insert into teacher_assignments (owner_id, teacher_id, email, subject, school, level)
     values ($1, $2, $3, $4, $5, $6)`,
    [ownerId, teacher.id, fields.email, fields.subject, fields.school, fields.level]
  );
  await linkPersonToWorkspace(client, ownerId, workspaceId, teacher.id);
  return { teacherId: teacher.id, reused: false, alreadyHere: false };
}

// "Remove" from the current workspace. If they aren't in any other
// workspace, they also go to Trash. Returns an undo snapshot either way.
export async function removePersonFromWorkspace(client, ownerId, workspaceId, teacherId) {
  const snapshot = await snapshotTeachers(client, ownerId, [teacherId]);
  const person = snapshot.teachers[0];
  if (!person) return null;

  await client.query(
    `delete from list_members where owner_id = $1 and teacher_id = $2
       and list_id in (select id from lists where workspace_id = $3)`,
    [ownerId, teacherId, workspaceId]
  );
  await client.query('delete from workspace_people where owner_id = $1 and workspace_id = $2 and teacher_id = $3', [
    ownerId,
    workspaceId,
    teacherId,
  ]);

  const { rows: remaining } = await client.query(
    `select w.name from workspace_people wp join workspaces w on w.id = wp.workspace_id and w.deleted_at is null
      where wp.owner_id = $1 and wp.teacher_id = $2 order by w.name`,
    [ownerId, teacherId]
  );
  const trashed = remaining.length === 0;
  if (trashed) {
    await client.query('update teachers set deleted_at = now() where owner_id = $1 and id = $2', [ownerId, teacherId]);
  }

  const name = [person.first_name, person.last_name].filter(Boolean).join(' ') || 'this person';
  return {
    trashed,
    stillIn: remaining.map((r) => r.name),
    undo: {
      label: trashed ? `${name} moved to Trash` : `${name} removed from this workspace`,
      teacherIds: [teacherId],
      snapshot,
    },
  };
}

// Everything the profile page shows.
export async function getPerson(client, ownerId, teacherId) {
  const { rows: [teacher] } = await client.query(
    'select id, first_name, last_name, deleted_at, created_at from teachers where owner_id = $1 and id = $2',
    [ownerId, teacherId]
  );
  if (!teacher) return null;

  const [{ rows: assignments }, { rows: workspaces }, { rows: lists }, { rows: notes }, { rows: sends }] = await Promise.all([
    client.query(
      'select id, email, subject, school, level, district from teacher_assignments where owner_id = $1 and teacher_id = $2 order by id',
      [ownerId, teacherId]
    ),
    client.query(
      `select w.id, w.name, w.emoji, w.color,
              exists (select 1 from workspace_people wp where wp.workspace_id = w.id and wp.teacher_id = $2) as is_member
         from workspaces w
        where w.owner_id = $1 and w.deleted_at is null and w.is_practice = false
        order by w.sort_order, w.created_at`,
      [ownerId, teacherId]
    ),
    client.query(
      `select l.id, l.name, l.workspace_id, w.name as workspace_name, m.status
         from list_members m
         join lists l on l.id = m.list_id and l.deleted_at is null
         join workspaces w on w.id = l.workspace_id and w.deleted_at is null
        where m.owner_id = $1 and m.teacher_id = $2
        order by w.name, l.name`,
      [ownerId, teacherId]
    ),
    client.query(
      `select id, note_text, created_at, workspace_id from notes
        where owner_id = $1 and teacher_id = $2 and deleted_at is null
        order by created_at desc`,
      [ownerId, teacherId]
    ),
    client.query(
      `select s.id, s.generated_at, s.status, ta.email, l.name as list_name, tp.file_name as template_name
         from send_records s
         join teacher_assignments ta on ta.id = s.assignment_id and ta.owner_id = s.owner_id
         left join lists l on l.id = s.list_id and l.owner_id = s.owner_id
         left join templates tp on tp.id = s.template_id and tp.owner_id = s.owner_id
        where s.owner_id = $1 and ta.teacher_id = $2
        order by s.generated_at desc
        limit 50`,
      [ownerId, teacherId]
    ),
  ]);

  return { person: teacher, assignments, workspaces, lists, notes, sends };
}
