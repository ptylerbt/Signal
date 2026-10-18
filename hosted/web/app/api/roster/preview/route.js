import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { mapRow, isBlank } from '../../../../lib/roster.js';
import { findExistingAssignment } from '../../../../lib/rosterImport.js';
import { getCurrentWorkspace } from '../../../../lib/workspaces.js';

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const rows = [];

  await withActingClient(ctx, async (client) => {
    const workspace = await getCurrentWorkspace(client, userId);
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: null });

      for (const row of sheetRows) {
        const fields = mapRow(row);
        if (isBlank(fields.first_name) && isBlank(fields.last_name)) continue;

        rows.push({
          ...fields,
          district: sheetName,
          source_sheet: sheetName,
          isDuplicate: await findExistingAssignment(client, userId, fields, workspace.id),
        });
      }
    }
  });

  const newCount = rows.filter((r) => !r.isDuplicate).length;
  const duplicateCount = rows.length - newCount;

  return NextResponse.json({
    rows,
    newCount,
    duplicateCount,
    sheetCount: workbook.SheetNames.length,
  });
}
