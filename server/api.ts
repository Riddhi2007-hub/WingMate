import type { IncomingMessage, ServerResponse } from 'node:http';
import { PREF_KEYS, type PrefKey } from '../src/ts/dashboard/options';
import type { Prefs } from '../src/ts/dashboard/types';
import { chatWindow, type ChatWindow } from '../src/ts/shared/stage';
import { consumeToken, createSession, createToken, destroyAllSessions, destroySession, hashPassword, userIdForToken, verifyPassword } from './auth';
import { sendMail } from './mailer';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { all, get, run, tx } from './db';
import { HttpError, bad, clearCookie, clientIp, parseCookies, rateLimit, readJson, send, sessionCookie } from './http';
import * as v from './validate';

interface UserRow {
  id: number;
  email: string;
  email_verified: number;
  pw_hash: string;
  first: string;
  last: string;
  phone: string;
  dob: string;
  bio: string;
  visible: number;
  p_type: string;
  p_why: string;
  p_pers: string;
  p_interests: string;
  p_awake: string;
  p_seat: string;
  criteria: string;
  save_data: number;
  flyer_num: string | null;
  flyer_tier: string | null;
  last_flight_at: number;
  flight_key: string | null;
}

interface FlightRow {
  key: string;
  number: string;
  from_code: string;
  to_code: string;
  departs_at: number;
  lands_at: number;
}

interface ConnRow {
  id: number;
  from_id: number;
  to_id: number;
  status: 'requested' | 'connected' | 'declined';
  flight_key: string;
}

type Conn = 'requested' | 'incoming' | 'connected';

const userPrefs = (u: UserRow): Prefs => ({
  type: u.p_type as Prefs['type'],
  why: u.p_why as Prefs['why'],
  pers: u.p_pers as Prefs['pers'],
  interests: JSON.parse(u.p_interests) as Prefs['interests'],
  awake: u.p_awake as Prefs['awake'],
  seat: u.p_seat as Prefs['seat'],
});

const displayName = (u: UserRow): string => (u.last ? `${u.first} ${u.last.charAt(0).toUpperCase()}.` : u.first);

const flightDto = (f: FlightRow | undefined) =>
  f ? { key: f.key, number: f.number, from: f.from_code, to: f.to_code, departsAt: f.departs_at, landsAt: f.lands_at } : null;

const getUser = (id: number): UserRow | undefined => get<UserRow>('SELECT * FROM users WHERE id = ?', id);
const getFlight = (key: string | null): FlightRow | undefined => (key ? get<FlightRow>('SELECT * FROM flights WHERE key = ?', key) : undefined);

const isBlocked = (a: number, b: number): boolean =>
  !!get('SELECT 1 AS x FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', a, b, b, a);

const pairConnection = (a: number, b: number): ConnRow | undefined =>
  get<ConnRow>('SELECT * FROM connections WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', a, b, b, a);

function connState(me: number, row: ConnRow | undefined): Conn | undefined {
  if (!row) return undefined;
  if (row.status === 'connected') return 'connected';
  if (row.from_id === me) return 'requested';
  return row.status === 'requested' ? 'incoming' : undefined;
}

// ---------------------------------------------------------------- what the browser gets

function meDto(u: UserRow) {
  return {
    first: u.first,
    last: u.last,
    email: u.email,
    bio: u.bio,
    visible: !!u.visible,
    prefs: userPrefs(u),
    criteria: JSON.parse(u.criteria) as Record<PrefKey, boolean>,
    saveData: !!u.save_data,
    flyer: u.flyer_num !== null ? { num: u.flyer_num, tier: u.flyer_tier ?? 'Green' } : null,
    lastFlightAt: u.last_flight_at,
  };
}

function peopleFor(me: UserRow, now: number) {
  const myFlight = getFlight(me.flight_key);
  const ids = new Map<number, UserRow>();
  const notBlocked = (u: UserRow): boolean => !isBlocked(me.id, u.id);

  // people on the same flight (only while I am open to connect myself)
  if (me.visible && me.flight_key) {
    const sameFlight = all<UserRow>(
      `SELECT * FROM users WHERE id != ? AND visible = 1 AND flight_key = ?`,
      me.id, me.flight_key,
    );
    for (const u of sameFlight) if (notBlocked(u)) ids.set(u.id, u);
  }
  // anyone I have a connection or an open request with, even from an earlier flight
  const related = all<UserRow>(
    `SELECT u.* FROM users u JOIN connections c ON (c.from_id = u.id AND c.to_id = ?) OR (c.to_id = u.id AND c.from_id = ?)
     WHERE u.id != ? AND (c.status = 'connected' OR c.from_id = ? OR (c.to_id = ? AND c.status = 'requested'))`,
    me.id, me.id, me.id, me.id, me.id,
  );
  for (const u of related) if (notBlocked(u)) ids.set(u.id, u);

  void myFlight;
  return [...ids.values()].map((u) => {
    const row = pairConnection(me.id, u.id);
    const conn = connState(me.id, row);
    const window: ChatWindow | undefined = conn === 'connected' && row ? windowFor(row, now) : undefined;
    return {
      id: String(u.id),
      name: displayName(u),
      bio: u.bio,
      av: u.id % 6,
      ...userPrefs(u),
      ...(conn ? { conn } : {}),
      ...(window ? { window } : {}),
    };
  });
}

function windowFor(row: ConnRow, now: number): ChatWindow {
  const f = getFlight(row.flight_key);
  // a connection always has a flight; if it was somehow removed, treat the chat as closed
  if (!f) return { stage: 'closed', closed: true, closesAt: null };
  return chatWindow({ departsAt: f.departs_at, landsAt: f.lands_at }, now);
}

function messagesFor(me: number, after: number) {
  const rows = all<{ id: number; from_id: number; to_id: number; text: string; created_at: number; read_at: number | null }>(
    `SELECT * FROM (SELECT * FROM messages WHERE (from_id = ? OR to_id = ?) AND id > ? ORDER BY id DESC LIMIT 500) ORDER BY id ASC`,
    me, me, after,
  );
  return rows.map((m) => ({
    id: m.id,
    with: String(m.from_id === me ? m.to_id : m.from_id),
    from: m.from_id === me ? ('me' as const) : ('them' as const),
    text: m.text,
    t: m.created_at,
    read: m.from_id === me || m.read_at !== null,
  }));
}

function syncPayload(me: UserRow, after: number) {
  const now = Date.now();
  const messages = messagesFor(me.id, after);
  return {
    now,
    me: meDto(me),
    flight: flightDto(getFlight(me.flight_key)),
    people: peopleFor(me, now),
    messages,
    cursor: messages.length ? Math.max(...messages.map((m) => m.id)) : after,
  };
}

// ---------------------------------------------------------------- handlers

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  user: UserRow | null;
  token: string | undefined;
  query: URLSearchParams;
  ip: string;
}

type Handler = (ctx: Ctx) => Promise<void> | void;

const requireUser = (ctx: Ctx): UserRow => {
  if (!ctx.user) throw new HttpError(401, 'unauthenticated', 'Please log in.');
  return ctx.user;
};

const newUserPrefs: Prefs = { type: 'Leisure', why: 'travel', pers: 'Ambivert', interests: ['Food & dining', 'Photography', 'Culture & museums'], awake: 'No preference', seat: 'Window' };
const defaultCriteria = (): Record<PrefKey, boolean> => Object.fromEntries(PREF_KEYS.map((k) => [k, true])) as Record<PrefKey, boolean>;


// ---------------------------------------------------------------- email links

/** Which airline theme the person is on (the folder name in the page address), so the link in the email comes back to the same pages. */
function brandFolder(value: unknown): string {
  const name = typeof value === 'string' ? value : '';
  return /^[a-z0-9-]{1,30}$/.test(name) && existsSync(path.join(config.publicDir, name)) ? name : '';
}

function airlineName(folder: string): string {
  try {
    const raw = JSON.parse(readFileSync(path.join(config.publicDir, '..', 'brands', folder, 'brand.json'), 'utf8')) as { airline?: unknown };
    if (typeof raw.airline === 'string') return raw.airline;
  } catch {
    /* fall through */
  }
  return 'WingMate';
}

const pageUrl = (folder: string, page: string, token: string): string => `${config.publicUrl}/${folder ? `${folder}/` : ''}${page}.html#token=${token}`;

function sendVerification(user: UserRow, folder: string): void {
  const token = createToken(user.id, 'verify', config.verifyHours * 3_600_000);
  sendMail({
    to: user.email,
    subject: 'Confirm your email for WingMate',
    text: `Hi ${user.first},\n\nThanks for signing up to WingMate${folder ? ` with ${airlineName(folder)}` : ''}. Please confirm your email address:\n\n${pageUrl(folder, 'verify', token)}\n\nThis link works for ${config.verifyHours} hours. If you did not sign up, you can ignore this email and nothing will happen.\n\nWingMate`,
  });
}

function sendReset(user: UserRow, folder: string): void {
  const token = createToken(user.id, 'reset', config.resetMinutes * 60_000);
  sendMail({
    to: user.email,
    subject: 'Reset your WingMate password',
    text: `Hi ${user.first},\n\nWe received a request to reset your WingMate password. Choose a new one here:\n\n${pageUrl(folder, 'reset', token)}\n\nThis link works for ${config.resetMinutes} minutes and can be used once. If you did not ask for this, ignore this email; your password has not changed.\n\nWingMate`,
  });
}

const routes: Record<string, Handler> = {
  'GET /api/health': ({ res }) => send(res, 200, { ok: true }),

  async 'POST /api/signup'({ req, res, ip }) {
    rateLimit(`signup:${ip}`, 10, 3_600_000);
    const b = await readJson(req);
    const first = v.str(b.first, 'first', 1, 60);
    const last = v.str(b.last, 'last', 1, 60);
    const mail = v.email(b.email);
    const phone = v.phone(`${typeof b.countryCode === 'string' ? b.countryCode : ''}${typeof b.phone === 'string' ? b.phone : ''}`);
    const dob = v.dateOfBirth(b.dob);
    const pw = v.password(b.password);
    if (b.terms !== true) throw bad('Please accept the Terms of Use and Privacy Policy.', 'terms');
    if (get('SELECT 1 AS x FROM users WHERE email = ?', mail)) throw new HttpError(409, 'email_taken', 'An account with this email already exists. Try logging in.', 'email');
    const hash = await hashPassword(pw);
    const now = Date.now();
    const id = run(
      `INSERT INTO users (email, pw_hash, first, last, phone, dob, created_at, p_type, p_why, p_pers, p_interests, p_awake, p_seat, criteria, last_flight_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mail, hash, first, last, phone, dob, now, newUserPrefs.type, newUserPrefs.why, newUserPrefs.pers, JSON.stringify(newUserPrefs.interests), newUserPrefs.awake, newUserPrefs.seat, JSON.stringify(defaultCriteria()), now,
    ).id;
    const created = get<UserRow>('SELECT * FROM users WHERE id = ?', id);
    if (created) sendVerification(created, brandFolder(b.brand));
    // no session yet: the person has to confirm their email address first
    send(res, 201, { ok: true, verify: true });
  },

  async 'POST /api/verify'({ req, res, ip }) {
    rateLimit(`verify:${ip}`, 30, 3_600_000);
    const b = await readJson(req);
    const userId = consumeToken(typeof b.token === 'string' ? b.token : '', 'verify');
    if (userId === null) throw new HttpError(400, 'bad_token', 'This link has expired or was already used. Log in to get a new one.');
    run('UPDATE users SET email_verified = 1 WHERE id = ?', userId);
    send(res, 200, { ok: true });
  },

  async 'POST /api/verify/resend'({ req, res, ip }) {
    rateLimit(`resend:${ip}`, 10, 3_600_000);
    const b = await readJson(req);
    const mail = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    rateLimit(`resend-email:${mail}`, 3, 3_600_000);
    const user = get<UserRow>('SELECT * FROM users WHERE email = ?', mail);
    if (user && !user.email_verified) sendVerification(user, brandFolder(b.brand));
    send(res, 200, { ok: true }); // same answer whether or not the address has an account
  },

  async 'POST /api/forgot'({ req, res, ip }) {
    rateLimit(`forgot:${ip}`, 10, 3_600_000);
    const b = await readJson(req);
    const mail = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    rateLimit(`forgot-email:${mail}`, 3, 3_600_000);
    const user = get<UserRow>('SELECT * FROM users WHERE email = ?', mail);
    if (user) sendReset(user, brandFolder(b.brand));
    send(res, 200, { ok: true }); // same answer whether or not the address has an account
  },

  async 'POST /api/reset'({ req, res, ip }) {
    rateLimit(`reset:${ip}`, 20, 3_600_000);
    const b = await readJson(req);
    const pw = v.password(b.password);
    const userId = consumeToken(typeof b.token === 'string' ? b.token : '', 'reset');
    if (userId === null) throw new HttpError(400, 'bad_token', 'This link has expired or was already used. Ask for a new one.');
    // using the emailed link also proves they own the address
    run('UPDATE users SET pw_hash = ?, email_verified = 1 WHERE id = ?', await hashPassword(pw), userId);
    destroyAllSessions(userId); // anyone logged in with the old password is logged out
    send(res, 200, { ok: true });
  },

  async 'POST /api/login'({ req, res, ip }) {
    rateLimit(`login-ip:${ip}`, 30, 15 * 60_000);
    const b = await readJson(req);
    const mail = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const pw = typeof b.password === 'string' ? b.password : '';
    rateLimit(`login-email:${mail}`, 8, 15 * 60_000);
    const user = get<UserRow>('SELECT * FROM users WHERE email = ?', mail);
    const ok = await verifyPassword(pw, user?.pw_hash);
    if (!user || !ok) throw new HttpError(401, 'bad_credentials', 'The email address or password is incorrect. Please try again.');
    if (!user.email_verified) throw new HttpError(403, 'email_not_verified', 'Please confirm your email address first. We sent you a link when you signed up.');
    const session = createSession(user.id, b.remember === true);
    send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(session.token, session.maxAge) });
  },

  'POST /api/logout'({ res, token }) {
    destroySession(token);
    send(res, 200, { ok: true }, { 'set-cookie': clearCookie() });
  },

  'GET /api/sync'(ctx) {
    const me = requireUser(ctx);
    const after = Math.max(0, Math.floor(Number(ctx.query.get('after') ?? 0)) || 0);
    send(ctx.res, 200, syncPayload(me, after));
  },

  async 'PUT /api/prefs'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.req);
    const p = v.prefs(b.prefs);
    run('UPDATE users SET p_type=?, p_why=?, p_pers=?, p_interests=?, p_awake=?, p_seat=? WHERE id=?', p.type, p.why, p.pers, JSON.stringify(p.interests), p.awake, p.seat, me.id);
    send(ctx.res, 200, { ok: true });
  },

  async 'PUT /api/criteria'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.req);
    run('UPDATE users SET criteria = ? WHERE id = ?', JSON.stringify(v.criteria(b.criteria)), me.id);
    send(ctx.res, 200, { ok: true });
  },

  async 'PUT /api/visible'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.req);
    if (typeof b.visible !== 'boolean') throw bad('Send true or false.');
    run('UPDATE users SET visible = ? WHERE id = ?', b.visible ? 1 : 0, me.id);
    send(ctx.res, 200, { ok: true });
  },

  async 'PUT /api/profile'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.req);
    const first = v.str(b.first, 'first', 1, 60);
    const last = v.optionalStr(b.last, 'last', 60);
    const bio = v.optionalStr(b.bio, 'bio', 160);
    const saveData = b.saveData !== false;
    let num: string | null = null;
    let tier: string | null = null;
    if (saveData && b.flyer && typeof b.flyer === 'object') {
      const f = b.flyer as Record<string, unknown>;
      num = v.optionalStr(f.num, 'ffNum', 20);
      if (num && !/^[A-Za-z0-9 -]{4,20}$/.test(num)) throw bad('Enter a valid membership number.', 'ffNum');
      tier = v.tier(f.tier);
      if (!num) {
        num = null;
        tier = null;
      }
    }
    run('UPDATE users SET first=?, last=?, bio=?, save_data=?, flyer_num=?, flyer_tier=? WHERE id=?', first, last, bio, saveData ? 1 : 0, num, tier, me.id);
    send(ctx.res, 200, { ok: true });
  },

  'DELETE /api/flyer'(ctx) {
    const me = requireUser(ctx);
    run('UPDATE users SET flyer_num = NULL, flyer_tier = NULL, save_data = 0 WHERE id = ?', me.id);
    send(ctx.res, 200, { ok: true });
  },

  async 'PUT /api/flight'(ctx) {
    const me = requireUser(ctx);
    const input = v.flight(await readJson(ctx.req));
    const key = `${input.number}|${input.date}`;
    tx(() => {
      // The first person to enter a flight sets its times; everyone after joins the same record.
      // (In production these come from the airline's schedule, not from users.)
      if (!getFlight(key)) {
        run('INSERT INTO flights (key, number, from_code, to_code, departs_at, lands_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', key, input.number, input.from, input.to, input.departsAt, input.landsAt, me.id, Date.now());
      }
      run('UPDATE users SET flight_key = ? WHERE id = ?', key, me.id);
    });
    send(ctx.res, 200, { ok: true });
  },

  'DELETE /api/flight'(ctx) {
    const me = requireUser(ctx);
    run('UPDATE users SET flight_key = NULL WHERE id = ?', me.id);
    send(ctx.res, 200, { ok: true });
  },

  async 'POST /api/connections'(ctx) {
    const me = requireUser(ctx);
    rateLimit(`connect:${me.id}`, 40, 3_600_000);
    const b = await readJson(ctx.req);
    const target = getUser(Number(b.to));
    if (!target || target.id === me.id || !me.flight_key || !me.visible) throw new HttpError(404, 'not_found', 'That person is not available.');
    const sameFlight = target.flight_key === me.flight_key;
    const existing = pairConnection(me.id, target.id);
    if (isBlocked(me.id, target.id) || !(sameFlight || existing) || (!target.visible && !existing)) throw new HttpError(404, 'not_found', 'That person is not available.');

    const now = Date.now();
    let accepted = false;
    tx(() => {
      if (!existing) {
        run("INSERT INTO connections (from_id, to_id, status, flight_key, created_at, updated_at) VALUES (?, ?, 'requested', ?, ?, ?)", me.id, target.id, me.flight_key, now, now);
      } else if (existing.status === 'requested' && existing.to_id === me.id) {
        run("UPDATE connections SET status = 'connected', updated_at = ? WHERE id = ?", now, existing.id); // they asked first: it is mutual
        accepted = true;
      } else if (existing.status === 'declined' && existing.to_id === me.id) {
        run("UPDATE connections SET from_id = ?, to_id = ?, status = 'requested', flight_key = ?, updated_at = ? WHERE id = ?", me.id, target.id, me.flight_key, now, existing.id);
      }
      // declined (by them) or already requested/connected: nothing changes, and nothing is revealed
    });
    send(ctx.res, 200, { ok: true, conn: accepted ? 'connected' : 'requested' });
  },

  async 'POST /api/connections/respond'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.req);
    const from = Number(b.from);
    const row = get<ConnRow>("SELECT * FROM connections WHERE from_id = ? AND to_id = ? AND status = 'requested'", from, me.id);
    if (!row || isBlocked(me.id, from)) throw new HttpError(404, 'not_found', 'That request is no longer there.');
    run('UPDATE connections SET status = ?, updated_at = ? WHERE id = ?', b.accept === true ? 'connected' : 'declined', Date.now(), row.id);
    send(ctx.res, 200, { ok: true });
  },

  async 'POST /api/messages'(ctx) {
    const me = requireUser(ctx);
    rateLimit(`msg:${me.id}`, 40, 60_000);
    const b = await readJson(ctx.req);
    const to = Number(b.to);
    const text = v.str(b.text, 'text', 1, 1000);
    const row = pairConnection(me.id, to);
    if (!row || row.status !== 'connected' || isBlocked(me.id, to)) throw new HttpError(403, 'not_connected', 'You can only message people you are connected with.');
    if (windowFor(row, Date.now()).closed) throw new HttpError(403, 'chat_closed', 'This chat closed 48 hours after landing.');
    const id = run('INSERT INTO messages (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)', me.id, to, text, Date.now()).id;
    send(ctx.res, 201, { ok: true, id });
  },

  async 'POST /api/read'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.req);
    run('UPDATE messages SET read_at = ? WHERE to_id = ? AND from_id = ? AND read_at IS NULL', Date.now(), me.id, Number(b.with));
    send(ctx.res, 200, { ok: true });
  },

  async 'POST /api/block'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.req);
    const target = getUser(Number(b.userId));
    if (!target || target.id === me.id) throw new HttpError(404, 'not_found', 'That person is not available.');
    tx(() => {
      run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', me.id, target.id, Date.now());
      run('DELETE FROM connections WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', me.id, target.id, target.id, me.id);
      run('DELETE FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', me.id, target.id, target.id, me.id);
    });
    send(ctx.res, 200, { ok: true });
  },

  async 'POST /api/report'(ctx) {
    const me = requireUser(ctx);
    rateLimit(`report:${me.id}`, 10, 3_600_000);
    const b = await readJson(ctx.req);
    const target = getUser(Number(b.userId));
    if (!target || target.id === me.id) throw new HttpError(404, 'not_found', 'That person is not available.');
    const reason = v.str(b.reason, 'reason', 3, 500);
    run('INSERT INTO reports (reporter_id, reported_id, reason, created_at) VALUES (?, ?, ?, ?)', me.id, target.id, reason, Date.now());
    send(ctx.res, 200, { ok: true });
  },

  async 'DELETE /api/account'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.req);
    if (!(await verifyPassword(typeof b.password === 'string' ? b.password : '', me.pw_hash))) throw new HttpError(403, 'bad_credentials', 'That password is not correct.', 'password');
    run('DELETE FROM users WHERE id = ?', me.id);
    send(ctx.res, 200, { ok: true }, { 'set-cookie': clearCookie() });
  },
};

// ---------------------------------------------------------------- entry point used by main.ts

export async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const method = req.method ?? 'GET';
  const handler = routes[`${method} ${url.pathname}`];
  if (!handler) {
    const known = Object.keys(routes).some((k) => k.endsWith(` ${url.pathname}`));
    throw new HttpError(known ? 405 : 404, known ? 'method' : 'not_found', known ? 'That method is not allowed.' : 'Not found.');
  }
  // Only same-origin pages may change anything (a simple CSRF guard on top of SameSite cookies).
  if (method !== 'GET') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'forbidden', 'Cross-site requests are not allowed.');
  }
  const ip = clientIp(req);
  rateLimit(`ip:${ip}`, 600, 60_000);
  const token = parseCookies(req.headers.cookie).wm_session;
  const userId = userIdForToken(token);
  const user = userId ? (getUser(userId) ?? null) : null;
  await handler({ req, res, user, token, query: url.searchParams, ip });
}
