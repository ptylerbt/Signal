import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../../lib/authContext.js';
import { buildFieldMap, fillTemplate } from '../../../../../lib/templates.js';

export async function POST(request, { params }) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const templateId = Number(params.id);
  const { assignmentIds } = await request.json();
  if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
    return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 });
  }

  const result = await withActingClient(ctx, async (client) => {
    const { rows: templateRows } = await client.query(
      'select * from templates where owner_id = $1 and id = $2',
      [userId, templateId]
    );
    const template = templateRows[0];
    if (!template) return { success: false, reason: 'template_not_found' };

    const { rows: labelMaps } = await client.query(
      'select * from label_maps where owner_id = $1 and template_id = $2 order by id',
      [userId, templateId]
    );

    const unmapped = labelMaps.filter((lm) => !lm.matched_column);
    if (unmapped.length > 0) {
      return { success: false, reason: 'unmapped_labels', unmappedLabels: unmapped.map((lm) => lm.label_name) };
    }

    const results = [];
    for (const assignmentId of assignmentIds) {
      const { rows } = await client.query(
        `select ta.*, t.first_name, t.last_name, t.id as teacher_id
         from teacher_assignments ta
         join teachers t on t.id = ta.teacher_id
         where ta.owner_id = $1 and ta.id = $2`,
        [userId, assignmentId]
      );
      const row = rows[0];
      if (!row) continue;

      const fieldMap = buildFieldMap({ first_name: row.first_name, last_name: row.last_name }, row);
      const filledText = fillTemplate(template.raw_text, labelMaps, fieldMap);

      results.push({
        assignmentId,
        teacherId: row.teacher_id,
        name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
        email: row.email,
        filledText,
      });
    }

    return { success: true, results };
  });

  return NextResponse.json(result);
}
