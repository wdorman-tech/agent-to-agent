import * as fs from 'node:fs';
import * as path from 'node:path';
import Database, { type Database as DB } from 'better-sqlite3';
import { CURRENT_SCHEMA_VERSION, SCHEMA_SQL } from './schema.js';

export type { DB };

export function openDb(dbPath: string): DB {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function migrate(db: DB): void {
  db.exec(SCHEMA_SQL);
  const row = db.prepare('SELECT value FROM schema_meta WHERE key = ?').get('version') as
    | { value: string }
    | undefined;
  if (!row) {
    db.prepare('INSERT INTO schema_meta(key, value) VALUES (?, ?)').run(
      'version',
      CURRENT_SCHEMA_VERSION,
    );
  } else if (row.value !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `database schema version ${row.value} does not match expected ${CURRENT_SCHEMA_VERSION}; upgrade not implemented yet`,
    );
  }
}

export function closeDb(db: DB): void {
  db.close();
}
