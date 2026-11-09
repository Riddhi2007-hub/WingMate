import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config';
import { get, run } from './db';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** A hash to compare against when the email is unknown, so timing does not reveal which emails exist. */
const DUMMY = `scrypt$${randomBytes(16).toString('base64')}$${scryptSync('dummy', randomBytes(16), KEYLEN).toString('base64')}`;

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const [scheme, saltB64, hashB64] = (stored && stored.startsWith('scrypt$') ? stored : DUMMY).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected) && stored !== undefined && stored.startsWith('scrypt$');
}

const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface Session {
  token: string;
  /** Seconds, or null for a browser-session cookie. */
  maxAge: number | null;
}

export function createSession(userId: number, remember: boolean): Session {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const lifetimeMs = remember ? config.sessionDays * 86_400_000 : 24 * 3_600_000;
  run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', tokenHash(token), userId, now, now + lifetimeMs);
  return { token, maxAge: remember ? config.sessionDays * 86_400 : null };
}

export function userIdForToken(token: string | undefined): number | null {
  if (!token) return null;
  const row = get<{ user_id: number; expires_at: number }>('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', tokenHash(token));
  if (!row || row.expires_at <= Date.now()) return null;
  return row.user_id;
}

export function destroySession(token: string | undefined): void {
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', tokenHash(token));
}

/* ---------- one-time tokens (email verification, password reset) ---------- */

export type TokenKind = 'verify' | 'reset';

/** Creates a token and returns the secret to put in the email. Only its hash is stored. */
export function createToken(userId: number, kind: TokenKind, ttlMs: number): string {
  const token = randomBytes(32).toString('base64url');
  run('DELETE FROM tokens WHERE user_id = ? AND kind = ?', userId, kind); // a newer link replaces the older one
  run('INSERT INTO tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)', tokenHash(token), userId, kind, Date.now() + ttlMs);
  return token;
}

/** Uses up a token: returns the user it belongs to, or null if it is unknown, used or expired. */
export function consumeToken(token: string, kind: TokenKind): number | null {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const row = get<{ user_id: number; expires_at: number }>('SELECT user_id, expires_at FROM tokens WHERE token_hash = ? AND kind = ?', tokenHash(token), kind);
  if (!row) return null;
  run('DELETE FROM tokens WHERE token_hash = ?', tokenHash(token));
  return row.expires_at > Date.now() ? row.user_id : null;
}

export function destroyAllSessions(userId: number): void {
  run('DELETE FROM sessions WHERE user_id = ?', userId);
}
