import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(__dirname, '../data');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.resolve(dbDir, 'queuectl.db');

const db = new Database(dbPath);

// Enable WAL mode to allow concurrent reads and writes
db.pragma('journal_mode = WAL');

// Execute migrations to create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    priority INTEGER DEFAULT 0,
    run_at TEXT,
    timeout INTEGER,
    error_message TEXT,
    output TEXT,
    started_at TEXT,
    duration_ms INTEGER,
    locked_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workers (
    pid INTEGER PRIMARY KEY,
    status TEXT NOT NULL,
    last_heartbeat TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    stdout TEXT,
    stderr TEXT,
    exit_code INTEGER,
    duration_ms INTEGER,
    created_at TEXT NOT NULL
  );
`);

// Safe migration in case database already exists
try {
  db.exec('ALTER TABLE jobs ADD COLUMN locked_by INTEGER;');
} catch (e) {
  // column already exists
}

export default db;
