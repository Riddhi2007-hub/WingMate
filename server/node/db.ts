import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Db, Statement } from '../runtime';
import { SCHEMA } from '../schema';

/** Opens (and creates or upgrades) the SQLite file and wraps it in the shared Db interface. */
export function openDatabase(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true });
  const sqlite = new DatabaseSync(path.join(dataDir, 'wingmate.db'));
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  for (const statement of SCHEMA) sqlite.exec(statement);

  // Upgrades for databases created by earlier versions.
  const columns = (sqlite.prepare('PRAGMA table_info(users)').all() as unknown as Array<{ name: string }>).map((c) => c.name);
  if (!columns.includes('email_verified')) {
    // accounts that already exist were created before verification existed: treat them as verified
    sqlite.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0; UPDATE users SET email_verified = 1;');
  }
  // sample guests were removed: delete any left in an old database (their chats and requests go with them)
  if (columns.includes('is_demo')) sqlite.exec('DELETE FROM users WHERE is_demo = 1;');

  const bind = (params: unknown[]): SQLInputValue[] => params as SQLInputValue[];
  return {
    all: async <T>(sql: string, ...params: SQLInputValue[]) => sqlite.prepare(sql).all(...bind(params)) as unknown as T[],
    get: async <T>(sql: string, ...params: SQLInputValue[]) => sqlite.prepare(sql).get(...bind(params)) as unknown as T | undefined,
    run: async (sql: string, ...params: SQLInputValue[]) => {
      const r = sqlite.prepare(sql).run(...bind(params));
      return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
    },
    batch: async (statements: Statement[]) => {
      // synchronous from BEGIN to COMMIT, so nothing else can run in between
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        for (const s of statements) sqlite.prepare(s.sql).run(...bind(s.params));
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
