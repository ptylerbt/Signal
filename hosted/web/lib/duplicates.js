// Finds teacher profiles that are LIKELY the same person but weren't
// auto-merged on import — either because two rows share a name but the
// email differed or was blank (very common: teachers with per-building
// emails), or because two different-named-looking rows actually share an
// email. This is a review-and-confirm flow, not silent merging: the caller
// shows these to the user and lets them pick "Combine into one profile."
import { dedupeAssignmentsForTeacher, combineAssignmentsByEmail } from './rosterImport.js';
import { snapshotTeachers } from './undo.js';

export async function findDuplicateTeacherGroups(client, ownerId) {
  const { rows: nameRows } = await client.query(
    `select lower(trim(first_name)) as norm_first, lower(trim(last_name)) as norm_last,
            min(first_name) as first_name, min(last_name) as last_name,
            array_agg(id order by id) as teacher_ids
     from teachers
     where owner_id = $1
       and first_name is not null and trim(first_name) != ''
       and last_name is not null and trim(last_name) != ''
     group by norm_first, norm_last
     having count(*) > 1`,
    [ownerId]
  );

  const nameGroups = nameRows.map((g) => ({
    reason: 'Same name',
    label: `${g.first_name} ${g.last_name}`,
    teacherIds: g.teacher_ids,
  }));

  const { rows: emailRows } = await client.query(
    `select lower(trim(email)) as norm_email, array_agg(distinct teacher_id) as teacher_ids
     from teacher_assignments
     where owner_id = $1 and email is not null and trim(email) != ''
     group by norm_email
     having count(distinct teacher_id) > 1`,
    [ownerId]
  );

  const nameGroupKeys = new Set(nameGroups.map((g) => [...g.teacherIds].sort((a, b) => a - b).join(',')));

  const emailGroups = [];
  for (const g of emailRows) {
    const key = [...g.teacher_ids].sort((a, b) => a - b).join(',');
    if (nameGroupKeys.has(key)) continue; // already covered by a name group

    const { rows: teacherRows } = await client.query(
      'select id, first_name, last_name from teachers where owner_id = $1 and id = any($2)',
      [ownerId, g.teacher_ids]
    );
    const names = teacherRows.map((t) => `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim()).join(', ');

    emailGroups.push({
      reason: 'Same email',
      label: `${names} — ${g.norm_email}`,
      teacherIds: g.teacher_ids,
    });
  }

  return [...nameGroups, ...emailGroups];
}

// Reassigns everything from `mergeIds` onto `keepId`, then deletes the
// merged-away teacher rows. Handles the two tables with a (project_id,
// teacher_id) uniqueness constraint by preferring whatever `keepId` already
// has, rather than erroring on a conflict.
export async function mergeTeachers(client, ownerId, keepId, mergeIds) {
  const affectedIds = [keepId, ...mergeIds];
  const snapshot = await snapshotTeachers(client, ownerId, affectedIds);

  for (const mergeId of mergeIds) {
    if (mergeId === keepId) continue;

    await client.query(
      'update teacher_assignments set teacher_id = $1 where owner_id = $2 and teacher_id = $3',
      [keepId, ownerId, mergeId]
    );

    await client.query(
      `update project_members set teacher_id = $1
       where owner_id = $2 and teacher_id = $3
         and project_id not in (select project_id from project_members where owner_id = $2 and teacher_id = $1)`,
      [keepId, ownerId, mergeId]
    );
    await client.query('delete from project_members where owner_id = $1 and teacher_id = $2', [ownerId, mergeId]);

    await client.query(
      `update project_person_status set teacher_id = $1
       where owner_id = $2 and teacher_id = $3
         and project_id not in (select project_id from project_person_status where owner_id = $2 and teacher_id = $1)`,
      [keepId, ownerId, mergeId]
    );
    await client.query('delete from project_person_status where owner_id = $1 and teacher_id = $2', [ownerId, mergeId]);

    await client.query('update notes set teacher_id = $1 where owner_id = $2 and teacher_id = $3', [keepId, ownerId, mergeId]);

    await client.query('delete from teachers where owner_id = $1 and id = $2', [ownerId, mergeId]);
  }

  await dedupeAssignmentsForTeacher(client, ownerId, keepId);
  await combineAssignmentsByEmail(client, ownerId, keepId);

  const keptTeacher = snapshot.teachers.find((t) => t.id === keepId);
  const name = keptTeacher ? `${keptTeacher.first_name ?? ''} ${keptTeacher.last_name ?? ''}`.trim() : '';

  return {
    success: true,
    undo: {
      label: `Combined ${affectedIds.length} profiles into one${name ? ` (${name})` : ''}`,
      teacherIds: affectedIds,
      snapshot,
    },
  };
}
