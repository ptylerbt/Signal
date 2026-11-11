import { NextResponse } from 'next/server';
import { getActingContext, withActingClient } from '../../../../lib/authContext.js';
import { getCurrentWorkspace } from '../../../../lib/workspaces.js';
import {
  getAccessToken,
  buildMime,
  sendRaw,
  GmailSendError,
  DAILY_RECIPIENT_LIMIT,
  ATTACHMENT_LIMIT_BYTES,
} from '../../../../lib/gmailSend.js';

// Sending one by one to a long list takes a while.
export const maxDuration = 300;

const ERROR_TEXT = {
  reconnect: 'Signal no longer has permission to send from this Gmail account. Please add it again on the Settings page.',
  limit: 'Gmail says this account has sent too many emails today. Please try again tomorrow.',
  google: 'Gmail didn’t accept the email. Please try again in a minute.',
};

function bad(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Sends email from one of the owner's connected Gmail accounts.
//
// Body: {
//   accountId, kind: 'message' | 'letter', test: boolean,
//   delivery: 'separate' | 'bcc'   (messages only),
//   subject, body                   (messages),
//   recipients: [{ assignmentId }]  (messages),
//   letters: [{ assignmentId, text }], templateId  (letters),
//   listId, attachments: [{ name, type, data }]
// }
//
// `test` (and anything sent from the Practice workspace) goes only to the
// sending account itself, so nothing reaches anyone else.
export async function POST(request) {
  const ctx = await getActingContext();
  if (!ctx) return bad('Not signed in', 401);
  const ownerId = ctx.effectiveOwnerId;

  const input = await request.json();
  const kind = input.kind === 'letter' ? 'letter' : 'message';
  const subject = String(input.subject || '').trim();
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];

  const attachmentBytes = attachments.reduce((sum, f) => sum + Math.floor((String(f.data || '').length * 3) / 4), 0);
  if (attachmentBytes > ATTACHMENT_LIMIT_BYTES) return bad('The attached files are too big. Together they must be under 3 MB.');

  // Load the account and the real addresses from the database, so only
  // people in her own Signal can be emailed.
  const setup = await withActingClient(ctx, async (client) => {
    const { rows: accountRows } = await client.query(
      'select id, email, refresh_token_enc from gmail_accounts where owner_id = $1 and id = $2',
      [ownerId, input.accountId]
    );
    const workspace = await getCurrentWorkspace(client, ownerId);

    const wanted = kind === 'letter' ? input.letters || [] : input.recipients || [];
    const ids = wanted.map((r) => Number(r.assignmentId)).filter(Boolean);
    const { rows: people } = await client.query(
      `select ta.id, ta.email, t.first_name, t.last_name
         from teacher_assignments ta join teachers t on t.id = ta.teacher_id
        where ta.owner_id = $1 and ta.id = any($2::bigint[]) and coalesce(ta.email, '') <> ''`,
      [ownerId, ids]
    );
    return { account: accountRows[0], workspace, people: new Map(people.map((p) => [Number(p.id), p])) };
  });

  const { account, workspace, people } = setup;
  if (!account) return bad('Please choose which Gmail account to send from.');

  // Build the list of emails to send: [{ to, bcc, subject, body, assignmentIds }].
  let emails = [];
  if (kind === 'message') {
    const body = String(input.body || '');
    if (!subject && !body.trim()) return bad('Type a subject or a message first.');
    const recipients = (input.recipients || []).map((r) => people.get(Number(r.assignmentId))).filter(Boolean);
    if (recipients.length === 0) return bad('None of these people have an email address.');
    if (input.delivery === 'bcc') {
      emails = [{ to: [account.email], bcc: recipients.map((p) => p.email), subject, body, assignmentIds: recipients.map((p) => p.id) }];
    } else {
      emails = recipients.map((p) => ({ to: [p.email], subject, body, assignmentIds: [p.id] }));
    }
  } else {
    if (!subject) return bad('Please type a subject.');
    emails = (input.letters || [])
      .map((l) => ({ person: people.get(Number(l.assignmentId)), text: String(l.text || '') }))
      .filter((l) => l.person)
      .map((l) => ({ to: [l.person.email], subject, body: l.text, assignmentIds: [l.person.id] }));
    if (emails.length === 0) return bad('None of these people have an email address.');
  }

  const recipientCount = emails.reduce((n, e) => n + (e.bcc?.length || e.to.length), 0);
  const isTest = !!input.test || workspace.is_practice;

  if (isTest) {
    // One sample, to herself, marked so it can't be mistaken for the real thing.
    const sample = emails[0];
    const label = workspace.is_practice ? 'Practice' : 'Test';
    emails = [{
      to: [account.email],
      subject: `[${label}] ${sample.subject}`,
      body: `(This is a ${label.toLowerCase()} email. Only you got it. The real one would go to ${recipientCount} ${recipientCount === 1 ? 'person' : 'people'}.)\n\n${sample.body}`,
      assignmentIds: [],
    }];
  } else if (recipientCount > DAILY_RECIPIENT_LIMIT) {
    return bad(`Gmail only lets one account email about ${DAILY_RECIPIENT_LIMIT} people a day. Please split this into smaller lists.`);
  }

  let accessToken;
  try {
    accessToken = await getAccessToken(account.refresh_token_enc);
  } catch (err) {
    console.error('Gmail token:', err.message);
    return bad(ERROR_TEXT[err.code] || ERROR_TEXT.google, 502);
  }

  // Send one at a time. If Gmail stops partway (daily limit, permission
  // removed), stop there and say exactly who did and didn't get it.
  const sentIds = [];
  let sentEmails = 0;
  let stopped = null;
  for (const email of emails) {
    try {
      await sendRaw(accessToken, buildMime({ ...email, attachments }));
      sentEmails += 1;
      sentIds.push(...email.assignmentIds);
    } catch (err) {
      console.error('Gmail send:', err.message);
      stopped = err instanceof GmailSendError ? err.code : 'google';
      break;
    }
  }

  // Record what went out (not tests), and remember the account for this workspace.
  await withActingClient(ctx, async (client) => {
    await client.query('update workspaces set last_gmail_account_id = $2 where id = $1 and owner_id = $3', [workspace.id, account.id, ownerId]);
    if (isTest) return;

    const listId = input.listId ? Number(input.listId) : null;
    const field = kind === 'message' && input.delivery === 'bcc' ? 'bcc' : 'to';
    for (const assignmentId of sentIds) {
      await client.query(
        `insert into send_records
           (owner_id, assignment_id, template_id, recipient_field, generated_at, opened_at, status, workspace_id, list_id, sent_from, subject)
         values ($1, $2, (select id from templates where id = $3 and owner_id = $1), $4, now(), now(), 'sent', $5,
                 (select id from lists where id = $6 and owner_id = $1), $7, $8)`,
        [ownerId, assignmentId, kind === 'letter' ? input.templateId ?? null : null, field, workspace.id, listId, account.email, subject]
      );
      if (listId) {
        await client.query(
          `update list_members m set status = 'Emailed', status_updated_at = now()
             from teacher_assignments ta
            where ta.id = $3 and ta.owner_id = $1
              and m.owner_id = $1 and m.list_id = $2 and m.teacher_id = ta.teacher_id
              and m.status is null`,
          [ownerId, listId, assignmentId]
        );
      }
    }
  });

  const notSent = isTest
    ? []
    : emails.slice(sentEmails).flatMap((e) => e.assignmentIds.map((id) => people.get(id))).filter(Boolean)
        .map((p) => [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email);

  return NextResponse.json({
    success: !stopped,
    test: isTest,
    practice: workspace.is_practice,
    from: account.email,
    sentTo: isTest ? 1 : sentIds.length,
    notSent,
    error: stopped ? ERROR_TEXT[stopped] || ERROR_TEXT.google : null,
  }, { status: stopped && sentEmails === 0 ? 502 : 200 });
}
