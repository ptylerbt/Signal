const { ipcMain, shell } = require('electron');
const { getDb, saveDb } = require('../db');

function registerMailHandlers() {
  ipcMain.handle('mail:openMailto', async (_event, { url, sendRecords }) => {
    await shell.openExternal(url);

    if (sendRecords && sendRecords.length > 0) {
      const db = await getDb();
      const now = new Date().toISOString();
      const insert = db.prepare(`
        INSERT INTO send_records
          (assignment_id, template_id, group_id, project_id, recipient_field, generated_at, opened_at, status)
        VALUES
          (:assignment_id, :template_id, :group_id, :project_id, :recipient_field, :generated_at, :opened_at, :status)
      `);
      const addMember = db.prepare(`
        INSERT OR IGNORE INTO project_members (project_id, teacher_id)
        SELECT :project_id, teacher_id FROM teacher_assignments WHERE id = :assignment_id
      `);

      for (const record of sendRecords) {
        insert.run({
          ':assignment_id': record.assignmentId,
          ':template_id': record.templateId ?? null,
          ':group_id': record.groupId ?? null,
          ':project_id': record.projectId ?? null,
          ':recipient_field': record.recipientField || 'to',
          ':generated_at': now,
          ':opened_at': now,
          ':status': 'opened_in_mail_client',
        });

        if (record.projectId) {
          addMember.run({ ':project_id': record.projectId, ':assignment_id': record.assignmentId });
        }
      }
      insert.free();
      addMember.free();
      saveDb();
    }

    return { success: true };
  });
}

module.exports = { registerMailHandlers };
