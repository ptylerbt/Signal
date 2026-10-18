import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';
import { getCurrentWorkspace } from '../../../lib/workspaces.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  // Notes in the CURRENT workspace. Notes written before workspaces existed
  // have none, so they're adopted into whichever workspace is open.
  const notes = await withActingClient(ctx, async (client) => {
    const workspace = await getCurrentWorkspace(client, userId);
    await client.query('update notes set workspace_id = $2 where owner_id = $1 and workspace_id is null', [userId, workspace.id]);
    const { rows } = await client.query(
      `select n.*, l.name as list_name, t.first_name as teacher_first_name, t.last_name as teacher_last_name
       from notes n
       left join lists l on l.id = n.list_id and l.owner_id = n.owner_id and l.deleted_at is null
       left join teachers t on t.id = n.teacher_id and t.owner_id = n.owner_id
       where n.owner_id = $1 and n.workspace_id = $2 and n.deleted_at is null
       order by n.created_at desc`,
      [userId, workspace.id]
    );
    return rows;
  });

  return NextResponse.json(notes);
}

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const { noteText, projectId, teacherId, listId } = await request.json();
  if (!noteText || !noteText.trim()) {
    return NextResponse.json({ error: 'Note text is required' }, { status: 400 });
  }

  const note = await withActingClient(ctx, async (client) => {
    const workspace = await getCurrentWorkspace(client, userId);
    const { rows } = await client.query(
      'insert into notes (owner_id, project_id, teacher_id, note_text, workspace_id, list_id) values ($1, $2, $3, $4, $5, $6) returning *',
      [userId, projectId || null, teacherId || null, noteText.trim(), workspace.id, listId || null]
    );
    return rows[0];
  });

  return NextResponse.json({ success: true, note }, { status: 201 });
}
