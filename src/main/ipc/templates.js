const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const mammoth = require('mammoth');
const { getDb, saveDb } = require('../db');

const FIELD_ALIASES = {
  first_name: ['first name', 'first', 'firstname'],
  last_name: ['last name', 'last', 'lastname'],
  school: ['school', 'school/district'],
  level: ['level', 'grade level', 'school level'],
  subject: ['subject', 'subject area', 'instrument'],
  email: ['email', 'e-mail', 'email address'],
  district: ['district'],
};

const AVAILABLE_FIELDS = [
  { column: 'first_name', label: 'First Name' },
  { column: 'last_name', label: 'Last Name' },
  { column: 'school', label: 'School' },
  { column: 'level', label: 'Level' },
  { column: 'subject', label: 'Subject' },
  { column: 'email', label: 'Email' },
  { column: 'district', label: 'District' },
];

function detectLabels(rawText) {
  const matches = rawText.match(/\[([^\[\]]+)\]/g) || [];
  const unique = [...new Set(matches.map((m) => m.slice(1, -1).trim()))];
  return unique;
}

function guessMatchedColumn(labelName) {
  const normalized = labelName.trim().toLowerCase();
  const found = Object.entries(FIELD_ALIASES).find(([, aliases]) => aliases.includes(normalized));
  return found ? found[0] : null;
}

function queryAll(db, sql) {
  const results = [];
  const stmt = db.prepare(sql);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function buildFieldMap(teacher, assignment) {
  const map = {
    first_name: teacher.first_name,
    last_name: teacher.last_name,
    school: assignment.school,
    level: assignment.level,
    subject: assignment.subject,
    email: assignment.email,
    district: assignment.district,
  };

  try {
    const extra = JSON.parse(assignment.extra_json || '{}');
    for (const [key, value] of Object.entries(extra)) {
      if (!(key in map)) map[key] = value;
    }
  } catch {
    // ignore malformed extra_json
  }

  return map;
}

function fillTemplate(rawText, labelMaps, fieldMap) {
  let filled = rawText;
  for (const lm of labelMaps) {
    const value = lm.matched_column ? fieldMap[lm.matched_column] ?? '' : '';
    filled = filled.split(`[${lm.label_name}]`).join(String(value ?? ''));
  }
  return filled;
}

function registerTemplateHandlers() {
  ipcMain.handle('templates:upload', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Letter Template',
      properties: ['openFile'],
      filters: [{ name: 'Word Documents', extensions: ['docx'] }],
    });

    if (canceled || filePaths.length === 0) return { canceled: true };

    const filePath = filePaths[0];
    const fileName = filePath.split(/[\\/]/).pop();
    const { value: rawText } = await mammoth.extractRawText({ path: filePath });

    const labels = detectLabels(rawText);
    const db = await getDb();

    const insertTemplate = db.prepare(`
      INSERT INTO templates (file_name, raw_text, detected_labels_json)
      VALUES (:file_name, :raw_text, :detected_labels_json)
    `);
    insertTemplate.run({
      ':file_name': fileName,
      ':raw_text': rawText,
      ':detected_labels_json': JSON.stringify(labels),
    });
    insertTemplate.free();

    const templateId = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];

    const insertLabelMap = db.prepare(`
      INSERT INTO label_maps (template_id, label_name, matched_column, manual_override)
      VALUES (:template_id, :label_name, :matched_column, 0)
    `);
    for (const label of labels) {
      insertLabelMap.run({
        ':template_id': templateId,
        ':label_name': label,
        ':matched_column': guessMatchedColumn(label),
      });
    }
    insertLabelMap.free();
    saveDb();

    return { canceled: false, templateId, fileName, labels };
  });

  ipcMain.handle('templates:list', async () => {
    const db = await getDb();
    return queryAll(db, 'SELECT * FROM templates ORDER BY id DESC');
  });

  ipcMain.handle('templates:getLabelMaps', async (_event, { templateId }) => {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM label_maps WHERE template_id = :templateId ORDER BY id');
    stmt.bind({ ':templateId': templateId });
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return { labelMaps: rows, availableFields: AVAILABLE_FIELDS };
  });

  ipcMain.handle('templates:setLabelMap', async (_event, { labelMapId, matchedColumn }) => {
    const db = await getDb();
    const stmt = db.prepare(`
      UPDATE label_maps SET matched_column = :matchedColumn, manual_override = 1
      WHERE id = :id
    `);
    stmt.run({ ':matchedColumn': matchedColumn || null, ':id': labelMapId });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('templates:generatePreview', async (_event, { templateId, assignmentIds }) => {
    const db = await getDb();

    const templateStmt = db.prepare('SELECT * FROM templates WHERE id = :id');
    templateStmt.bind({ ':id': templateId });
    templateStmt.step();
    const template = templateStmt.getAsObject();
    templateStmt.free();

    const labelMaps = queryAll(
      db,
      `SELECT * FROM label_maps WHERE template_id = ${templateId}`
    );

    const unmapped = labelMaps.filter((lm) => !lm.matched_column);
    if (unmapped.length > 0) {
      return {
        success: false,
        reason: 'unmapped_labels',
        unmappedLabels: unmapped.map((lm) => lm.label_name),
      };
    }

    const results = [];
    for (const assignmentId of assignmentIds) {
      const stmt = db.prepare(`
        SELECT ta.*, t.first_name, t.last_name, t.id AS teacher_id
        FROM teacher_assignments ta
        JOIN teachers t ON t.id = ta.teacher_id
        WHERE ta.id = :assignmentId
      `);
      stmt.bind({ ':assignmentId': assignmentId });
      stmt.step();
      const row = stmt.getAsObject();
      stmt.free();

      const fieldMap = buildFieldMap(
        { first_name: row.first_name, last_name: row.last_name },
        row
      );
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
}

module.exports = { registerTemplateHandlers, buildFieldMap, fillTemplate };
