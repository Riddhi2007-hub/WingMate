import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config';

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

export function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(text);
}

const MAX_BODY = 32 * 1024;

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'unsupported', 'Send JSON.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'too_large', 'That request is too large.');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object');
    return value as Record<string, unknown>;
  } catch {
    throw bad('That request could not be read.');
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token: string, maxAgeSeconds: number | null): string {
  const parts = [`wm_session=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAgeSeconds !== null) parts.push(`Max-Age=${maxAgeSeconds}`);
  if (config.secureCookies) parts.push('Secure');
  return parts.join('; ');
}

export const clearCookie = (): string => sessionCookie('', 0);

export function clientIp(req: IncomingMessage): string {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** Fixed-window rate limiter kept in memory (fine for one server process). */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count++;
  if (entry.count > limit) throw new HttpError(429, 'rate_limited', 'Too many attempts. Please wait a little and try again.');
}

export function sweepRateLimits(): void {
  const now = Date.now();
  for (const [key, entry] of windows) if (entry.resetAt <= now) windows.delete(key);
}
