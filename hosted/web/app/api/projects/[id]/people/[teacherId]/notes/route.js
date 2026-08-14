import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../../../lib/authContext.js';

export async function POST(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const projectId = Number(params.id);
  const teacherId = Number(params.teacherId);
  const { noteText } = await request.json();
  if (!noteText || !noteText.trim()) return NextResponse.json({ error: 'Note text is required' }, { status: 400 });

  await withActingClient(ctx, (client) =>
    client.query(
      'insert into notes (owner_id, project_id, teacher_id, note_text) values ($1, $2, $3, $4)',
      [userId, projectId, teacherId, noteText.trim()]
    )
  );

  return NextResponse.json({ success: true });
}
