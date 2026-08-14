const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { app } = require('electron');

let SQL;
let db;
let dbPath;

async function getDb() {
  if (db) return db;

  SQL = await initSqlJs();

  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  dbPath = path.join(dataDir, 'signal.db');

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  runMigrations();
  saveDb();

  return db;
}

function tableColumns(tableName) {
  const columns = [];
  const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
  while (stmt.step()) columns.push(stmt.getAsObject().name);
  stmt.free();
  return columns;
}

function runMigrations() {
  if (!tableColumns('teachers').includes('default_assignment_id')) {
    db.exec('ALTER TABLE teachers ADD COLUMN default_assignment_id INTEGER REFERENCES teacher_assignments(id)');
  }

  if (!tableColumns('send_records').includes('project_id')) {
    db.exec('ALTER TABLE send_records ADD COLUMN project_id INTEGER REFERENCES projects(id)');
  }
}

function saveDb() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function getDbPath() {
  return dbPath;
}

async function reloadDb() {
  db = null;
  return getDb();
}

module.exports = { getDb, saveDb, getDbPath, reloadDb };
