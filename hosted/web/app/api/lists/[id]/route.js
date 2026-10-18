import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { getList, updateList, trashList, restoreList } from '../../../../lib/lists.js';

export async function GET(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const data = await withActingClient(ctx, async (client) => {
    const result = await getList(client, ctx.effectiveOwnerId, Number(params.id));
    if (!result) return null;
    const { rows: notes } = await client.query(
      `select id, note_text, created_at, teacher_id from notes
        where owner_id = $1 and list_id = $2 and deleted_at is null
        order by created_at desc`,
      [ctx.effectiveOwnerId, Number(params.id)]
    );
    return { ...result, notes };
  });

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

// Rename / change description, or { restore: true } to bring a trashed list back.
export async function PATCH(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();
  if (body.restore) {
    const ok = await withActingClient(ctx, (client) => restoreList(client, ctx.effectiveOwnerId, Number(params.id)));
    return NextResponse.json({ success: ok });
  }
  if (body.name !== undefined && !String(body.name).trim()) {
    return NextResponse.json({ error: 'Please give the list a name.' }, { status: 400 });
  }

  const list = await withActingClient(ctx, (client) =>
    updateList(client, ctx.effectiveOwnerId, Number(params.id), { name: body.name, description: body.description })
  );
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, list });
}

// Moves the list to Trash (people in it are not affected).
export async function DELETE(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const ok = await withActingClient(ctx, (client) => trashList(client, ctx.effectiveOwnerId, Number(params.id)));
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
