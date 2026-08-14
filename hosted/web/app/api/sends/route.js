import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../lib/authContext.js';

export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const userId = ctx.effectiveOwnerId;

  const { records } = await request.json();
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: 'At least one send record is required' }, { status: 400 });
  }

  await withActingClient(ctx, async (client) => {
    const now = new Date().toISOString();
    for (const record of records) {
      await client.query(
        `insert into send_records
           (owner_id, assignment_id, template_id, group_id, project_id, recipient_field, generated_at, opened_at, status)
         values ($1, $2, $3, $4, $5, $6, $7, $7, 'opened_in_mail_client')`,
        [
          userId,
          record.assignmentId,
          record.templateId ?? null,
          record.groupId ?? null,
          record.projectId ?? null,
          record.recipientField || 'to',
          now,
        ]
      );

      if (record.projectId) {
        await client.query(
          `insert into project_members (owner_id, project_id, teacher_id)
           select $1, $2, ta.teacher_id from teacher_assignments ta where ta.owner_id = $1 and ta.id = $3
           on conflict do nothing`,
          [userId, record.projectId, record.assignmentId]
        );
      }
    }
  });

  return NextResponse.json({ success: true });
}
