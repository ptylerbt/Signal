import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';
import { detectLabels, guessMatchedColumn } from '../../../lib/templates.js';
import { getCurrentWorkspace } from '../../../lib/workspaces.js';

export async function GET() {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  // Letters for the CURRENT workspace, plus older letters saved before
  // workspaces existed (workspace_id null), which show everywhere.
  const templates = await withActingClient(ctx, async (client) => {
    const workspace = await getCurrentWorkspace(client, userId);
    const { rows } = await client.query(
      // unmapped_count > 0 means some [Label] isn't linked to a field yet, so
      // the letter can't be filled in until it's set up on the Letters page.
      `select t.id, t.file_name, t.uploaded_at, t.detected_labels_json,
              (select count(*)::int from label_maps lm
                where lm.template_id = t.id and lm.matched_column is null) as unmapped_count
         from templates t
        where t.owner_id = $1 and t.deleted_at is null
          and (t.workspace_id = $2 or t.workspace_id is null)
        order by t.id desc`,
      [userId, workspace.id]
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
      'insert into templates (owner_id, file_name, raw_text, detected_labels_json, workspace_id) values ($1, $2, $3, $4, $5) returning id',
      [userId, file.name, rawText, JSON.stringify(labels), (await getCurrentWorkspace(client, userId)).id]
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
