CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT,
  last_name TEXT,
  is_district_rep INTEGER DEFAULT 0,
  default_assignment_id INTEGER REFERENCES teacher_assignments(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER REFERENCES teachers(id),
  school TEXT,
  district TEXT,
  subject TEXT,
  level TEXT,
  email TEXT,
  source_sheet TEXT,
  extra_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER REFERENCES groups(id),
  assignment_id INTEGER REFERENCES teacher_assignments(id),
  PRIMARY KEY (group_id, assignment_id)
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT,
  raw_text TEXT,
  detected_labels_json TEXT,
  uploaded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS label_maps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER REFERENCES templates(id),
  label_name TEXT,
  matched_column TEXT,
  manual_override INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS send_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER REFERENCES teacher_assignments(id),
  template_id INTEGER REFERENCES templates(id),
  group_id INTEGER REFERENCES groups(id),
  project_id INTEGER REFERENCES projects(id),
  recipient_field TEXT,
  generated_at TEXT,
  opened_at TEXT,
  status TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  description TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER REFERENCES projects(id),
  teacher_id INTEGER REFERENCES teachers(id),
  added_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS project_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id),
  teacher_id INTEGER REFERENCES teachers(id),
  note_text TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_person_status (
  project_id INTEGER REFERENCES projects(id),
  teacher_id INTEGER REFERENCES teachers(id),
  status TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, teacher_id)
);
