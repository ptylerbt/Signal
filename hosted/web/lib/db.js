import { Pool } from 'pg';

// One shared pool for the whole server. Neon's connection string already
// includes `?sslmode=require`, which `pg` honors automatically.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Runs `callback(client)` inside a transaction that has told Postgres
// "this connection is acting on behalf of userId" via SET LOCAL. Every
// query the callback runs is therefore subject to that user's Row Level
// Security policies — a user physically cannot see another user's rows,
// even if application code has a bug.
export async function withUserClient(userId, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // set_config(..., true) is the parameterized equivalent of SET LOCAL —
    // avoids ever string-concatenating a user id into raw SQL.
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Call once per signed-in user (cheap no-op after the first time) so
// their profiles row exists before anything else queries it.
export async function ensureProfile(userId) {
  return withUserClient(userId, (client) =>
    client.query(
      'insert into public.profiles (user_id) values ($1) on conflict (user_id) do nothing',
      [userId]
    )
  );
}
