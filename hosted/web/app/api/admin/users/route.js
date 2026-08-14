import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Admins only' }, { status: 403 });

  const profiles = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query('select user_id, role, created_at from profiles order by created_at');
    return rows;
  });

  const clerk = await clerkClient();
  const users = await Promise.all(
    profiles.map(async (p) => {
      try {
        const u = await clerk.users.getUser(p.user_id);
        return {
          userId: p.user_id,
          role: p.role,
          createdAt: p.created_at,
          name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
          email: u.primaryEmailAddress?.emailAddress ?? '',
        };
      } catch {
        return { userId: p.user_id, role: p.role, createdAt: p.created_at, name: '(deleted account)', email: '' };
      }
    })
  );

  return NextResponse.json(users);
}
