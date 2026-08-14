const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const { getDb, saveDb, getDbPath, reloadDb } = require('../db');

function registerBackupHandlers() {
  ipcMain.handle('backup:export', async () => {
    await getDb();
    saveDb();

    const defaultName = `signal-backup-${new Date().toISOString().slice(0, 10)}.db`;
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Backup',
      defaultPath: defaultName,
      filters: [{ name: 'Signal Backup', extensions: ['db'] }],
    });

    if (canceled || !filePath) return { canceled: true };

    fs.copyFileSync(getDbPath(), filePath);
    return { canceled: false, filePath };
  });

  ipcMain.handle('backup:restore', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Restore from Backup',
      properties: ['openFile'],
      filters: [{ name: 'Signal Backup', extensions: ['db'] }],
    });

    if (canceled || filePaths.length === 0) return { canceled: true };

    await getDb();
    saveDb();

    fs.copyFileSync(filePaths[0], getDbPath());
    await reloadDb();

    return { canceled: false };
  });
}

module.exports = { registerBackupHandlers };
