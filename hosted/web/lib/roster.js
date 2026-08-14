// Pure parsing/matching helpers shared by the roster preview and import routes.
// No DB access here — mirrors the desktop app's src/main/ipc/roster.js logic.

const COLUMN_ALIASES = {
  first_name: ['first name', 'first', 'firstname'],
  last_name: ['last name', 'last', 'lastname'],
  school: ['school', 'school/district', 'district'],
  level: ['level', 'grade level', 'school level'],
  subject: ['subject', 'subject area', 'instrument'],
  email: ['email', 'e-mail', 'email address'],
};

export function normalizeHeader(header) {
  return String(header).trim().toLowerCase();
}

export function normalizeName(name) {
  return String(name ?? '').trim().toLowerCase();
}

export function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

export function mapRow(row) {
  const fields = {
    first_name: null,
    last_name: null,
    school: null,
    level: null,
    subject: null,
    email: null,
  };
  const extra = {};

  for (const [rawKey, value] of Object.entries(row)) {
    const normalized = normalizeHeader(rawKey);
    const matchedField = Object.entries(COLUMN_ALIASES).find(([, aliases]) =>
      aliases.includes(normalized)
    );

    if (matchedField) {
      fields[matchedField[0]] = value ?? null;
    } else {
      extra[rawKey] = value;
    }
  }

  fields.extra_json = extra;
  return fields;
}

export function mergeUniqueValues(values) {
  const unique = [];
  const seen = new Set();
  for (const v of values) {
    if (isBlank(v)) continue;
    const norm = normalizeName(v);
    if (!seen.has(norm)) {
      seen.add(norm);
      unique.push(String(v).trim());
    }
  }
  return unique.length > 0 ? unique.join('; ') : null;
}

export function assignmentKey(a) {
  return [a.school, a.level, a.subject, a.email].map(normalizeName).join('|');
}
