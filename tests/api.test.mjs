import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Usage:  node tests/api.test.mjs            tests the Node server (after npm run build)
//         TARGET=worker node tests/api.test.mjs   tests the Cloudflare Worker code in the local harness
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.env.TARGET ?? 'node';
const dir = mkdtempSync(path.join(tmpdir(), 'wm-'));
const PORT = 3111, BASE = `http://127.0.0.1:${PORT}`;
let server;
const results = [];
const ok = (name, cond, extra='') => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); };
async function start(env = {}) {
  const entry = TARGET === 'worker' ? path.join(root, 'scripts/worker-harness/run.mjs') : path.join(root, 'server-dist/server.mjs');
  server = spawn('node', [entry], { cwd: root, env: { ...process.env, PORT: String(PORT), WINGMATE_DATA_DIR: dir, WINGMATE_TRUST_PROXY: '1', HARNESS_SMTP: TARGET === 'worker' ? '1' : '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', (d) => { const t = String(d); if (!t.includes('ExperimentalWarning') && !t.includes('--trace-warnings')) process.stderr.write(t); });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); }
  throw new Error('server did not start');
}
const stop = () => new Promise(r => { server.once('exit', r); server.kill('SIGTERM'); });
let ipn = 1;
class Client {
  cookie = ''; ip = `10.0.${Math.floor(ipn / 250)}.${ipn++ % 250 + 1}`;
  async call(method, url, body, headers = {}) {
    const res = await fetch(BASE + url, { method, headers: { 'x-forwarded-for': this.ip, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), cookie: this.cookie, ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0].startsWith('wm_session=;') || /Max-Age=0/.test(set) ? '' : set.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json, headers: res.headers };
  }
}
const soon = (h, base = Date.now()) => base + h * 3600e3;
const dateStr = (ms) => new Date(ms).toISOString().slice(0, 10);
const rawSignup = (c, n, over = {}) => c.call('POST', '/api/signup', { first: n, last: 'Test', email: `${n.toLowerCase()}@example.com`, countryCode: '+852', phone: '91234567', dob: '1999-04-02', password: 'Wing#Mate24', terms: true, ...over });
// the server prints emails to data/outbox when no SMTP is set: read the newest link for an address
const lastLink = (to, page) => { const f = path.join(dir, 'outbox', 'outbox.txt'); if (!existsSync(f)) return null; const blocks = readFileSync(f, 'utf8').split('=== ').filter((b) => b.includes(`To: ${to}\n`) && b.includes(`/${page}.html#token=`)); const m = blocks.length ? /#token=([\w-]+)/.exec(blocks[blocks.length - 1]) : null; return m ? m[1] : null; };
// sign up, confirm the email, log in
const signup = async (c, n, over = {}) => {
  const r = await rawSignup(c, n, over);
  if (r.status !== 201) return r;
  const email = (over.email ?? `${n.toLowerCase()}@example.com`);
  const token = lastLink(email, 'verify');
  await c.call('POST', '/api/verify', { token });
  const l = await c.call('POST', '/api/login', { email, password: over.password ?? 'Wing#Mate24', remember: true });
  return { ...l, status: l.status === 200 ? 201 : l.status };
};
const flightBody = (over = {}) => { const d = soon(48); return { number: 'd7 543', date: dateStr(d), from: 'kul', to: 'hnd', departsAt: d, landsAt: d + 7 * 3600e3, ...over }; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

try {
  await start();
  const a = new Client(), b = new Client(), anon = new Client();
  ok('anonymous sync is 401', (await anon.call('GET', '/api/sync')).status === 401);
  ok('cross-site POST refused', (await anon.call('POST', '/api/login', { email: 'x@y.co', password: 'x' }, { origin: 'http://evil.example' })).status === 403);
  ok('non-JSON POST refused', (await fetch(BASE + '/api/login', { method: 'POST', body: 'x', headers: { 'content-type': 'text/plain' } })).status === 415);
  // signup rules
  let r = await signup(new Client(), 'Kid', { dob: new Date(Date.now() - 15 * 365.25 * 864e5).toISOString().slice(0, 10) });
  ok('under 16 rejected by the server', r.status === 400 && r.json.field === 'dob', JSON.stringify(r.json));
  r = await signup(new Client(), 'Weak', { password: 'short' }); ok('short password rejected', r.status === 400 && r.json.field === 'pw');
  r = await signup(new Client(), 'NoTerms', { terms: false }); ok('terms required', r.status === 400 && r.json.field === 'terms');
  r = await signup(a, 'Alice'); ok('signup ok + cookie', r.status === 201 && a.cookie.startsWith('wm_session='));
  ok('cookie is HttpOnly + SameSite', /HttpOnly/.test(r.headers.get('set-cookie')) && /SameSite=Lax/.test(r.headers.get('set-cookie')));
  r = await signup(new Client(), 'Alice'); ok('duplicate email -> 409', r.status === 409 && r.json.field === 'email');
  r = await signup(b, 'Bob'); ok('second user signup', r.status === 201);
  // email verification + password reset
  { const v = new Client();
    r = await rawSignup(v, 'Vera'); ok('signup returns verify, no session', r.status === 201 && r.json.verify === true && v.cookie === '');
    ok('verification email was sent', !!lastLink('vera@example.com', 'verify'));
    r = await v.call('POST', '/api/login', { email: 'vera@example.com', password: 'Wing#Mate24' }); ok('unverified cannot log in', r.status === 403 && r.json.error === 'email_not_verified');
    r = await v.call('POST', '/api/login', { email: 'vera@example.com', password: 'wrong-password' }); ok('wrong password still 401 (no leak)', r.status === 401);
    r = await v.call('POST', '/api/verify', { token: 'x'.repeat(43) }); ok('bad verify token rejected', r.status === 400);
    r = await v.call('POST', '/api/verify/resend', { email: 'vera@example.com' }); ok('resend ok', r.status === 200);
    const t = lastLink('vera@example.com', 'verify');
    r = await v.call('POST', '/api/verify', { token: t }); ok('verify works', r.status === 200);
    r = await v.call('POST', '/api/verify', { token: t }); ok('verify token is single use', r.status === 400);
    r = await v.call('POST', '/api/login', { email: 'vera@example.com', password: 'Wing#Mate24' }); ok('can log in after verifying', r.status === 200);
    const s1 = v.cookie;
    r = await v.call('POST', '/api/forgot', { email: 'nobody@example.com' }); ok('forgot: unknown email same answer', r.status === 200 && r.json.ok === true);
    r = await v.call('POST', '/api/forgot', { email: 'vera@example.com' }); ok('forgot ok', r.status === 200);
    const rt = lastLink('vera@example.com', 'reset'); ok('reset email sent', !!rt);
    r = await v.call('POST', '/api/reset', { token: rt, password: 'short' }); ok('reset enforces password rules', r.status === 400);
    r = await v.call('POST', '/api/reset', { token: rt, password: 'Brand#New99' }); ok('reset works', r.status === 200, JSON.stringify(r.json));
    r = await v.call('POST', '/api/reset', { token: rt, password: 'Another#One1' }); ok('reset token single use', r.status === 400);
    const old = new Client(); old.cookie = s1; r = await old.call('GET', '/api/sync'); ok('reset logs out old sessions', r.status === 401);
    r = await v.call('POST', '/api/login', { email: 'vera@example.com', password: 'Wing#Mate24' }); ok('old password no longer works', r.status === 401);
    r = await v.call('POST', '/api/login', { email: 'vera@example.com', password: 'Brand#New99' }); ok('new password works', r.status === 200);
    const f1 = await v.call('POST', '/api/forgot', { email: 'vera@example.com' }); const f2 = await v.call('POST', '/api/forgot', { email: 'vera@example.com' }); const f3 = await v.call('POST', '/api/forgot', { email: 'vera@example.com' });
    ok('forgot is rate limited per email', f3.status === 429, String(f3.status));
    const un = new Client(); await rawSignup(un, 'Ursula'); const tu = lastLink('ursula@example.com', 'verify');
    await un.call('POST', '/api/forgot', { email: 'ursula@example.com' }); const ru = lastLink('ursula@example.com', 'reset');
    await un.call('POST', '/api/reset', { token: ru, password: 'Reset#Pass77' });
    r = await un.call('POST', '/api/login', { email: 'ursula@example.com', password: 'Reset#Pass77' }); ok('reset link also confirms the email', r.status === 200);
  }
  // login
  const l = new Client();
  r = await l.call('POST', '/api/login', { email: 'alice@example.com', password: 'wrong' }); ok('wrong password -> 401, generic message', r.status === 401 && /incorrect/.test(r.json.message));
  r = await l.call('POST', '/api/login', { email: 'nobody@example.com', password: 'wrong' }); ok('unknown email -> same 401', r.status === 401 && /incorrect/.test(r.json.message));
  r = await l.call('POST', '/api/login', { email: 'ALICE@example.com', password: 'Wing#Mate24', remember: false }); ok('login ok (case-insensitive email)', r.status === 200);
  ok('no Max-Age without remember me', !/Max-Age/.test(r.headers.get('set-cookie')));
  r = await l.call('POST', '/api/login', { email: 'alice@example.com', password: 'Wing#Mate24', remember: true }); ok('remember me -> persistent cookie', /Max-Age=\d{6,}/.test(r.headers.get('set-cookie')));
  // initial sync: no flight, no people
  r = await a.call('GET', '/api/sync'); ok('sync works; no flight => no people', r.status === 200 && r.json.flight === null && r.json.people.length === 0 && r.json.me.first === 'Alice');
  ok('own email visible only to self, no phone/dob leaked', !('phone' in r.json.me) && !('dob' in r.json.me) && !r.json.me.pw_hash);
  // flight validation
  r = await a.call('PUT', '/api/flight', flightBody({ number: 'nonsense' })); ok('bad flight number rejected', r.status === 400 && r.json.field === 'number');
  r = await a.call('PUT', '/api/flight', flightBody({ to: 'kul' })); ok('same airports rejected', r.status === 400);
  r = await a.call('PUT', '/api/flight', flightBody({ landsAt: soon(48) - 1000 })); ok('arrival before departure rejected', r.status === 400);
  r = await a.call('PUT', '/api/flight', flightBody()); ok('Alice sets flight', r.status === 200);
  r = await a.call('GET', '/api/sync');
  ok('flight normalised (D7 543, KUL->HND)', r.json.flight.number === 'D7 543' && r.json.flight.from === 'KUL' && r.json.flight.to === 'HND');
  ok('real users with no flight are not shown to her', !r.json.people.some(p => p.name.startsWith('Bob')));
  // Bob joins the same flight, with different times (the first record wins)
  const fb = flightBody(); r = await b.call('PUT', '/api/flight', { ...fb, landsAt: fb.landsAt + 5 * 3600e3 });
  ok('Bob joins same flight', r.status === 200);
  r = await a.call('GET', '/api/sync'); const bob = r.json.people.find(p => p.name === 'Bob T.');
  ok('Alice sees Bob (name shortened) with his preferences', bob && bob.interests.length > 0 && !bob.demo && !('email' in bob), JSON.stringify(bob));
  const bobSync = await b.call('GET', '/api/sync'); ok('flight times are shared (first record wins)', bobSync.json.flight.landsAt === r.json.flight.landsAt && bobSync.json.flight.landsAt !== fb.landsAt + 5 * 3600e3);
  // preferences + criteria + visibility
  r = await b.call('PUT', '/api/prefs', { prefs: { type: 'Business', why: 'meet', pers: 'Extrovert', interests: ['Tech & startups'], awake: 'Mostly awake', seat: 'Aisle' } }); ok('prefs saved', r.status === 200);
  r = await b.call('PUT', '/api/prefs', { prefs: { type: 'Nope', why: 'meet', pers: 'Extrovert', interests: ['Tech & startups'], awake: 'Mostly awake', seat: 'Aisle' } }); ok('invalid pref rejected', r.status === 400);
  r = await b.call('PUT', '/api/prefs', { prefs: { type: 'Business', why: 'meet', pers: 'Extrovert', interests: [], awake: 'Mostly awake', seat: 'Aisle' } }); ok('no interests rejected', r.status === 400);
  r = await a.call('GET', '/api/sync'); const bob2 = r.json.people.find(p => p.name === 'Bob T.'); ok('Alice sees Bob\'s new prefs', bob2.type === 'Business' && bob2.seat === 'Aisle');
  r = await b.call('PUT', '/api/visible', { visible: false }); ok('Bob hides himself', r.status === 200);
  r = await a.call('GET', '/api/sync'); ok('hidden Bob disappears from Alice\'s list', !r.json.people.some(p => p.name === 'Bob T.'));
  r = await b.call('GET', '/api/sync'); ok('hidden Bob sees no one (reciprocity)', r.json.people.length === 0);
  r = await a.call('POST', '/api/connections', { to: bob.id }); ok('cannot request a hidden person', r.status === 404);
  await b.call('PUT', '/api/visible', { visible: true });
  // connection flow
  r = await a.call('POST', '/api/connections', { to: bob.id }); ok('Alice requests Bob', r.status === 200 && r.json.conn === 'requested');
  r = await b.call('GET', '/api/sync'); const alice = r.json.people.find(p => p.name === 'Alice T.'); ok('Bob sees an incoming request', alice && alice.conn === 'incoming');
  r = await a.call('POST', '/api/messages', { to: bob.id, text: 'hi' }); ok('cannot message before accepted', r.status === 403);
  r = await b.call('POST', '/api/connections/respond', { from: alice.id, accept: true }); ok('Bob accepts', r.status === 200);
  r = await a.call('GET', '/api/sync'); ok('Alice now connected, chat window open (pre-flight)', r.json.people.find(p => p.id === bob.id).conn === 'connected' && r.json.people.find(p => p.id === bob.id).window.stage === 'pre');
  // messaging
  r = await a.call('POST', '/api/messages', { to: bob.id, text: 'Hello Bob <b>x</b>' }); ok('Alice sends a message', r.status === 201);
  r = await a.call('POST', '/api/messages', { to: bob.id, text: '' }); ok('empty message rejected', r.status === 400);
  r = await a.call('POST', '/api/messages', { to: bob.id, text: 'x'.repeat(1001) }); ok('over-long message rejected', r.status === 400);
  r = await b.call('GET', '/api/sync?after=0'); const msg = r.json.messages[0]; ok('Bob receives it, unread, text stored as-is', msg && msg.from === 'them' && msg.read === false && msg.text === 'Hello Bob <b>x</b>');
  const cur = r.json.cursor; r = await b.call('GET', `/api/sync?after=${cur}`); ok('cursor returns only new messages', r.json.messages.length === 0);
  await b.call('POST', '/api/read', { with: alice.id }); r = await b.call('GET', '/api/sync?after=0'); ok('mark read works', r.json.messages[0].read === true);
  // strangers cannot message
  const c = new Client(); await signup(c, 'Carol'); r = await c.call('POST', '/api/messages', { to: bob.id, text: 'hey' }); ok('stranger cannot message', r.status === 403);
  // block
  r = await a.call('POST', '/api/block', { userId: bob.id }); ok('Alice blocks Bob', r.status === 200);
  r = await a.call('GET', '/api/sync'); ok('blocked Bob gone for Alice', !r.json.people.some(p => p.id === bob.id));
  r = await b.call('GET', '/api/sync'); ok('and Alice gone for Bob, chat deleted', !r.json.people.some(p => p.name === 'Alice T.') && r.json.messages.length === 0);
  r = await b.call('POST', '/api/messages', { to: alice.id, text: 'still there?' }); ok('blocked user cannot message', r.status === 403);
  r = await a.call('POST', '/api/report', { userId: bob.id, reason: 'test report' }); ok('report stored', r.status === 200);
  // profile + flyer
  r = await a.call('PUT', '/api/profile', { first: 'Alicia', last: 'Test', bio: 'Hello there', saveData: true, flyer: { num: 'AB12 345', tier: 'Gold' } }); ok('profile saved', r.status === 200);
  r = await a.call('GET', '/api/sync'); ok('flyer saved & returned', r.json.me.first === 'Alicia' && r.json.me.flyer.tier === 'Gold' && r.json.me.bio === 'Hello there');
  r = await a.call('PUT', '/api/profile', { first: 'Alicia', saveData: true, flyer: { num: '<script>', tier: 'Gold' } }); ok('bad membership number rejected', r.status === 400);
  r = await a.call('DELETE', '/api/flyer'); r = await a.call('GET', '/api/sync'); ok('Delete my saved data clears flyer', r.json.me.flyer === null && r.json.me.saveData === false);
  // chat window: past flight => closed
  const d = soon(-80); const past = { number: 'AI 111', date: dateStr(d), from: 'DEL', to: 'HND', departsAt: d, landsAt: d + 8 * 3600e3 };
  const p1 = new Client(), p2 = new Client(); await signup(p1, 'Past1'); await signup(p2, 'Past2');
  await p1.call('PUT', '/api/flight', past); await p2.call('PUT', '/api/flight', past);
  r = await p1.call('GET', '/api/sync'); const pp = r.json.people.find(p => p.name === 'Past2 T.');
  await p1.call('POST', '/api/connections', { to: pp.id }); r = await p2.call('GET', '/api/sync'); await p2.call('POST', '/api/connections/respond', { from: r.json.people.find(p => p.name === 'Past1 T.').id, accept: true });
  r = await p1.call('GET', '/api/sync'); const w = r.json.people.find(p => p.id === pp.id).window; ok('past flight: window closed', w.closed && w.stage === 'closed');
  r = await p1.call('POST', '/api/messages', { to: pp.id, text: 'late' }); ok('server refuses messages after the 48 hours', r.status === 403 && r.json.error === 'chat_closed');
  // landed (open) window
  const d2 = soon(-12); const landed = { number: 'AI 222', date: dateStr(d2), from: 'DEL', to: 'HND', departsAt: d2, landsAt: d2 + 8 * 3600e3 };
  const q1 = new Client(), q2 = new Client(); await signup(q1, 'Land1'); await signup(q2, 'Land2'); await q1.call('PUT', '/api/flight', landed); await q2.call('PUT', '/api/flight', landed);
  r = await q1.call('GET', '/api/sync'); const lp = r.json.people.find(p => p.name === 'Land2 T.'); await q1.call('POST', '/api/connections', { to: lp.id });
  r = await q2.call('GET', '/api/sync'); await q2.call('POST', '/api/connections/respond', { from: r.json.people.find(p => p.name === 'Land1 T.').id, accept: true });
  r = await q1.call('GET', '/api/sync'); const lw = r.json.people.find(p => p.id === lp.id).window; ok('landed 4h ago: stage landed, closes in ~44h', lw.stage === 'landed' && Math.abs(lw.closesAt - (landed.landsAt + 48 * 3600e3)) < 1000);
  r = await q1.call('POST', '/api/messages', { to: lp.id, text: 'landed!' }); ok('messages allowed within the 48 hours', r.status === 201);
  // logout
  r = await a.call('POST', '/api/logout'); ok('logout clears session', (await a.call('GET', '/api/sync')).status === 401);
  // rate limit on login
  const rl = new Client(); let last; for (let i = 0; i < 10; i++) last = await rl.call('POST', '/api/login', { email: 'ratelimit@example.com', password: 'x' }); ok('login rate-limited after repeated failures', last.status === 429);
  // static + headers
  const st = await fetch(BASE + '/airasia/login.html');
  if (TARGET === 'worker') { // on Cloudflare the headers for pages come from dist/_headers, applied by Cloudflare itself
    const h = readFileSync(path.join(root, 'dist/_headers'), 'utf8');
    ok('page headers are defined for Cloudflare (_headers)', st.status === 200 && /frame-ancestors/.test(h) && /nosniff/.test(h));
  } else ok('serves the front end with security headers', st.status === 200 && /frame-ancestors/.test(st.headers.get('content-security-policy')) && st.headers.get('x-content-type-options') === 'nosniff');
  ok('path traversal blocked', (await fetch(BASE + '/..%2f..%2fetc/passwd')).status >= 400);
  ok('unknown API route -> 404 JSON', (await fetch(BASE + '/api/nope')).status === 404);
  // account deletion
  const z = new Client(); await signup(z, 'Zed'); r = await z.call('DELETE', '/api/account', { password: 'nope' }); ok('delete account needs the right password', r.status === 403);
  r = await z.call('DELETE', '/api/account', { password: 'Wing#Mate24' }); ok('account deleted', r.status === 200 && (await new Client().call('POST', '/api/login', { email: 'zed@example.com', password: 'Wing#Mate24' })).status === 401);
  // retention job: backdate a user's last flight 4 months, restart server
  const db = new DatabaseSync(path.join(dir, 'wingmate.db'));
  await stop();
  db.prepare("UPDATE users SET flyer_num='ZZ9999', flyer_tier='Silver', last_flight_at=? WHERE email='carol@example.com'").run(Date.now() - 125 * 864e5);
  db.prepare("UPDATE users SET flyer_num='RESET12', flyer_tier='Silver', last_flight_at=? WHERE email='land1@example.com'").run(Date.now() - 125 * 864e5);
  db.prepare("UPDATE users SET flyer_num='KEEP1234', flyer_tier='Silver', last_flight_at=? WHERE email='land2@example.com'").run(Date.now() - 10 * 864e5);
  db.close(); await start();
  const l1 = new Client(); await l1.call('POST', '/api/login', { email: 'carol@example.com', password: 'Wing#Mate24' }); r = await l1.call('GET', '/api/sync');
  ok('3-month rule: flyer details deleted after no flight for 4 months', r.json.me.flyer === null);
  const l3 = new Client(); await l3.call('POST', '/api/login', { email: 'land1@example.com', password: 'Wing#Mate24' }); r = await l3.call('GET', '/api/sync');
  ok('3-month rule: having flown recently resets the clock', r.json.me.flyer?.num === 'RESET12');
  const l2 = new Client(); await l2.call('POST', '/api/login', { email: 'land2@example.com', password: 'Wing#Mate24' }); r = await l2.call('GET', '/api/sync');
  ok('3-month rule: recent flyer keeps details', r.json.me.flyer?.num === 'KEEP1234');
  // layovers: more than one flight per person
  {
    const x = new Client(), y = new Client(), z = new Client();
    await signup(x, 'Lena'); await signup(y, 'Yuri'); await signup(z, 'Zed');
    const d1 = soon(100), d2 = soon(112);
    const leg1 = { number: 'AK 111', date: dateStr(d1), from: 'CCU', to: 'KUL', departsAt: d1, landsAt: d1 + 4 * 3600e3 };
    const leg2 = { number: 'AK 222', date: dateStr(d2), from: 'KUL', to: 'HKG', departsAt: d2, landsAt: d2 + 4 * 3600e3 };
    ok('Lena adds leg 1', (await x.call('PUT', '/api/flight', leg1)).status === 200);
    ok('Lena adds leg 2', (await x.call('PUT', '/api/flight', leg2)).status === 200);
    await y.call('PUT', '/api/flight', leg1);   // Yuri is only on the first leg
    await z.call('PUT', '/api/flight', leg2);   // Zed is only on the second leg
    r = await x.call('GET', '/api/sync');
    ok('two flights listed, earliest first', r.json.flights.length === 2 && r.json.flights[0].number === 'AK 111' && r.json.flights[1].number === 'AK 222');
    const yuri = r.json.people.find(p => p.name === 'Yuri T.'), zed = r.json.people.find(p => p.name === 'Zed T.');
    ok('Lena sees people from both flights', !!yuri && !!zed);
    ok('each person is labelled with the shared flight', yuri.flights.length === 1 && yuri.flights[0].number === 'AK 111' && zed.flights.length === 1 && zed.flights[0].number === 'AK 222');
    r = await y.call('GET', '/api/sync'); ok('Yuri (one flight) sees Lena on that flight only', r.json.people.length === 1 && r.json.people[0].flights[0].number === 'AK 111' && !r.json.people.some(p => p.name === 'Zed T.'));
    const lena = r.json.people[0];
    r = await y.call('POST', '/api/connections', { to: lena.id, flightKey: 'AK 222|' + dateStr(d2) }); ok('connect on a flight you do not share still works (uses the shared one)', r.status === 200);
    await x.call('POST', '/api/connections/respond', { from: (await x.call('GET', '/api/sync')).json.people.find(p => p.name === 'Yuri T.').id, accept: true });
    r = await x.call('GET', '/api/sync'); const yc = r.json.people.find(p => p.name === 'Yuri T.');
    ok('connected person keeps the flight label', yc.conn === 'connected' && yc.flights[0].number === 'AK 111' && yc.window && !yc.window.closed);
    ok('5th flight refused', await (async () => { for (let i = 0; i < 3; i++) { const d = soon(200 + i * 5); await x.call('PUT', '/api/flight', { number: 'AK 30' + i, date: dateStr(d), from: 'HKG', to: 'KUL', departsAt: d, landsAt: d + 4 * 3600e3 }); } const d = soon(300); return (await x.call('PUT', '/api/flight', { number: 'AK 399', date: dateStr(d), from: 'HKG', to: 'KUL', departsAt: d, landsAt: d + 4 * 3600e3 })).status === 400; })());
    r = await x.call('DELETE', '/api/flight?key=' + encodeURIComponent('AK 222|' + dateStr(d2))); ok('remove one flight', r.status === 200);
    r = await x.call('GET', '/api/sync'); ok('the other flights stay', r.json.flights.length === 3 && !r.json.flights.some(f => f.number === 'AK 222'));
    ok('Zed no longer shown to Lena after the shared flight is removed', !r.json.people.some(p => p.name === 'Zed T.'));
    r = await x.call('DELETE', '/api/flight'); r = await x.call('GET', '/api/sync'); ok('remove all flights', r.json.flights.length === 0 && r.json.flight === null);
  }
} finally {
  try { await stop(); } catch {}
  rmSync(dir, { recursive: true, force: true });
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
