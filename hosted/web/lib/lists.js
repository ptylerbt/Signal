// Lists replace the old Groups + Projects: a named set of people inside one
// workspace (e.g. "Choir Members"), which also tracks who replied.
// Functions take a client already inside withActingClient() and the
// effective owner id.

export async function listLists(client, ownerId, workspaceId) {
  const { rows } = await client.query(
    `select l.id, l.name, l.description, l.color, l.created_at,
            (select count(*)::int from list_members m where m.list_id = l.id) as member_count,
            (select count(*)::int from send_records s where s.list_id = l.id) as send_count,
            (select max(s.generated_at) from send_records s where s.list_id = l.id) as last_sent_at
       from lists l
      where l.owner_id = $1 and l.workspace_id = $2 and l.deleted_at is null
      order by l.created_at desc`,
    [ownerId, workspaceId]
  );
  return rows;
}

export async function createList(client, ownerId, workspaceId, { name, description = null, color = null }) {
  const finalName = String(name || '').trim().slice(0, 120);
  if (!finalName) throw new Error('List name is required');
  const { rows } = await client.query(
    `insert into lists (owner_id, workspace_id, name, description, color)
     select $1, w.id, $3, $4, $5 from workspaces w
      where w.id = $2 and w.owner_id = $1 and w.deleted_at is null
     returning id, name, description, color, created_at`,
    [ownerId, workspaceId, finalName, description ? String(description).trim() : null, color]
  );
  return rows[0] || null;
}

// Reply statuses, in the order shown. '' = nothing marked yet.
export const LIST_STATUSES = ['', 'Emailed', 'Replied', 'Said yes', 'Said no', 'No reply'];

export async function getList(client, ownerId, listId) {
  const { rows: [list] } = await client.query(
    `select l.id, l.name, l.description, l.workspace_id, l.created_at, w.name as workspace_name
       from lists l join workspaces w on w.id = l.workspace_id
      where l.owner_id = $1 and l.id = $2 and l.deleted_at is null`,
    [ownerId, listId]
  );
  if (!list) return null;

  // The email used for each member: the one picked for this list, else
  // their first contact row that has an email.
  const { rows: members } = await client.query(
    `select t.id as teacher_id, t.first_name, t.last_name, m.status, m.status_updated_at, m.added_at,
            coalesce(chosen.email, fallback.email) as email,
            coalesce(chosen.id, fallback.id) as assignment_id,
            coalesce(chosen.subject, fallback.subject) as role,
            coalesce(chosen.school, fallback.school) as organization
       from list_members m
       join teachers t on t.id = m.teacher_id and t.deleted_at is null
       left join teacher_assignments chosen on chosen.id = m.assignment_id
       left join lateral (
         select ta.id, ta.email, ta.subject, ta.school from teacher_assignments ta
          where ta.teacher_id = t.id and ta.email is not null and trim(ta.email) != ''
          order by ta.id limit 1
       ) fallback on true
      where m.owner_id = $1 and m.list_id = $2
      order by lower(coalesce(t.last_name, '')), lower(coalesce(t.first_name, ''))`,
    [ownerId, listId]
  );

  return { list, members };
}

export async function updateList(client, ownerId, listId, { name, description }) {
  const finalName = name === undefined ? null : String(name).trim().slice(0, 120);
  if (name !== undefined && !finalName) throw new Error('List name is required');
  const { rows } = await client.query(
    `update lists set name = coalesce($3, name),
            description = case when $4::boolean then $5 else description end
      where owner_id = $1 and id = $2 and deleted_at is null
      returning id, name, description`,
    [ownerId, listId, finalName, description !== undefined, description ? String(description).trim() : null]
  );
  return rows[0] || null;
}

// Only people already in the list's workspace can be added.
export async function addListMembers(client, ownerId, listId, teacherIds) {
  const { rowCount } = await client.query(
    `insert into list_members (owner_id, list_id, teacher_id)
     select $1, l.id, wp.teacher_id
       from lists l
       join workspace_people wp on wp.workspace_id = l.workspace_id and wp.teacher_id = any($3::bigint[])
      where l.id = $2 and l.owner_id = $1 and l.deleted_at is null
     on conflict do nothing`,
    [ownerId, listId, teacherIds]
  );
  return rowCount;
}

export async function removeListMember(client, ownerId, listId, teacherId) {
  const { rows } = await client.query(
    'delete from list_members where owner_id = $1 and list_id = $2 and teacher_id = $3 returning *',
    [ownerId, listId, teacherId]
  );
  return rows[0] || null;
}

// Puts a removed member back exactly as they were (for Undo).
export async function restoreListMember(client, ownerId, row) {
  // The row comes back from the browser, so only accept it for a person who
  // is genuinely in this list's workspace.
  await client.query(
    `insert into list_members (owner_id, list_id, teacher_id, assignment_id, status, status_updated_at, added_at)
     select $1, l.id, wp.teacher_id,
            (select ta.id from teacher_assignments ta where ta.id = $4 and ta.teacher_id = wp.teacher_id),
            $5, $6, coalesce($7, now())
       from lists l
       join workspace_people wp on wp.workspace_id = l.workspace_id and wp.teacher_id = $3
      where l.id = $2 and l.owner_id = $1
     on conflict do nothing`,
    [ownerId, row.list_id, row.teacher_id, row.assignment_id ?? null, row.status ?? null, row.status_updated_at ?? null, row.added_at ?? null]
  );
}

export async function setMemberStatus(client, ownerId, listId, teacherId, status) {
  const value = LIST_STATUSES.includes(status) && status ? status : null;
  const { rowCount } = await client.query(
    `update list_members set status = $4, status_updated_at = now()
      where owner_id = $1 and list_id = $2 and teacher_id = $3`,
    [ownerId, listId, teacherId, value]
  );
  return rowCount > 0;
}

export async function trashList(client, ownerId, listId) {
  const { rowCount } = await client.query(
    'update lists set deleted_at = now() where owner_id = $1 and id = $2 and deleted_at is null',
    [ownerId, listId]
  );
  return rowCount > 0;
}

export async function restoreList(client, ownerId, listId) {
  const { rowCount } = await client.query(
    'update lists set deleted_at = null where owner_id = $1 and id = $2 and deleted_at is not null',
    [ownerId, listId]
  );
  return rowCount > 0;
}

// Latest notes in a workspace, for the Notes box on Home.
export async function recentNotes(client, ownerId, workspaceId, limit = 5) {
  const { rows } = await client.query(
    `select n.*, p.name as project_name, t.first_name as teacher_first_name, t.last_name as teacher_last_name
       from notes n
       left join projects p on p.id = n.project_id and p.owner_id = n.owner_id
       left join teachers t on t.id = n.teacher_id and t.owner_id = n.owner_id
      where n.owner_id = $1 and n.workspace_id = $2 and n.deleted_at is null
      order by n.created_at desc
      limit $3`,
    [ownerId, workspaceId, limit]
  );
  return rows;
}

// Most recent sends in a workspace, newest first, for Home's "Recently sent".
export async function recentSends(client, ownerId, workspaceId, limit = 5) {
  const { rows } = await client.query(
    `select s.id, s.generated_at, s.status, s.list_id, l.name as list_name,
            t.id as teacher_id, t.first_name, t.last_name, ta.email,
            tp.file_name as template_name
       from send_records s
       left join teacher_assignments ta on ta.id = s.assignment_id and ta.owner_id = s.owner_id
       left join teachers t on t.id = ta.teacher_id and t.owner_id = s.owner_id
       left join lists l on l.id = s.list_id and l.owner_id = s.owner_id
       left join templates tp on tp.id = s.template_id and tp.owner_id = s.owner_id
      where s.owner_id = $1 and s.workspace_id = $2
      order by s.generated_at desc
      limit $3`,
    [ownerId, workspaceId, limit]
  );
  return rows;
}
