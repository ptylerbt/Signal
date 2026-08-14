const { ipcMain } = require('electron');
const { getDb } = require('../db');

function queryAll(db, sql) {
  const results = [];
  const stmt = db.prepare(sql);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function registerSendHandlers() {
  ipcMain.handle('sends:listForTeacher', async (_event, { teacherId }) => {
    const db = await getDb();
    return queryAll(
      db,
      `SELECT sr.*, tmpl.file_name AS template_name, g.name AS group_name,
              ta.school, ta.email
       FROM send_records sr
       JOIN teacher_assignments ta ON ta.id = sr.assignment_id
       LEFT JOIN templates tmpl ON tmpl.id = sr.template_id
       LEFT JOIN groups g ON g.id = sr.group_id
       WHERE ta.teacher_id = ${teacherId}
       ORDER BY sr.generated_at DESC`
    );
  });
}

module.exports = { registerSendHandlers };
