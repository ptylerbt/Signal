import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../lib/authContext.js';

export async function PATCH(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Admins only' }, { status: 403 });

  const { targetUserId } = params;
  const { role } = await request.json();
  if (role !== 'user' && role !== 'admin') {
    return NextResponse.json({ error: 'Role must be "user" or "admin"' }, { status: 400 });
  }
  if (targetUserId === ctx.realUserId && role !== 'admin') {
    return NextResponse.json({ error: 'You cannot remove your own admin access.' }, { status: 400 });
  }

  await withActingClient(ctx, (client) =>
    client.query('update profiles set role = $1 where user_id = $2', [role, targetUserId])
  );

  return NextResponse.json({ success: true });
}
