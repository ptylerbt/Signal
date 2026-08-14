import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { withUserClient, ensureProfile } from './db.js';

export const VIEW_AS_COOKIE = 'signal_view_as';

// Every API route calls this once instead of `auth()` directly. It tells
// you two different ids that must NOT be conflated:
//   - realUserId: who is actually signed in (always used for the RLS
//     session variable, so `is_admin()` evaluates against the real admin).
//   - effectiveOwnerId: whose DATA to read/write. For a normal user this
//     is the same as realUserId. For an admin who has picked someone to
//     "view as" (via the signal_view_as cookie), it's that other member's
//     Clerk id instead — so admins can see or act on a member's data
//     without their own account "owning" the new rows.
export async function getActingContext() {
  const { userId } = await auth();
  if (!userId) return null;

  await ensureProfile(userId);

  const role = await withUserClient(userId, async (client) => {
    const { rows } = await client.query('select role from profiles where user_id = $1', [userId]);
    return rows[0]?.role || 'user';
  });
  const isAdmin = role === 'admin';

  const cookieStore = await cookies();
  const viewAsUserId = isAdmin ? cookieStore.get(VIEW_AS_COOKIE)?.value || null : null;

  return {
    realUserId: userId,
    isAdmin,
    role,
    viewAsUserId,
    effectiveOwnerId: viewAsUserId || userId,
    isImpersonating: !!viewAsUserId,
  };
}

// Opens the DB transaction scoped to the REAL signed-in user (never the
// impersonation target) — RLS needs that to know the session belongs to an
// admin. Queries inside should filter with `ctx.effectiveOwnerId`.
export async function withActingClient(ctx, callback) {
  return withUserClient(ctx.realUserId, callback);
}
