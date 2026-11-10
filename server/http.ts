/** Small helpers built on the standard Request and Response objects, which both Node and Cloudflare Workers provide. */
import type { Db } from './runtime';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export const bad = (message: string, field?: string): HttpError => new HttpError(400, 'invalid', message, field);

export function json(status: number, body: unknown, headers: Record<string, string | string[]> = {}): Response {
  const out = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  for (const [name, value] of Object.entries(headers)) for (const v of Array.isArray(value) ? value : [value]) out.append(name, v);
  return new Response(JSON.stringify(body), { status, headers: out });
}

export const errorResponse = (error: HttpError, extra: Record<string, string> = {}): Response =>
  json(error.status, { error: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) }, extra);

const MAX_BODY = 32 * 1024;

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) throw new HttpError(415, 'unsupported', 'Send JSON.');
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) throw new HttpError(413, 'too_large', 'That request is too large.');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'too_large', 'That request is too large.');
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object');
    return value as Record<string, unknown>;
  } catch {
    throw bad('That request could not be read.');
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* ignore a malformed cookie */
      }
    }
  }
  return out;
}

export function sessionCookie(token: string, maxAgeSeconds: number | null, secure: boolean): string {
  const parts = [`wm_session=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAgeSeconds !== null) parts.push(`Max-Age=${maxAgeSeconds}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

const TOO_MANY = (): HttpError => new HttpError(429, 'rate_limited', 'Too many attempts. Please wait a little and try again.');

/** Cheap fixed-window limiter in memory, for the "too many requests from one address" backstop. (Per server process or Worker instance.) */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMemory(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  if (windows.size > 5000) for (const [k, e] of windows) if (e.resetAt <= now) windows.delete(k);
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count++;
  if (entry.count > limit) throw TOO_MANY();
}

/** Fixed-window limiter kept in the database, so it holds across servers and restarts. Used for logins, sign-ups and emails. */
export async function rateLimit(db: Db, key: string, limit: number, windowMs: number): Promise<void> {
  const now = Date.now();
  const row = await db.get<{ count: number }>(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
       reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
     RETURNING count`,
    key.slice(0, 300), now + windowMs, now, now, now + windowMs,
  );
  if ((row?.count ?? 0) > limit) throw TOO_MANY();
}
