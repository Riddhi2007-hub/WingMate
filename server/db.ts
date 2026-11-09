import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { config } from './config';

mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(path.join(config.dataDir, 'wingmate.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  first TEXT NOT NULL,
  last TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  dob TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  p_type TEXT NOT NULL,
  p_why TEXT NOT NULL,
  p_pers TEXT NOT NULL,
  p_interests TEXT NOT NULL,
  p_awake TEXT NOT NULL,
  p_seat TEXT NOT NULL,
  criteria TEXT NOT NULL,
  save_data INTEGER NOT NULL DEFAULT 1,
  flyer_num TEXT,
  flyer_tier TEXT,
  last_flight_at INTEGER NOT NULL,
  flight_key TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS users_flight ON users(flight_key);

CREATE TABLE IF NOT EXISTS flights (
  key TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  from_code TEXT NOT NULL,
  to_code TEXT NOT NULL,
  departs_at INTEGER NOT NULL,
  lands_at INTEGER NOT NULL,
  created_by INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('requested','connected','declined')),
  flight_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS conn_from ON connections(from_id);
CREATE INDEX IF NOT EXISTS conn_to ON connections(to_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS msg_to ON messages(to_id, id);
CREATE INDEX IF NOT EXISTS msg_from ON messages(from_id, id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('verify','reset')),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reported_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

// Upgrades for databases created by earlier versions.
{
  const columns = (db.prepare('PRAGMA table_info(users)').all() as unknown as Array<{ name: string }>).map((c) => c.name);
  if (!columns.includes('email_verified')) {
    // accounts that already exist were created before verification existed: treat them as verified
    db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0; UPDATE users SET email_verified = 1;');
  }
  // sample guests were removed: delete any left in an old database (their chats and requests go with them)
  if (columns.includes('is_demo')) db.exec('DELETE FROM users WHERE is_demo = 1;');
}

export type Row = Record<string, string | number | null | Uint8Array | bigint>;

/** Small typed helpers over node:sqlite so route code stays short. */
export const all = <T = Row>(sql: string, ...params: SQLInputValue[]): T[] => db.prepare(sql).all(...params) as unknown as T[];
export const get = <T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined => db.prepare(sql).get(...params) as unknown as T | undefined;
export const run = (sql: string, ...params: SQLInputValue[]): { changes: number; id: number } => {
  const r = db.prepare(sql).run(...params);
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
};

/** Runs fn inside one transaction (all changes or none). */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
