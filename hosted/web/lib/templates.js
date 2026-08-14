export const FIELD_ALIASES = {
  first_name: ['first name', 'first', 'firstname'],
  last_name: ['last name', 'last', 'lastname'],
  school: ['school', 'school/district'],
  level: ['level', 'grade level', 'school level'],
  subject: ['subject', 'subject area', 'instrument'],
  email: ['email', 'e-mail', 'email address'],
  district: ['district'],
};

export const AVAILABLE_FIELDS = [
  { column: 'first_name', label: 'First Name' },
  { column: 'last_name', label: 'Last Name' },
  { column: 'school', label: 'School' },
  { column: 'level', label: 'Level' },
  { column: 'subject', label: 'Subject' },
  { column: 'email', label: 'Email' },
  { column: 'district', label: 'District' },
];

export function detectLabels(rawText) {
  const matches = rawText.match(/\[([^\[\]]+)\]/g) || [];
  return [...new Set(matches.map((m) => m.slice(1, -1).trim()))];
}

export function guessMatchedColumn(labelName) {
  const normalized = labelName.trim().toLowerCase();
  const found = Object.entries(FIELD_ALIASES).find(([, aliases]) => aliases.includes(normalized));
  return found ? found[0] : null;
}

export function buildFieldMap(teacher, assignment) {
  const map = {
    first_name: teacher.first_name,
    last_name: teacher.last_name,
    school: assignment.school,
    level: assignment.level,
    subject: assignment.subject,
    email: assignment.email,
    district: assignment.district,
  };

  const extra = assignment.extra_json || {};
  for (const [key, value] of Object.entries(extra)) {
    if (!(key in map)) map[key] = value;
  }

  return map;
}

export function fillTemplate(rawText, labelMaps, fieldMap) {
  let filled = rawText;
  for (const lm of labelMaps) {
    const value = lm.matched_column ? fieldMap[lm.matched_column] ?? '' : '';
    filled = filled.split(`[${lm.label_name}]`).join(String(value ?? ''));
  }
  return filled;
}
