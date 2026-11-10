/** What the API code needs from the place it runs. The Node server and the Cloudflare Worker each provide one. */
import type { Settings } from './settings';

export type SqlParam = string | number | null;
export interface Statement {
  sql: string;
  params: SqlParam[];
}
export const stmt = (sql: string, ...params: SqlParam[]): Statement => ({ sql, params });

export interface Db {
  all<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, ...params: SqlParam[]): Promise<T | undefined>;
  run(sql: string, ...params: SqlParam[]): Promise<{ changes: number; id: number }>;
  /** Runs the statements together: all of them happen or none. */
  batch(statements: Statement[]): Promise<void>;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Runtime {
  db: Db;
  settings: Settings;
  hashPassword(password: string): Promise<string>;
  /** `stored` is undefined when the email is unknown; the work is still done so timing does not give that away. */
  verifyPassword(password: string, stored: string | undefined): Promise<boolean>;
  /** Sends in the background; never throws. */
  sendMail(mail: Mail): void;
  /** The airline name if `folder` is one of the themes, otherwise null. */
  brand(folder: string): Promise<string | null>;
}
