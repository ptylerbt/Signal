import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { distinctValues } from '../../../../lib/groups.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const options = await withActingClient(ctx, async (client) => ({
    schools: await distinctValues(client, userId, 'school'),
    levels: await distinctValues(client, userId, 'level'),
    subjects: await distinctValues(client, userId, 'subject'),
    districts: await distinctValues(client, userId, 'district'),
  }));

  return NextResponse.json(options);
}
