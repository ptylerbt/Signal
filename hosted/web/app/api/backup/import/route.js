import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { importBackup } from '../../../../lib/backup.js';

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ error: 'That file is not valid JSON.' }, { status: 400 });
  }

  try {
    const counts = await withActingClient(ctx, (client) => importBackup(client, userId, data));
    return NextResponse.json({ success: true, counts });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Import failed.' }, { status: 400 });
  }
}
