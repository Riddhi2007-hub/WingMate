import type { Db, SqlParam, Statement } from '../server/runtime';
import { SCHEMA } from '../server/schema';

/** Wraps a D1 database in the shared Db interface. */
export function d1(database: D1Database): Db {
  const bound = (sql: string, params: SqlParam[]): D1PreparedStatement => database.prepare(sql).bind(...params);
  return {
    all: async <T>(sql: string, ...params: SqlParam[]) => (await bound(sql, params).all<T>()).results,
    // .all() rather than .first(): it also works for statements that end in RETURNING
    get: async <T>(sql: string, ...params: SqlParam[]) => (await bound(sql, params).all<T>()).results[0],
    run: async (sql: string, ...params: SqlParam[]) => {
      const result = await bound(sql, params).run();
      return { changes: result.meta.changes ?? 0, id: result.meta.last_row_id ?? 0 };
    },
    // D1 runs a batch as one transaction
    batch: async (statements: Statement[]) => {
      if (statements.length) await database.batch(statements.map((s) => bound(s.sql, s.params)));
    },
  };
}

let ready: Promise<void> | undefined;

/** Creates the tables the first time (and is a single quick check afterwards). The tables are created together, so if the last one exists they all do. */
export function ensureSchema(database: D1Database): Promise<void> {
  ready ??= (async () => {
    const found = await database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rate_limits'").all();
    if (found.results.length) return;
    await database.batch(SCHEMA.map((sql) => database.prepare(sql)));
  })().catch((error: unknown) => {
    ready = undefined; // try again on the next request
    throw error;
  });
  return ready;
}
