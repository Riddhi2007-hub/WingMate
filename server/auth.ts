/** Sessions and one-time email tokens. Uses Web Crypto, which Node and Cloudflare Workers both have. */
import type { Db } from './runtime';
import type { Settings } from './settings';
import type { UserRow } from './rows';

const encoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const randomToken = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

export async function tokenHash(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface Session {
  token: string;
  /** Seconds, or null for a browser-session cookie. */
  maxAge: number | null;
}

export async function createSession(db: Db, s: Settings, userId: number, remember: boolean): Promise<Session> {
  const token = randomToken();
  const now = Date.now();
  const lifetimeMs = remember ? s.sessionDays * 86_400_000 : 24 * 3_600_000;
  await db.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', await tokenHash(token), userId, now, now + lifetimeMs);
  return { token, maxAge: remember ? s.sessionDays * 86_400 : null };
}

/** The person a session cookie belongs to, in one query. */
export async function userForToken(db: Db, token: string | undefined): Promise<UserRow | null> {
  if (!token) return null;
  const row = await db.get<UserRow>(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
    await tokenHash(token), Date.now(),
  );
  return row ?? null;
}

export async function destroySession(db: Db, token: string | undefined): Promise<void> {
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', await tokenHash(token));
}

export const destroyAllSessions = (db: Db, userId: number): Promise<unknown> => db.run('DELETE FROM sessions WHERE user_id = ?', userId);

export type TokenKind = 'verify' | 'reset';

/** Creates a token and returns the secret to put in the email. Only its hash is stored. */
export async function createToken(db: Db, userId: number, kind: TokenKind, ttlMs: number): Promise<string> {
  const token = randomToken();
  await db.batch([
    { sql: 'DELETE FROM tokens WHERE user_id = ? AND kind = ?', params: [userId, kind] }, // a newer link replaces the older one
    { sql: 'INSERT INTO tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)', params: [await tokenHash(token), userId, kind, Date.now() + ttlMs] },
  ]);
  return token;
}

/** Uses up a token: returns the user it belongs to, or null if it is unknown, used or expired. Single use even if two requests race. */
export async function consumeToken(db: Db, token: string, kind: TokenKind): Promise<number | null> {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const row = await db.get<{ user_id: number; expires_at: number }>(
    'DELETE FROM tokens WHERE token_hash = ? AND kind = ? RETURNING user_id, expires_at',
    await tokenHash(token), kind,
  );
  return row && row.expires_at > Date.now() ? row.user_id : null;
}
