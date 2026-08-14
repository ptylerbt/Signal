import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';
import { detectLabels, guessMatchedColumn } from '../../../lib/templates.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const templates = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query(
      'select id, file_name, uploaded_at, detected_labels_json from templates where owner_id = $1 order by id desc',
      [userId]
    );
    return rows;
  });

  return NextResponse.json(templates);
}

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const labels = detectLabels(rawText);

  const templateId = await withActingClient(ctx, async (client) => {
    const { rows } = await client.query(
      'insert into templates (owner_id, file_name, raw_text, detected_labels_json) values ($1, $2, $3, $4) returning id',
      [userId, file.name, rawText, JSON.stringify(labels)]
    );
    const newTemplateId = rows[0].id;

    for (const label of labels) {
      await client.query(
        'insert into label_maps (owner_id, template_id, label_name, matched_column, manual_override) values ($1, $2, $3, $4, false)',
        [userId, newTemplateId, label, guessMatchedColumn(label)]
      );
    }

    return newTemplateId;
  });

  return NextResponse.json({ templateId, fileName: file.name, labels }, { status: 201 });
}
