import { createServer, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { handleApi } from './api';
import { config } from './config';
import { HttpError, send } from './http';
import { runJobs } from './jobs';

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
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'content-security-policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
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

runJobs();
setInterval(() => {
  try {
    runJobs();
  } catch (error) {
    console.error('Housekeeping failed:', error);
  }
}, 3_600_000).unref();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const work = url.pathname.startsWith('/api/') ? handleApi(req, res, url) : req.method === 'GET' || req.method === 'HEAD' ? serveStatic(url.pathname, res) : Promise.reject(new HttpError(405, 'method', 'Not allowed.'));
  work.catch((error: unknown) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (error instanceof HttpError) {
      send(res, error.status, { error: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) }, SECURITY_HEADERS);
      return;
    }
    console.error(error);
    send(res, 500, { error: 'server', message: 'Something went wrong on our side. Please try again.' });
  });
});

server.listen(config.port, config.host, () => {
  console.log(`WingMate is running at http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/`);
  console.log(`  data: ${config.dataDir}   front end: ${config.publicDir}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
