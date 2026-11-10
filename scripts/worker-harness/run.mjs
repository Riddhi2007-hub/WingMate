// Runs the Cloudflare Worker in Node for testing, without Cloudflare: it bundles worker/index.ts, gives it a fake D1
// database (SQLite, with the same strictness about parameter types), the fake sockets and a fake mail server, and
// serves it over HTTP like the Node server does.   node scripts/worker-harness/run.mjs
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { startFakeSmtp } from './fake-smtp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const port = Number(process.env.PORT ?? 3112);
const dataDir = path.resolve(process.env.WINGMATE_DATA_DIR ?? mkdtempSync(path.join(tmpdir(), 'wm-worker-')));
const distDir = path.join(root, 'dist');
mkdirSync(dataDir, { recursive: true });

const bundle = path.join(dataDir, 'worker.bundle.mjs');
await build({
  entryPoints: [path.join(root, 'worker/index.ts')], outfile: bundle, bundle: true, format: 'esm', platform: 'node', logLevel: 'warning',
  plugins: [{ name: 'sockets', setup: (b) => b.onResolve({ filter: /^cloudflare:sockets$/ }, () => ({ path: path.join(here, 'sockets-shim.mjs') })) }],
});
const worker = (await import(pathToFileURL(bundle).href)).default;

// fake D1: same shape as Cloudflare's, and like the real one it refuses undefined/boolean parameters
const sqlite = new DatabaseSync(path.join(dataDir, 'wingmate.db'));
sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
const checked = (params) => { for (const p of params) if (p === undefined || typeof p === 'boolean' || (typeof p === 'number' && !Number.isFinite(p))) throw new Error(`D1_TYPE_ERROR: cannot bind ${String(p)}`); return params; };
const statement = (sql, params = []) => ({
  bind: (...p) => statement(sql, checked(p)),
  all: async () => ({ results: sqlite.prepare(sql).all(...params), success: true, meta: {} }),
  run: async () => { const r = sqlite.prepare(sql).run(...params); return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
});
const DB = {
  prepare: (sql) => statement(sql),
  batch: async (list) => { sqlite.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const ASSETS = { fetch: async (request) => { const p = decodeURIComponent(new URL(request.url).pathname); const f = path.join(distDir, p.endsWith('/') ? p + 'index.html' : p); return existsSync(f) && f.startsWith(distDir) ? new Response(readFileSync(f), { headers: { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' } }) : new Response('Not found', { status: 404 }); } };

let smtp = null;
const env = { DB, ASSETS, ...Object.fromEntries(Object.entries(process.env).filter(([k, v]) => /^(SMTP_|WINGMATE_|PBKDF2_)/.test(k) && v !== undefined)) };
if (process.env.HARNESS_SMTP !== '0') {
  smtp = await startFakeSmtp({ port: port + 1000, dataDir, user: 'mailer', pass: 'secret-pass' });
  Object.assign(env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port + 1000), SMTP_USER: 'mailer', SMTP_PASS: 'secret-pass', SMTP_FROM: 'WingMate <hello@wingmate.test>' });
}
const context = () => { const pending = []; return { pending, waitUntil: (p) => { pending.push(Promise.resolve(p)); } }; };

// like a deployment's cron trigger: run housekeeping at start
{ const ctx = context(); await worker.scheduled({ scheduledTime: Date.now(), cron: '0 * * * *' }, env, ctx); await Promise.all(ctx.pending); }

createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    headers.set('cf-connecting-ip', String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim());
    const body = chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, ...(body ? { body } : {}) });
    const ctx = context();
    const response = await worker.fetch(request, env, ctx);
    await Promise.all(ctx.pending); // let background work (email) finish so tests are deterministic
    const out = {};
    response.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
    const cookies = response.headers.getSetCookie(); if (cookies.length) out['set-cookie'] = cookies;
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { console.error(error); res.writeHead(500); res.end('harness error'); }
}).listen(port, '127.0.0.1', () => console.log(`Worker harness at http://127.0.0.1:${port}/  (data: ${dataDir})`));
process.on('SIGTERM', () => process.exit(0));
