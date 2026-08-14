import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getActingContext, withActingClient, VIEW_AS_COOKIE } from '../../../../lib/authContext.js';

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Admins only' }, { status: 403 });

  const { userId: targetUserId } = await request.json();
  if (!targetUserId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  const exists = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query('select 1 from profiles where user_id = $1', [targetUserId]);
    return rows.length > 0;
  });
  if (!exists) return NextResponse.json({ error: 'No such user' }, { status: 404 });

  const cookieStore = await cookies();
  cookieStore.set(VIEW_AS_COOKIE, targetUserId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const cookieStore = await cookies();
  cookieStore.delete(VIEW_AS_COOKIE);

  return NextResponse.json({ success: true });
}
