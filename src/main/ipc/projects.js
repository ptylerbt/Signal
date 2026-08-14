const { ipcMain } = require('electron');
const { getDb, saveDb } = require('../db');

function queryAll(db, sql) {
  const results = [];
  const stmt = db.prepare(sql);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function queryOne(db, sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const found = stmt.step();
  const row = found ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function registerProjectHandlers() {
  ipcMain.handle('projects:create', async (_event, { name, description }) => {
    const db = await getDb();
    const stmt = db.prepare('INSERT INTO projects (name, description) VALUES (:name, :description)');
    stmt.run({ ':name': name, ':description': description || null });
    stmt.free();
    const projectId = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
    saveDb();
    return { success: true, projectId };
  });

  ipcMain.handle('projects:list', async () => {
    const db = await getDb();
    return queryAll(
      db,
      `SELECT p.*,
              (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count,
              (SELECT COUNT(*) FROM send_records sr WHERE sr.project_id = p.id) AS send_count
       FROM projects p
       ORDER BY p.created_at DESC`
    );
  });

  ipcMain.handle('projects:get', async (_event, { projectId }) => {
    const db = await getDb();

    const project = queryOne(db, 'SELECT * FROM projects WHERE id = :id', { ':id': projectId });

    const members = queryAll(
      db,
      `SELECT t.id AS teacher_id, t.first_name, t.last_name,
              pps.status,
              (SELECT note_text FROM project_notes pn
                WHERE pn.project_id = ${projectId} AND pn.teacher_id = t.id
                ORDER BY pn.created_at DESC LIMIT 1) AS latest_note,
              (SELECT COUNT(*) FROM send_records sr
                JOIN teacher_assignments ta ON ta.id = sr.assignment_id
                WHERE sr.project_id = ${projectId} AND ta.teacher_id = t.id) AS send_count
       FROM project_members pm
       JOIN teachers t ON t.id = pm.teacher_id
       LEFT JOIN project_person_status pps ON pps.project_id = pm.project_id AND pps.teacher_id = pm.teacher_id
       WHERE pm.project_id = ${projectId}
       ORDER BY t.last_name, t.first_name`
    );

    const sends = queryAll(
      db,
      `SELECT sr.*, t.first_name, t.last_name, ta.school, tmpl.file_name AS template_name
       FROM send_records sr
       JOIN teacher_assignments ta ON ta.id = sr.assignment_id
       JOIN teachers t ON t.id = ta.teacher_id
       LEFT JOIN templates tmpl ON tmpl.id = sr.template_id
       WHERE sr.project_id = ${projectId}
       ORDER BY sr.generated_at DESC`
    );

    return { project, members, sends };
  });

  ipcMain.handle('projects:addPerson', async (_event, { projectId, teacherId }) => {
    const db = await getDb();
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO project_members (project_id, teacher_id) VALUES (:project_id, :teacher_id)'
    );
    stmt.run({ ':project_id': projectId, ':teacher_id': teacherId });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('projects:removePerson', async (_event, { projectId, teacherId }) => {
    const db = await getDb();
    const stmt = db.prepare(
      'DELETE FROM project_members WHERE project_id = :project_id AND teacher_id = :teacher_id'
    );
    stmt.run({ ':project_id': projectId, ':teacher_id': teacherId });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('projects:addNote', async (_event, { projectId, teacherId, noteText }) => {
    const db = await getDb();
    const stmt = db.prepare(
      'INSERT INTO project_notes (project_id, teacher_id, note_text) VALUES (:project_id, :teacher_id, :note_text)'
    );
    stmt.run({ ':project_id': projectId, ':teacher_id': teacherId, ':note_text': noteText });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('projects:getPersonDetail', async (_event, { projectId, teacherId }) => {
    const db = await getDb();

    const notes = queryAll(
      db,
      `SELECT * FROM project_notes
       WHERE project_id = ${projectId} AND teacher_id = ${teacherId}
       ORDER BY created_at DESC`
    );

    const sends = queryAll(
      db,
      `SELECT sr.*, ta.school, tmpl.file_name AS template_name
       FROM send_records sr
       JOIN teacher_assignments ta ON ta.id = sr.assignment_id
       LEFT JOIN templates tmpl ON tmpl.id = sr.template_id
       WHERE sr.project_id = ${projectId} AND ta.teacher_id = ${teacherId}
       ORDER BY sr.generated_at DESC`
    );

    const statusRow = queryOne(
      db,
      'SELECT status FROM project_person_status WHERE project_id = :project_id AND teacher_id = :teacher_id',
      { ':project_id': projectId, ':teacher_id': teacherId }
    );

    return { notes, sends, status: statusRow ? statusRow.status : null };
  });

  ipcMain.handle('projects:setStatus', async (_event, { projectId, teacherId, status }) => {
    const db = await getDb();
    const stmt = db.prepare(`
      INSERT INTO project_person_status (project_id, teacher_id, status, updated_at)
      VALUES (:project_id, :teacher_id, :status, datetime('now'))
      ON CONFLICT(project_id, teacher_id) DO UPDATE SET status = :status, updated_at = datetime('now')
    `);
    stmt.run({ ':project_id': projectId, ':teacher_id': teacherId, ':status': status });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('projects:update', async (_event, { projectId, name, description }) => {
    const db = await getDb();
    const stmt = db.prepare('UPDATE projects SET name = :name, description = :description WHERE id = :id');
    stmt.run({ ':name': name, ':description': description || null, ':id': projectId });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('projects:setProjectStatus', async (_event, { projectId, status }) => {
    const db = await getDb();
    const stmt = db.prepare('UPDATE projects SET status = :status WHERE id = :id');
    stmt.run({ ':status': status, ':id': projectId });
    stmt.free();
    saveDb();
    return { success: true };
  });

  ipcMain.handle('projects:delete', async (_event, { projectId }) => {
    const db = await getDb();

    db.exec(`UPDATE send_records SET project_id = NULL WHERE project_id = ${projectId}`);
    db.exec(`DELETE FROM project_notes WHERE project_id = ${projectId}`);
    db.exec(`DELETE FROM project_person_status WHERE project_id = ${projectId}`);
    db.exec(`DELETE FROM project_members WHERE project_id = ${projectId}`);
    db.exec(`DELETE FROM projects WHERE id = ${projectId}`);

    saveDb();
    return { success: true };
  });
}

module.exports = { registerProjectHandlers };
