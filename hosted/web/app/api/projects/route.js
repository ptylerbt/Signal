import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const projects = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query(
      `select p.*,
              (select count(*) from project_members pm where pm.owner_id = p.owner_id and pm.project_id = p.id) as member_count,
              (select count(*) from send_records sr where sr.owner_id = p.owner_id and sr.project_id = p.id) as send_count
       from projects p
       where p.owner_id = $1
       order by p.created_at desc`,
      [userId]
    );
    return rows;
  });

  return NextResponse.json(projects);
}

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const { name, description } = await request.json();
  if (!name || !name.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const projectId = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query(
      'insert into projects (owner_id, name, description) values ($1, $2, $3) returning id',
      [userId, name.trim(), description || null]
    );
    return rows[0].id;
  });

  return NextResponse.json({ success: true, projectId }, { status: 201 });
}
