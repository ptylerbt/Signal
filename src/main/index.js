const { app, BrowserWindow } = require('electron');
const path = require('path');
const { getDb } = require('./db');
const { registerRosterHandlers } = require('./ipc/roster');
const { registerTemplateHandlers } = require('./ipc/templates');
const { registerGroupHandlers } = require('./ipc/groups');
const { registerMailHandlers } = require('./ipc/mail');
const { registerSendHandlers } = require('./ipc/sends');
const { registerBackupHandlers } = require('./ipc/backup');
const { registerProjectHandlers } = require('./ipc/projects');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(async () => {
  await getDb();
  registerRosterHandlers();
  registerTemplateHandlers();
  registerGroupHandlers();
  registerMailHandlers();
  registerSendHandlers();
  registerBackupHandlers();
  registerProjectHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
