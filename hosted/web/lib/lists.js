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
