// Trash: things she removed are only marked (deleted_at), so they can be
// put back for 30 days. After that they're cleared out for good — lazily,
// whenever the Trash page is opened, so no scheduled job is needed.

export const TRASH_DAYS = 30;

const TYPES = {
  workspace: { table: 'workspaces' },
  list: { table: 'lists' },
  person: { table: 'teachers' },
  note: { table: 'notes' },
  letter: { table: 'templates' },
};

export async function purgeExpired(client, ownerId) {
  const cutoff = `now() - interval '${TRASH_DAYS} days'`;
  // Order matters only for readability; FKs cascade or set null as needed.
  await client.query(`delete from notes where owner_id = $1 and deleted_at < ${cutoff}`, [ownerId]);
  await client.query(`delete from templates where owner_id = $1 and deleted_at < ${cutoff}`, [ownerId]);
  await client.query(`delete from lists where owner_id = $1 and deleted_at < ${cutoff}`, [ownerId]);
  await client.query(`delete from teachers where owner_id = $1 and deleted_at < ${cutoff}`, [ownerId]);
  // People who belonged ONLY to a workspace that's now being cleared out go
  // with it — otherwise they'd have no workspace and get adopted elsewhere.
  await client.query(
    `delete from teachers t
      where t.owner_id = $1
        and exists (select 1 from workspace_people wp join workspaces w on w.id = wp.workspace_id
                     where wp.teacher_id = t.id and w.deleted_at < ${cutoff})
        and not exists (select 1 from workspace_people wp join workspaces w on w.id = wp.workspace_id
                         where wp.teacher_id = t.id and (w.deleted_at is null or w.deleted_at >= ${cutoff}))`,
    [ownerId]
  );
  await client.query(`delete from workspaces where owner_id = $1 and deleted_at < ${cutoff}`, [ownerId]);
}

export async function listTrash(client, ownerId) {
  const [workspaces, lists, people, notes, letters] = await Promise.all([
    client.query(
      `select id, name, emoji, deleted_at from workspaces
        where owner_id = $1 and deleted_at is not null order by deleted_at desc`,
      [ownerId]
    ),
    client.query(
      `select l.id, l.name, l.deleted_at, w.name as workspace_name, (w.deleted_at is not null) as workspace_trashed
         from lists l join workspaces w on w.id = l.workspace_id
        where l.owner_id = $1 and l.deleted_at is not null order by l.deleted_at desc`,
      [ownerId]
    ),
    client.query(
      `select t.id, t.first_name, t.last_name, t.deleted_at,
              (select ta.email from teacher_assignments ta where ta.teacher_id = t.id and ta.email is not null order by ta.id limit 1) as email
         from teachers t
        where t.owner_id = $1 and t.deleted_at is not null order by t.deleted_at desc`,
      [ownerId]
    ),
    client.query(
      `select id, note_text, deleted_at from notes
        where owner_id = $1 and deleted_at is not null order by deleted_at desc`,
      [ownerId]
    ),
    client.query(
      `select id, file_name, deleted_at from templates
        where owner_id = $1 and deleted_at is not null order by deleted_at desc`,
      [ownerId]
    ),
  ]);

  return {
    days: TRASH_DAYS,
    workspaces: workspaces.rows,
    lists: lists.rows,
    people: people.rows,
    notes: notes.rows,
    letters: letters.rows,
  };
}

// Put something back. A person comes back into the current workspace if
// they no longer belong to any (so they're visible again right away).
export async function restoreFromTrash(client, ownerId, type, id, currentWorkspaceId) {
  const spec = TYPES[type];
  if (!spec) return false;
  const { rowCount } = await client.query(
    `update ${spec.table} set deleted_at = null where owner_id = $1 and id = $2 and deleted_at is not null`,
    [ownerId, id]
  );
  if (rowCount && type === 'person' && currentWorkspaceId) {
    await client.query(
      `insert into workspace_people (owner_id, workspace_id, teacher_id)
       select $1, $2, $3
        where not exists (
          select 1 from workspace_people wp join workspaces w on w.id = wp.workspace_id and w.deleted_at is null
           where wp.teacher_id = $3
        )
       on conflict do nothing`,
      [ownerId, currentWorkspaceId, id]
    );
  }
  return rowCount > 0;
}
