import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const notes = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query(
      `select n.*, p.name as project_name, t.first_name as teacher_first_name, t.last_name as teacher_last_name
       from notes n
       left join projects p on p.id = n.project_id and p.owner_id = n.owner_id
       left join teachers t on t.id = n.teacher_id and t.owner_id = n.owner_id
       where n.owner_id = $1
       order by n.created_at desc`,
      [userId]
    );
    return rows;
  });

  return NextResponse.json(notes);
}

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const { noteText, projectId, teacherId } = await request.json();
  if (!noteText || !noteText.trim()) {
    return NextResponse.json({ error: 'Note text is required' }, { status: 400 });
  }

  const note = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query(
      'insert into notes (owner_id, project_id, teacher_id, note_text) values ($1, $2, $3, $4) returning *',
      [userId, projectId || null, teacherId || null, noteText.trim()]
    );
    return rows[0];
  });

  return NextResponse.json({ success: true, note }, { status: 201 });
}
