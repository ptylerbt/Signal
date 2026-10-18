import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { withUserClient, ensureProfile } from '../../../lib/db.js';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  await ensureProfile(userId);

  const profile = await withUserClient(userId, async (client) => {
    const { rows } = await client.query(
      'select role, font_scale, high_contrast, default_signature, show_advanced from profiles where user_id = $1',
      [userId]
    );
    return rows[0];
  });

  const user = await currentUser();

  return NextResponse.json({
    name: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '',
    email: user?.primaryEmailAddress?.emailAddress ?? '',
    role: profile.role,
    fontScale: profile.font_scale,
    highContrast: profile.high_contrast,
    defaultSignature: profile.default_signature ?? '',
    showAdvanced: !!profile.show_advanced,
  });
}

export async function PATCH(request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();

  // The Advanced switch saves on its own, without the other fields.
  if (Object.keys(body).length === 1 && 'showAdvanced' in body) {
    await withUserClient(userId, (client) =>
      client.query('update profiles set show_advanced = $1 where user_id = $2', [!!body.showAdvanced, userId])
    );
    return NextResponse.json({ success: true });
  }

  const { fontScale, highContrast, defaultSignature } = body;
  const clampedScale = Math.min(1.6, Math.max(0.8, Number(fontScale) || 1.0));

  await withUserClient(userId, (client) =>
    client.query(
      'update profiles set font_scale = $1, high_contrast = $2, default_signature = $3 where user_id = $4',
      [clampedScale, !!highContrast, defaultSignature || null, userId]
    )
  );

  return NextResponse.json({ success: true });
}
