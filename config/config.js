import db from '../database/db.js';

const DEFAULT_CONFIGS = {
  'max-retries': '3',
  'backoff-base': '2'
};

export function get(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  if (row) {
    return row.value;
  }
  return DEFAULT_CONFIGS[key] || null;
}

export function set(key, value) {
  db.prepare(`
    INSERT INTO config (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

export function getAll() {
  const rows = db.prepare('SELECT key, value FROM config').all();
  const configs = { ...DEFAULT_CONFIGS };
  for (const row of rows) {
    configs[row.key] = row.value;
  }
  return configs;
}
