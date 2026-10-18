// Workspaces = one per organization (DMEA, Church, School...). Every screen
// works inside the "current" workspace, remembered on the owner's profile
// row so it survives sign-out and device changes.
//
// All functions take a client already inside withActingClient(), and an
// ownerId (ctx.effectiveOwnerId) — so an admin viewing-as a member sees
// and switches that member's workspaces.

export const DEFAULT_WORKSPACE_NAME = 'My Workspace';

function cleanName(name) {
  return String(name || '').trim().slice(0, 80);
}

export async function listWorkspaces(client, ownerId) {
  const { rows } = await client.query(
    `select w.id, w.name, w.emoji, w.color, w.is_practice, w.sort_order, w.created_at,
            (select count(*)::int from workspace_people wp where wp.workspace_id = w.id) as people_count,
            (select count(*)::int from lists l where l.workspace_id = w.id and l.deleted_at is null) as list_count
       from workspaces w
      where w.owner_id = $1 and w.deleted_at is null
      order by w.is_practice, w.sort_order, w.created_at`,
    [ownerId]
  );
  return rows;
}

export async function createWorkspace(client, ownerId, { name, emoji = null, color = null, isPractice = false }) {
  const finalName = cleanName(name);
  if (!finalName) throw new Error('Workspace name is required');
  const { rows } = await client.query(
    `insert into workspaces (owner_id, name, emoji, color, is_practice, sort_order)
     values ($1, $2, $3, $4, $5,
             coalesce((select max(sort_order) + 1 from workspaces where owner_id = $1), 0))
     returning id, name, emoji, color, is_practice, sort_order, created_at`,
    [ownerId, finalName, emoji, color, isPractice]
  );
  return rows[0];
}

export async function updateWorkspace(client, ownerId, workspaceId, { name, emoji, color }) {
  const finalName = name === undefined ? null : cleanName(name);
  if (name !== undefined && !finalName) throw new Error('Workspace name is required');
  const { rows } = await client.query(
    `update workspaces
        set name = coalesce($3, name),
            emoji = case when $4::boolean then $5 else emoji end,
            color = case when $6::boolean then $7 else color end
      where id = $2 and owner_id = $1 and deleted_at is null
      returning id, name, emoji, color, is_practice, sort_order, created_at`,
    [ownerId, workspaceId, finalName, emoji !== undefined, emoji ?? null, color !== undefined, color ?? null]
  );
  return rows[0] || null;
}

// Soft delete — goes to Trash for 30 days. Restoring is just clearing deleted_at.
export async function trashWorkspace(client, ownerId, workspaceId) {
  const { rowCount } = await client.query(
    `update workspaces set deleted_at = now()
      where id = $2 and owner_id = $1 and deleted_at is null`,
    [ownerId, workspaceId]
  );
  if (rowCount) {
    await client.query(
      `update profiles set current_workspace_id = null
        where user_id = $1 and current_workspace_id = $2`,
      [ownerId, workspaceId]
    );
  }
  return rowCount > 0;
}

export async function restoreWorkspace(client, ownerId, workspaceId) {
  const { rowCount } = await client.query(
    `update workspaces set deleted_at = null
      where id = $2 and owner_id = $1 and deleted_at is not null`,
    [ownerId, workspaceId]
  );
  return rowCount > 0;
}

export async function setCurrentWorkspace(client, ownerId, workspaceId) {
  const { rows } = await client.query(
    'select id from workspaces where id = $2 and owner_id = $1 and deleted_at is null',
    [ownerId, workspaceId]
  );
  if (!rows[0]) return false;
  await client.query('update profiles set current_workspace_id = $2 where user_id = $1', [ownerId, workspaceId]);
  return true;
}

// Always returns a usable workspace: the remembered one if still valid,
// otherwise the first real (non-practice) one, otherwise a freshly created
// "My Workspace" — so a brand-new user never lands on an empty, broken app.
export async function getCurrentWorkspace(client, ownerId) {
  const { rows: remembered } = await client.query(
    `select w.id, w.name, w.emoji, w.color, w.is_practice
       from profiles p
       join workspaces w on w.id = p.current_workspace_id
      where p.user_id = $1 and w.owner_id = $1 and w.deleted_at is null`,
    [ownerId]
  );
  if (remembered[0]) return remembered[0];

  const { rows: fallback } = await client.query(
    `select id, name, emoji, color, is_practice
       from workspaces
      where owner_id = $1 and deleted_at is null
      order by is_practice, sort_order, created_at
      limit 1`,
    [ownerId]
  );
  const workspace = fallback[0] || (await createWorkspace(client, ownerId, { name: DEFAULT_WORKSPACE_NAME }));
  await client.query('update profiles set current_workspace_id = $2 where user_id = $1', [ownerId, workspace.id]);
  return {
    id: workspace.id,
    name: workspace.name,
    emoji: workspace.emoji,
    color: workspace.color,
    is_practice: workspace.is_practice,
  };
}
