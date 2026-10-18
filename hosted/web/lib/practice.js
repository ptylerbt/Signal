// The Practice workspace: pretend people, lists, a note, and a ready-to-use
// letter, so she can learn by trying things with nothing real at stake.
// Every pretend email is @example.com, a domain reserved for examples, so
// even an email accidentally sent from Practice reaches no one.
import { createWorkspace, setCurrentWorkspace } from './workspaces.js';

export const PRACTICE_NAME = 'Practice';

const PEOPLE = [
  { first: 'Rosa', last: 'Practice', email: 'rosa@example.com', role: 'Choir member', org: 'Sample Community Church' },
  { first: 'Theo', last: 'Practice', email: 'theo@example.com', role: 'Choir member', org: 'Sample Community Church' },
  { first: 'Mina', last: 'Practice', email: 'mina@example.com', role: 'Choir director', org: 'Sample Community Church' },
  { first: 'Omar', last: 'Practice', email: 'omar@example.com', role: 'Band director', org: 'Sample Middle School', grade: 'Middle school' },
  { first: 'June', last: 'Practice', email: 'june@example.com', role: 'Orchestra director', org: 'Sample High School', grade: 'High school' },
  { first: 'Leo', last: 'Practice', email: 'leo@example.com', role: 'Parent', org: 'Sample Middle School' },
  { first: 'Ada', last: 'Practice', email: 'ada@example.com', role: 'Parent', org: 'Sample High School' },
  { first: 'Sam', last: 'Practice', email: 'sam@example.com', role: 'Volunteer', org: 'Sample Music Festival' },
];

const LISTS = [
  { name: 'Practice Choir', description: 'Pretend choir members — try emailing them!', members: ['Rosa', 'Theo', 'Mina', 'Sam'], statuses: { Rosa: 'Said yes', Theo: 'Replied' } },
  { name: 'Practice Directors', description: 'Pretend school music directors', members: ['Omar', 'June', 'Mina'], statuses: {} },
];

const LETTER_TEXT = `Dear [First],

Thank you for everything you do at [School]! This is a practice letter, so feel free to try sending it — it only goes to a pretend address.

See you soon,
Your friend`;

export async function getPracticeWorkspace(client, ownerId) {
  const { rows } = await client.query(
    'select id, name, emoji, color, is_practice from workspaces where owner_id = $1 and is_practice and deleted_at is null order by id limit 1',
    [ownerId]
  );
  return rows[0] || null;
}

async function fill(client, ownerId, workspaceId) {
  const idByFirst = new Map();
  for (const p of PEOPLE) {
    const { rows: [t] } = await client.query(
      'insert into teachers (owner_id, first_name, last_name) values ($1, $2, $3) returning id',
      [ownerId, p.first, p.last]
    );
    await client.query(
      'insert into teacher_assignments (owner_id, teacher_id, email, subject, school, level) values ($1, $2, $3, $4, $5, $6)',
      [ownerId, t.id, p.email, p.role, p.org, p.grade || null]
    );
    await client.query('insert into workspace_people (owner_id, workspace_id, teacher_id) values ($1, $2, $3)', [ownerId, workspaceId, t.id]);
    idByFirst.set(p.first, t.id);
  }

  for (const l of LISTS) {
    const { rows: [list] } = await client.query(
      'insert into lists (owner_id, workspace_id, name, description) values ($1, $2, $3, $4) returning id',
      [ownerId, workspaceId, l.name, l.description]
    );
    for (const first of l.members) {
      const status = l.statuses[first] || null;
      await client.query(
        `insert into list_members (owner_id, list_id, teacher_id, status, status_updated_at)
         values ($1, $2, $3, $4, case when $4::text is null then null else now() end)`,
        [ownerId, list.id, idByFirst.get(first), status]
      );
    }
  }

  await client.query('insert into notes (owner_id, workspace_id, note_text) values ($1, $2, $3)', [
    ownerId,
    workspaceId,
    'This is a practice note. Try writing your own, or delete this one — you can get it back from Trash.',
  ]);

  const { rows: [tmpl] } = await client.query(
    `insert into templates (owner_id, workspace_id, file_name, raw_text, detected_labels_json)
     values ($1, $2, 'Practice thank-you letter.docx', $3, $4) returning id`,
    [ownerId, workspaceId, LETTER_TEXT, JSON.stringify(['First', 'School'])]
  );
  await client.query(
    `insert into label_maps (owner_id, template_id, label_name, matched_column, manual_override)
     values ($1, $2, 'First', 'first_name', false), ($1, $2, 'School', 'school', false)`,
    [ownerId, tmpl.id]
  );
}

// Clears out the practice workspace and everything in it. Pretend people
// who only exist there go too; anyone she also added to a real workspace stays.
async function clear(client, ownerId, workspaceId) {
  await client.query(
    `delete from teachers t
      where t.owner_id = $1
        and exists (select 1 from workspace_people wp where wp.teacher_id = t.id and wp.workspace_id = $2)
        and not exists (select 1 from workspace_people wp where wp.teacher_id = t.id and wp.workspace_id != $2)`,
    [ownerId, workspaceId]
  );
  await client.query('delete from workspaces where owner_id = $1 and id = $2 and is_practice', [ownerId, workspaceId]);
}

// Opens Practice (creating it the first time). With reset, starts it over.
export async function openPractice(client, ownerId, { reset = false } = {}) {
  let workspace = await getPracticeWorkspace(client, ownerId);
  if (workspace && reset) {
    await clear(client, ownerId, workspace.id);
    workspace = null;
  }
  if (!workspace) {
    workspace = await createWorkspace(client, ownerId, { name: PRACTICE_NAME, emoji: '🧪', color: '#0f6b6b', isPractice: true });
    await fill(client, ownerId, workspace.id);
  }
  await setCurrentWorkspace(client, ownerId, workspace.id);
  return workspace;
}
