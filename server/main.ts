import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { handleApi } from './api';
import { config } from './config';
import { HttpError, errorResponse } from './http';
import { runJobs } from './jobs';
import { openDatabase } from './node/db';
import { makeSendMail } from './node/mailer';
import { hashPassword, verifyPassword } from './node/password';
import type { Runtime } from './runtime';
import securityHeaders from './security-headers.json';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Pages carry their own CSS and scripts inline, so the policy allows inline code from this site only.
const SECURITY_HEADERS: Record<string, string> = securityHeaders;

const db = openDatabase(config.dataDir);
const settings = config.settings;

const runtime: Runtime = {
  db,
  settings,
  hashPassword,
  verifyPassword,
  sendMail: makeSendMail(settings, config.dataDir),
  async brand(folder) {
    if (!existsSync(path.join(config.publicDir, folder))) return null;
    try {
      const raw = JSON.parse(readFileSync(path.join(config.publicDir, '..', 'brands', folder, 'brand.json'), 'utf8')) as { airline?: unknown };
      if (typeof raw.airline === 'string') return raw.airline;
    } catch {
      /* fall through */
    }
    return 'WingMate';
  },
};

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(config.publicDir, rel));
  if (file !== config.publicDir && !file.startsWith(config.publicDir + path.sep)) throw new HttpError(403, 'forbidden', 'Not allowed.');
  try {
    if ((await stat(file)).isDirectory()) {
      res.writeHead(302, { location: `${pathname.replace(/\/$/, '')}/login.html` });
      res.end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache', ...SECURITY_HEADERS });
    res.end(body);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(404, 'not_found', 'Not found.');
  }
}

const MAX_BODY = 64 * 1024;

async function toRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else headers.set(name, value);
  }
  const method = req.method ?? 'GET';
  let body: Buffer | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) throw new HttpError(413, 'too_large', 'That request is too large.');
      chunks.push(chunk as Buffer);
    }
    body = Buffer.concat(chunks);
  }
  // the address is built from the Host header, so the same-origin check compares like with like
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, { method, headers, ...(body ? { body } : {}) });
}

function clientIp(req: IncomingMessage): string {
  if (settings.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

async function writeResponse(res: ServerResponse, response: Response, extra: Record<string, string> = {}): Promise<void> {
  const headers: Record<string, string | string[]> = { ...extra };
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') headers[name] = value;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers['set-cookie'] = cookies;
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    await writeResponse(res, await handleApi(await toRequest(req), runtime, clientIp(req)));
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(url.pathname, res);
  throw new HttpError(405, 'method', 'Not allowed.');
}

async function housekeeping(): Promise<void> {
  try {
    await runJobs(db, settings);
  } catch (error) {
    console.error('Housekeeping failed:', error);
  }
}

await housekeeping();
setInterval(() => void housekeeping(), 3_600_000).unref();

const server = createServer((req, res) => {
  handle(req, res).catch(async (error: unknown) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (error instanceof HttpError) {
      await writeResponse(res, errorResponse(error), SECURITY_HEADERS);
      return;
    }
    console.error(error);
    await writeResponse(res, new Response(JSON.stringify({ error: 'server', message: 'Something went wrong on our side. Please try again.' }), { status: 500, headers: { 'content-type': 'application/json' } }));
  });
});

server.listen(config.port, config.host, () => {
  console.log(`WingMate is running at http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/`);
  console.log(`  data: ${config.dataDir}   front end: ${config.publicDir}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
