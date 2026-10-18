import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';
import { getCurrentWorkspace } from '../../../lib/workspaces.js';
import { listPeople, addPerson, looksLikeEmail, adoptPeopleWithoutWorkspace } from '../../../lib/people.js';
import { addListMembers } from '../../../lib/lists.js';

// People in the CURRENT workspace.
export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const data = await withActingClient(ctx, async (client) => {
    const workspace = await getCurrentWorkspace(client, ctx.effectiveOwnerId);
    await adoptPeopleWithoutWorkspace(client, ctx.effectiveOwnerId, workspace.id);
    const people = await listPeople(client, ctx.effectiveOwnerId, workspace.id);
    return { workspace, people };
  });

  return NextResponse.json(data);
}

// Add a person by hand into the current workspace (optionally straight
// onto a list too). Name + email are the only required fields.
export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();
  if (!String(body.firstName || '').trim() && !String(body.lastName || '').trim()) {
    return NextResponse.json({ error: 'Please type their name.' }, { status: 400 });
  }
  if (!looksLikeEmail(body.email)) {
    return NextResponse.json({ error: 'Please type their email address, like name@example.com.' }, { status: 400 });
  }

  const result = await withActingClient(ctx, async (client) => {
    const workspace = await getCurrentWorkspace(client, ctx.effectiveOwnerId);
    const added = await addPerson(client, ctx.effectiveOwnerId, workspace.id, body);
    if (body.listId) await addListMembers(client, ctx.effectiveOwnerId, Number(body.listId), [added.teacherId]);
    return added;
  });

  return NextResponse.json({ success: true, ...result }, { status: 201 });
}
