import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../lib/authContext.js';
import { AVAILABLE_FIELDS } from '../../../../../lib/templates.js';

export async function GET(_request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const templateId = Number(params.id);

  const labelMaps = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query(
      'select * from label_maps where owner_id = $1 and template_id = $2 order by id',
      [userId, templateId]
    );
    return rows;
  });

  return NextResponse.json({ labelMaps, availableFields: AVAILABLE_FIELDS });
}

export async function PATCH(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const templateId = Number(params.id);
  const { labelMapId, matchedColumn } = await request.json();

  await withActingClient(ctx, (client) =>
    client.query(
      'update label_maps set matched_column = $1, manual_override = true where owner_id = $2 and id = $3 and template_id = $4',
      [matchedColumn || null, userId, labelMapId, templateId]
    )
  );

  return NextResponse.json({ success: true });
}
