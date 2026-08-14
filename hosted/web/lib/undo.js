// Scoped undo for the risky roster actions (import, merge duplicate
// profiles, Auto Combine All, delete teacher): snapshot exactly the rows
// touched by an action before it runs, hand that snapshot back to the
// caller (who hands it to the browser), and restore it on request.
//
// Deliberately NOT a generic undo/redo system — plain field edits (renaming
// a teacher, editing a note) rely on the browser's own native undo instead.
//
// The snapshot travels through the client between "action ran" and "user
// clicked Undo" rather than living in a server-side table, so there's
// nothing to expire/clean up — if the user navigates away, the option to
// undo just disappears, which is fine for a short-lived toast.

export async function snapshotTeachers(client, ownerId, teacherIds) {
  if (!teacherIds || teacherIds.length === 0) {
    return { teacherIds: [], teachers: [], teacher_assignments: [], group_members: [], project_members: [], project_person_status: [], notes: [], send_records: [] };
  }

  const { rows: teachers } = await client.query('select * from teachers where owner_id = $1 and id = any($2)', [ownerId, teacherIds]);
  const { rows: assignments } = await client.query('select * from teacher_assignments where owner_id = $1 and teacher_id = any($2)', [ownerId, teacherIds]);
  const assignmentIds = assignments.map((a) => a.id);

  const { rows: groupMembers } = assignmentIds.length
    ? await client.query('select * from group_members where owner_id = $1 and assignment_id = any($2)', [ownerId, assignmentIds])
    : { rows: [] };
  const { rows: projectMembers } = await client.query('select * from project_members where owner_id = $1 and teacher_id = any($2)', [ownerId, teacherIds]);
  const { rows: projectStatus } = await client.query('select * from project_person_status where owner_id = $1 and teacher_id = any($2)', [ownerId, teacherIds]);
  const { rows: notes } = await client.query('select * from notes where owner_id = $1 and teacher_id = any($2)', [ownerId, teacherIds]);
  const { rows: sendRecords } = assignmentIds.length
    ? await client.query('select * from send_records where owner_id = $1 and assignment_id = any($2)', [ownerId, assignmentIds])
    : { rows: [] };

  return {
    teacherIds,
    teachers,
    teacher_assignments: assignments,
    group_members: groupMembers,
    project_members: projectMembers,
    project_person_status: projectStatus,
    notes,
    send_records: sendRecords,
  };
}

// Wipes whatever currently exists for the snapshot's teacher ids, then
// re-inserts every row exactly as captured (same ids, via OVERRIDING SYSTEM
// VALUE — safe here because Postgres identity sequences only move forward,
// so reusing an old id can never collide with a newer auto-generated one).
export async function restoreTeachersSnapshot(client, ownerId, snapshot) {
  const teacherIds = snapshot?.teacherIds || [];
  if (teacherIds.length === 0) return;

  // notes.teacher_id and send_records.assignment_id use ON DELETE SET NULL
  // (not cascade) — so a prior delete could have orphaned a row instead of
  // removing it, leaving it sitting at the exact id we're about to
  // re-insert via `overriding system value`. Delete those two by their OWN
  // captured ids (not by the now-possibly-null foreign key) to be sure the
  // slot is actually clear. group_members/project_members/
  // project_person_status all cascade on delete, so no orphaning risk there.
  const noteIds = snapshot.notes.map((n) => n.id);
  const sendRecordIds = snapshot.send_records.map((s) => s.id);
  if (noteIds.length) await client.query('delete from notes where owner_id = $1 and id = any($2)', [ownerId, noteIds]);
  if (sendRecordIds.length) await client.query('delete from send_records where owner_id = $1 and id = any($2)', [ownerId, sendRecordIds]);

  await client.query(
    `delete from send_records where owner_id = $1
       and assignment_id in (select id from teacher_assignments where owner_id = $1 and teacher_id = any($2))`,
    [ownerId, teacherIds]
  );
  await client.query(
    `delete from group_members where owner_id = $1
       and assignment_id in (select id from teacher_assignments where owner_id = $1 and teacher_id = any($2))`,
    [ownerId, teacherIds]
  );
  await client.query('delete from project_person_status where owner_id = $1 and teacher_id = any($2)', [ownerId, teacherIds]);
  await client.query('delete from project_members where owner_id = $1 and teacher_id = any($2)', [ownerId, teacherIds]);
  await client.query('delete from notes where owner_id = $1 and teacher_id = any($2)', [ownerId, teacherIds]);
  await client.query('delete from teacher_assignments where owner_id = $1 and teacher_id = any($2)', [ownerId, teacherIds]);
  await client.query('delete from teachers where owner_id = $1 and id = any($2)', [ownerId, teacherIds]);

  for (const t of snapshot.teachers) {
    await client.query(
      `insert into teachers (id, owner_id, first_name, last_name, is_district_rep, created_at)
       overriding system value values ($1, $2, $3, $4, $5, $6)`,
      [t.id, ownerId, t.first_name, t.last_name, t.is_district_rep, t.created_at]
    );
  }
  for (const a of snapshot.teacher_assignments) {
    await client.query(
      `insert into teacher_assignments (id, owner_id, teacher_id, school, district, subject, level, email, source_sheet, extra_json, created_at)
       overriding system value values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [a.id, ownerId, a.teacher_id, a.school, a.district, a.subject, a.level, a.email, a.source_sheet, a.extra_json, a.created_at]
    );
  }
  // Restored after assignments exist, since it references an assignment id.
  for (const t of snapshot.teachers) {
    if (t.default_assignment_id) {
      await client.query('update teachers set default_assignment_id = $1 where owner_id = $2 and id = $3', [t.default_assignment_id, ownerId, t.id]);
    }
  }
  for (const gm of snapshot.group_members) {
    await client.query('insert into group_members (owner_id, group_id, assignment_id) values ($1, $2, $3) on conflict do nothing', [ownerId, gm.group_id, gm.assignment_id]);
  }
  for (const pm of snapshot.project_members) {
    await client.query(
      'insert into project_members (owner_id, project_id, teacher_id, added_at) values ($1, $2, $3, $4) on conflict do nothing',
      [ownerId, pm.project_id, pm.teacher_id, pm.added_at]
    );
  }
  for (const ps of snapshot.project_person_status) {
    await client.query(
      'insert into project_person_status (owner_id, project_id, teacher_id, status, updated_at) values ($1, $2, $3, $4, $5) on conflict do nothing',
      [ownerId, ps.project_id, ps.teacher_id, ps.status, ps.updated_at]
    );
  }
  for (const n of snapshot.notes) {
    await client.query(
      'insert into notes (id, owner_id, project_id, teacher_id, note_text, created_at) overriding system value values ($1, $2, $3, $4, $5, $6)',
      [n.id, ownerId, n.project_id, n.teacher_id, n.note_text, n.created_at]
    );
  }
  for (const sr of snapshot.send_records) {
    await client.query(
      `insert into send_records (id, owner_id, assignment_id, template_id, group_id, project_id, recipient_field, generated_at, opened_at, status)
       overriding system value values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [sr.id, ownerId, sr.assignment_id, sr.template_id, sr.group_id, sr.project_id, sr.recipient_field, sr.generated_at, sr.opened_at, sr.status]
    );
  }
}
