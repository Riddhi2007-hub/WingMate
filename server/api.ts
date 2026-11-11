/**
 * The WingMate API. It runs unchanged on the Node server and on Cloudflare Workers: it takes a standard Request and a
 * Runtime (database, settings, password hashing, email) and returns a standard Response.
 */
import { PREF_KEYS, type PrefKey } from '../src/ts/dashboard/options';
import type { Prefs } from '../src/ts/dashboard/types';
import { chatWindow, type ChatWindow } from '../src/ts/shared/stage';
import { consumeToken, createSession, createToken, destroyAllSessions, destroySession, userForToken } from './auth';
import { HttpError, bad, errorResponse, json, parseCookies, rateLimit, rateLimitMemory, readJson, sessionCookie } from './http';
import type { ConnRow, FlightRow, UserRow } from './rows';
import type { Db, Runtime } from './runtime';
import { stmt } from './runtime';
import * as v from './validate';
import { KINDS, applyMove, gameDto, hangmanWord, initialState, startClock, type GameRow, type Kind } from './games';

type Conn = 'requested' | 'incoming' | 'connected';

const userPrefs = (u: UserRow): Prefs => ({
  type: u.p_type as Prefs['type'],
  why: u.p_why as Prefs['why'],
  pers: u.p_pers as Prefs['pers'],
  interests: JSON.parse(u.p_interests) as Prefs['interests'],
  seat: u.p_seat as Prefs['seat'],
});

const displayName = (u: UserRow): string => (u.last ? `${u.first} ${u.last.charAt(0).toUpperCase()}.` : u.first);

const flightDto = (f: FlightRow | undefined) =>
  f ? { key: f.key, number: f.number, from: f.from_code, to: f.to_code, departsAt: f.departs_at, landsAt: f.lands_at } : null;

const getUser = (db: Db, id: number): Promise<UserRow | undefined> => db.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
const getFlight = async (db: Db, key: string | null): Promise<FlightRow | undefined> => (key ? db.get<FlightRow>('SELECT * FROM flights WHERE key = ?', key) : undefined);

const MAX_FLIGHTS = 4;
/** users.flight_key mirrors the earliest of a person's flights (kept so older data and tools still make sense). */
const SET_FIRST_FLIGHT =
  'UPDATE users SET flight_key = (SELECT uf.flight_key FROM user_flights uf JOIN flights f ON f.key = uf.flight_key WHERE uf.user_id = users.id ORDER BY f.departs_at LIMIT 1) WHERE id = ?';
const myFlights = (db: Db, userId: number): Promise<FlightRow[]> =>
  db.all<FlightRow>('SELECT f.* FROM flights f JOIN user_flights uf ON uf.flight_key = f.key WHERE uf.user_id = ? ORDER BY f.departs_at', userId);

/** Flights both people are on. */
const sharedFlights = (db: Db, a: number, b: number): Promise<FlightRow[]> =>
  db.all<FlightRow>(
    'SELECT f.* FROM flights f JOIN user_flights x ON x.flight_key = f.key AND x.user_id = ? JOIN user_flights y ON y.flight_key = f.key AND y.user_id = ? ORDER BY f.departs_at',
    a, b,
  );

/** A chat stays open until 48 hours after the last flight the two share (or the one it was started on) has landed. */
async function chatFlight(db: Db, a: number, b: number, conn: ConnRow): Promise<FlightRow | undefined> {
  const all = await sharedFlights(db, a, b);
  const started = await getFlight(db, conn.flight_key);
  if (started && !all.some((f) => f.key === started.key)) all.push(started);
  return all.sort((x, y) => y.lands_at - x.lands_at)[0];
}

const isBlocked = async (db: Db, a: number, b: number): Promise<boolean> =>
  !!(await db.get('SELECT 1 AS x FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', a, b, b, a));

const pairConnection = (db: Db, a: number, b: number): Promise<ConnRow | undefined> =>
  db.get<ConnRow>('SELECT * FROM connections WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', a, b, b, a);

function connState(me: number, row: ConnRow | undefined): Conn | undefined {
  if (!row) return undefined;
  if (row.status === 'connected') return 'connected';
  if (row.from_id === me) return 'requested';
  return row.status === 'requested' ? 'incoming' : undefined;
}

const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(',');

// ---------------------------------------------------------------- what the browser gets

function meDto(u: UserRow) {
  return {
    first: u.first,
    last: u.last,
    email: u.email,
    bio: u.bio,
    visible: !!u.visible,
    prefs: userPrefs(u),
    criteria: Object.fromEntries(PREF_KEYS.map((k) => [k, (JSON.parse(u.criteria) as Partial<Record<PrefKey, boolean>>)[k] !== false])) as Record<PrefKey, boolean>,
    saveData: !!u.save_data,
    flyer: u.flyer_num !== null ? { num: u.flyer_num, tier: u.flyer_tier ?? 'Green' } : null,
    lastFlightAt: u.last_flight_at,
  };
}

/** A fixed handful of queries however many people are on the flight (Cloudflare's free plan caps queries per request). */
async function peopleFor(db: Db, me: UserRow, now: number) {
  const blockRows = await db.all<{ blocker_id: number; blocked_id: number }>('SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ? OR blocked_id = ?', me.id, me.id);
  const blocked = new Set(blockRows.map((b) => (b.blocker_id === me.id ? b.blocked_id : b.blocker_id)));

  const conns = await db.all<ConnRow>('SELECT * FROM connections WHERE from_id = ? OR to_id = ?', me.id, me.id);
  const connWith = new Map<number, ConnRow>();
  for (const c of conns) connWith.set(c.from_id === me.id ? c.to_id : c.from_id, c);

  const users = new Map<number, UserRow>();
  const mine = await myFlights(db, me.id);
  const myKeys = mine.map((f) => f.key);
  // which of my flights each person is also on
  const sharedKeys = new Map<number, string[]>();
  // people on the same flight (only while I am open to connect myself, and only people who confirmed their email)
  if (me.visible && myKeys.length) {
    const rows = await db.all<{ user_id: number; flight_key: string }>(
      `SELECT uf.user_id, uf.flight_key FROM user_flights uf JOIN users u ON u.id = uf.user_id WHERE u.id != ? AND u.visible = 1 AND u.email_verified = 1 AND uf.flight_key IN (${placeholders(myKeys.length)})`,
      me.id, ...myKeys,
    );
    for (const r of rows) sharedKeys.set(r.user_id, [...(sharedKeys.get(r.user_id) ?? []), r.flight_key]);
    const ids = [...sharedKeys.keys()];
    if (ids.length) for (const u of await db.all<UserRow>(`SELECT * FROM users WHERE id IN (${placeholders(ids.length)})`, ...ids)) users.set(u.id, u);
  }
  // anyone I have a connection or an open request with, even from an earlier flight
  const relatedIds = [...connWith.entries()]
    .filter(([, c]) => c.status === 'connected' || c.from_id === me.id || (c.to_id === me.id && c.status === 'requested'))
    .map(([id]) => id)
    .filter((id) => !users.has(id));
  if (relatedIds.length) {
    for (const u of await db.all<UserRow>(`SELECT * FROM users WHERE id IN (${placeholders(relatedIds.length)})`, ...relatedIds)) users.set(u.id, u);
  }

  // every flight we need to describe: the ones we share, plus the one each connection started on
  const known = new Map<string, FlightRow>(mine.map((f) => [f.key, f]));
  const wanted = [...new Set([...connWith.values()].map((c) => c.flight_key))].filter((k) => !known.has(k));
  if (wanted.length) for (const f of await db.all<FlightRow>(`SELECT * FROM flights WHERE key IN (${placeholders(wanted.length)})`, ...wanted)) known.set(f.key, f);
  // for connected people the chat stays open until the last flight they share has landed
  const theirKeys = new Map<number, Set<string>>();
  const connectedIds = [...connWith.entries()].filter(([, c]) => c.status === 'connected').map(([id]) => id);
  if (connectedIds.length && myKeys.length) {
    const rows = await db.all<{ user_id: number; flight_key: string }>(
      `SELECT user_id, flight_key FROM user_flights WHERE user_id IN (${placeholders(connectedIds.length)}) AND flight_key IN (${placeholders(myKeys.length)})`,
      ...connectedIds, ...myKeys,
    );
    for (const r of rows) theirKeys.set(r.user_id, (theirKeys.get(r.user_id) ?? new Set()).add(r.flight_key));
  }

  return [...users.values()]
    .filter((u) => !blocked.has(u.id))
    .map((u) => {
      const row = connWith.get(u.id);
      const conn = connState(me.id, row);
      // flights to label this person with: the ones we share; for an old connection, the one it started on
      const keys = new Set<string>([...(sharedKeys.get(u.id) ?? []), ...(theirKeys.get(u.id) ?? [])]);
      if (row && !keys.size) keys.add(row.flight_key);
      const flights = [...keys].map((k) => known.get(k)).filter((f): f is FlightRow => !!f).sort((a, b) => a.departs_at - b.departs_at);
      let window: ChatWindow | undefined;
      if (conn === 'connected' && row) {
        const last = [...flights, known.get(row.flight_key)].filter((f): f is FlightRow => !!f).sort((a, b) => b.lands_at - a.lands_at)[0];
        window = windowFor(last, now);
      }
      return {
        id: String(u.id),
        name: displayName(u),
        bio: u.bio,
        av: u.id % 6,
        ...userPrefs(u),
        ...(conn ? { conn } : {}),
        ...(window ? { window } : {}),
        flights: flights.map((f) => flightDto(f)),
      };
    });
}

function windowFor(f: FlightRow | undefined, now: number): ChatWindow {
  // a connection always has a flight; if it was somehow removed, treat the chat as closed
  if (!f) return { stage: 'closed', closed: true, closesAt: null };
  return chatWindow({ departsAt: f.departs_at, landsAt: f.lands_at }, now);
}

async function messagesFor(db: Db, me: number, after: number) {
  const rows = await db.all<{ id: number; from_id: number; to_id: number; text: string; created_at: number; read_at: number | null }>(
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

async function syncPayload(db: Db, me: UserRow, after: number) {
  const now = Date.now();
  const [messages, flights, people] = [await messagesFor(db, me.id, after), await myFlights(db, me.id), await peopleFor(db, me, now)];
  // the flight to show first: the next one that has not landed yet, or the last one
  const current = flights.find((f) => f.lands_at > now) ?? flights[flights.length - 1];
  return {
    now,
    me: meDto(me),
    flight: flightDto(current),
    flights: flights.map((f) => flightDto(f)),
    people,
    games: await gamesFor(db, me.id, now),
    messages,
    cursor: messages.length ? Math.max(...messages.map((m) => m.id)) : after,
  };
}

/** Open games and invitations, plus recently finished ones (so the inviter hears about a decline). */
async function gamesFor(db: Db, me: number, now: number) {
  const rows = await db.all<GameRow>(
    `SELECT * FROM games WHERE (from_id = ? OR to_id = ?) AND (status IN ('invited','active') OR updated_at > ?) ORDER BY updated_at DESC LIMIT 20`,
    me, me, now - 10 * 60_000,
  );
  if (!rows.length) return [];
  const blockRows = await db.all<{ blocker_id: number; blocked_id: number }>('SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = ? OR blocked_id = ?', me, me);
  const blocked = new Set(blockRows.map((b) => (b.blocker_id === me ? b.blocked_id : b.blocker_id)));
  return rows.filter((r) => !blocked.has(r.from_id === me ? r.to_id : r.from_id)).map((r) => gameDto(r, me));
}

async function myGame(db: Db, me: number, id: unknown): Promise<GameRow> {
  const row = await db.get<GameRow>('SELECT * FROM games WHERE id = ? AND (from_id = ? OR to_id = ?)', Number(id), me, me);
  if (!row) throw new HttpError(404, 'not_found', 'That game is no longer there.');
  return row;
}

// ---------------------------------------------------------------- handlers

interface Ctx {
  request: Request;
  rt: Runtime;
  db: Db;
  user: UserRow | null;
  token: string | undefined;
  query: URLSearchParams;
  ip: string;
}

type Handler = (ctx: Ctx) => Promise<Response> | Response;

const requireUser = (ctx: Ctx): UserRow => {
  if (!ctx.user) throw new HttpError(401, 'unauthenticated', 'Please log in.');
  return ctx.user;
};

const ok = (extra: Record<string, unknown> = {}, headers: Record<string, string | string[]> = {}): Response => json(200, { ok: true, ...extra }, headers);

const newUserPrefs: Prefs = { type: 'Leisure', why: 'travel', pers: 'Ambivert', interests: ['Food & dining', 'Photography', 'Culture & museums'], seat: 'Window' };
const defaultCriteria = (): Record<PrefKey, boolean> => Object.fromEntries(PREF_KEYS.map((k) => [k, true])) as Record<PrefKey, boolean>;

const emailOf = (value: unknown): string => (typeof value === 'string' ? value.trim().toLowerCase() : '');

// ---------------------------------------------------------------- email links

/** Which airline theme the person is on (the folder name in the page address), so the link in the email comes back to the same pages. */
async function brandFolder(rt: Runtime, value: unknown): Promise<string> {
  const name = typeof value === 'string' && /^[a-z0-9-]{1,30}$/.test(value) ? value : '';
  return name && (await rt.brand(name)) !== null ? name : '';
}

const pageUrl = (rt: Runtime, folder: string, page: string, token: string): string => `${rt.settings.publicUrl}/${folder ? `${folder}/` : ''}${page}.html#token=${token}`;

async function sendVerification(rt: Runtime, user: UserRow, folder: string): Promise<void> {
  const token = await createToken(rt.db, user.id, 'verify', rt.settings.verifyHours * 3_600_000);
  const airline = folder ? await rt.brand(folder) : null;
  rt.sendMail({
    to: user.email,
    subject: 'Confirm your email for WingMate',
    text: `Hi ${user.first},\n\nThanks for signing up to WingMate${airline ? ` with ${airline}` : ''}. Please confirm your email address:\n\n${pageUrl(rt, folder, 'verify', token)}\n\nThis link works for ${rt.settings.verifyHours} hours. If you did not sign up, you can ignore this email and nothing will happen.\n\nWingMate`,
  });
}

async function sendReset(rt: Runtime, user: UserRow, folder: string): Promise<void> {
  const token = await createToken(rt.db, user.id, 'reset', rt.settings.resetMinutes * 60_000);
  rt.sendMail({
    to: user.email,
    subject: 'Reset your WingMate password',
    text: `Hi ${user.first},\n\nWe received a request to reset your WingMate password. Choose a new one here:\n\n${pageUrl(rt, folder, 'reset', token)}\n\nThis link works for ${rt.settings.resetMinutes} minutes and can be used once. If you did not ask for this, ignore this email; your password has not changed.\n\nWingMate`,
  });
}

const HOUR = 3_600_000;

const routes: Record<string, Handler> = {
  'GET /api/health': () => ok(),

  async 'POST /api/signup'({ request, rt, db, ip }) {
    await rateLimit(db, `signup:${ip}`, 10, HOUR);
    const b = await readJson(request);
    const first = v.str(b.first, 'first', 1, 60);
    const last = v.str(b.last, 'last', 1, 60);
    const mail = v.email(b.email);
    const phone = v.phone(`${typeof b.countryCode === 'string' ? b.countryCode : ''}${typeof b.phone === 'string' ? b.phone : ''}`);
    const dob = v.dateOfBirth(b.dob);
    const pw = v.password(b.password);
    if (b.terms !== true) throw bad('Please accept the Terms of Use and Privacy Policy.', 'terms');
    const taken = new HttpError(409, 'email_taken', 'An account with this email already exists. Try logging in.', 'email');
    if (await db.get('SELECT 1 AS x FROM users WHERE email = ?', mail)) throw taken;
    const hash = await rt.hashPassword(pw);
    const now = Date.now();
    let id: number;
    try {
      id = (
        await db.run(
          `INSERT INTO users (email, pw_hash, first, last, phone, dob, created_at, p_type, p_why, p_pers, p_interests, p_awake, p_seat, criteria, last_flight_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          mail, hash, first, last, phone, dob, now, newUserPrefs.type, newUserPrefs.why, newUserPrefs.pers, JSON.stringify(newUserPrefs.interests), 'No preference', newUserPrefs.seat, JSON.stringify(defaultCriteria()), now,
        )
      ).id;
    } catch (error) {
      if (/UNIQUE/i.test(String((error as Error)?.message))) throw taken; // two sign-ups with the same email at once
      throw error;
    }
    const created = await getUser(db, id);
    if (created) await sendVerification(rt, created, await brandFolder(rt, b.brand));
    // no session yet: the person has to confirm their email address first
    return json(201, { ok: true, verify: true });
  },

  async 'POST /api/verify'({ request, db, ip }) {
    await rateLimit(db, `verify:${ip}`, 30, HOUR);
    const b = await readJson(request);
    const userId = await consumeToken(db, typeof b.token === 'string' ? b.token : '', 'verify');
    if (userId === null) throw new HttpError(400, 'bad_token', 'This link has expired or was already used. Log in to get a new one.');
    await db.run('UPDATE users SET email_verified = 1 WHERE id = ?', userId);
    return ok();
  },

  async 'POST /api/verify/resend'({ request, rt, db, ip }) {
    await rateLimit(db, `resend:${ip}`, 10, HOUR);
    const b = await readJson(request);
    const mail = emailOf(b.email);
    await rateLimit(db, `resend-email:${mail}`, 3, HOUR);
    const user = await db.get<UserRow>('SELECT * FROM users WHERE email = ?', mail);
    if (user && !user.email_verified) await sendVerification(rt, user, await brandFolder(rt, b.brand));
    return ok(); // same answer whether or not the address has an account
  },

  async 'POST /api/forgot'({ request, rt, db, ip }) {
    await rateLimit(db, `forgot:${ip}`, 10, HOUR);
    const b = await readJson(request);
    const mail = emailOf(b.email);
    await rateLimit(db, `forgot-email:${mail}`, 3, HOUR);
    const user = await db.get<UserRow>('SELECT * FROM users WHERE email = ?', mail);
    if (user) await sendReset(rt, user, await brandFolder(rt, b.brand));
    return ok(); // same answer whether or not the address has an account
  },

  async 'POST /api/reset'({ request, rt, db, ip }) {
    await rateLimit(db, `reset:${ip}`, 20, HOUR);
    const b = await readJson(request);
    const pw = v.password(b.password);
    const userId = await consumeToken(db, typeof b.token === 'string' ? b.token : '', 'reset');
    if (userId === null) throw new HttpError(400, 'bad_token', 'This link has expired or was already used. Ask for a new one.');
    // using the emailed link also proves they own the address
    await db.run('UPDATE users SET pw_hash = ?, email_verified = 1 WHERE id = ?', await rt.hashPassword(pw), userId);
    await destroyAllSessions(db, userId); // anyone logged in with the old password is logged out
    return ok();
  },

  async 'POST /api/login'({ request, rt, db, ip }) {
    await rateLimit(db, `login-ip:${ip}`, 30, 15 * 60_000);
    const b = await readJson(request);
    const mail = emailOf(b.email);
    const pw = typeof b.password === 'string' ? b.password : '';
    await rateLimit(db, `login-email:${mail}`, 8, 15 * 60_000);
    const user = await db.get<UserRow>('SELECT * FROM users WHERE email = ?', mail);
    const passed = await rt.verifyPassword(pw, user?.pw_hash);
    if (!user || !passed) throw new HttpError(401, 'bad_credentials', 'The email address or password is incorrect. Please try again.');
    if (!user.email_verified) throw new HttpError(403, 'email_not_verified', 'Please confirm your email address first. We sent you a link when you signed up.');
    const session = await createSession(db, rt.settings, user.id, b.remember === true);
    return ok({}, { 'set-cookie': sessionCookie(session.token, session.maxAge, rt.settings.secureCookies) });
  },

  async 'POST /api/logout'({ rt, db, token }) {
    await destroySession(db, token);
    return ok({}, { 'set-cookie': sessionCookie('', 0, rt.settings.secureCookies) });
  },

  async 'GET /api/sync'(ctx) {
    const me = requireUser(ctx);
    const after = Math.max(0, Math.floor(Number(ctx.query.get('after') ?? 0)) || 0);
    return json(200, await syncPayload(ctx.db, me, after));
  },

  async 'PUT /api/prefs'(ctx) {
    const me = requireUser(ctx);
    const p = v.prefs((await readJson(ctx.request)).prefs);
    await ctx.db.run('UPDATE users SET p_type=?, p_why=?, p_pers=?, p_interests=?, p_seat=? WHERE id=?', p.type, p.why, p.pers, JSON.stringify(p.interests), p.seat, me.id);
    return ok();
  },

  async 'PUT /api/criteria'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.request);
    await ctx.db.run('UPDATE users SET criteria = ? WHERE id = ?', JSON.stringify(v.criteria(b.criteria)), me.id);
    return ok();
  },

  async 'PUT /api/visible'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.request);
    if (typeof b.visible !== 'boolean') throw bad('Send true or false.');
    await ctx.db.run('UPDATE users SET visible = ? WHERE id = ?', b.visible ? 1 : 0, me.id);
    return ok();
  },

  async 'PUT /api/profile'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.request);
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
    await ctx.db.run('UPDATE users SET first=?, last=?, bio=?, save_data=?, flyer_num=?, flyer_tier=? WHERE id=?', first, last, bio, saveData ? 1 : 0, num, tier, me.id);
    return ok();
  },

  async 'DELETE /api/flyer'(ctx) {
    const me = requireUser(ctx);
    await ctx.db.run('UPDATE users SET flyer_num = NULL, flyer_tier = NULL, save_data = 0 WHERE id = ?', me.id);
    return ok();
  },

  async 'PUT /api/flight'(ctx) {
    const me = requireUser(ctx);
    const input = v.flight(await readJson(ctx.request));
    const key = `${input.number}|${input.date}`;
    const have = await myFlights(ctx.db, me.id);
    if (!have.some((f) => f.key === key) && have.length >= MAX_FLIGHTS) throw bad(`You can add up to ${MAX_FLIGHTS} flights. Remove one first.`, 'number');
    // The first person to enter a flight sets its times; everyone after joins the same record.
    // (In production these come from the airline's schedule, not from users.)
    await ctx.db.batch([
      stmt('INSERT OR IGNORE INTO flights (key, number, from_code, to_code, departs_at, lands_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', key, input.number, input.from, input.to, input.departsAt, input.landsAt, me.id, Date.now()),
      stmt('INSERT OR IGNORE INTO user_flights (user_id, flight_key) VALUES (?, ?)', me.id, key),
      stmt(SET_FIRST_FLIGHT, me.id),
    ]);
    return ok();
  },

  async 'DELETE /api/flight'(ctx) {
    const me = requireUser(ctx);
    const key = ctx.query.get('key');
    await ctx.db.batch([
      key ? stmt('DELETE FROM user_flights WHERE user_id = ? AND flight_key = ?', me.id, key) : stmt('DELETE FROM user_flights WHERE user_id = ?', me.id),
      stmt(SET_FIRST_FLIGHT, me.id),
    ]);
    return ok();
  },

  async 'POST /api/connections'(ctx) {
    const me = requireUser(ctx);
    const { db } = ctx;
    await rateLimit(db, `connect:${me.id}`, 40, HOUR);
    const b = await readJson(ctx.request);
    const notAvailable = new HttpError(404, 'not_found', 'That person is not available.');
    const target = await getUser(db, Number(b.to));
    if (!target || target.id === me.id || !me.visible) throw notAvailable;
    const shared = await sharedFlights(db, me.id, target.id);
    const existing = await pairConnection(db, me.id, target.id);
    if ((await isBlocked(db, me.id, target.id)) || !(shared.length || existing) || (!target.visible && !existing)) throw notAvailable;
    // the flight this connection is about: the one they picked if you share it, otherwise your first shared flight
    const picked = shared.find((f) => f.key === b.flightKey) ?? shared.find((f) => f.lands_at > Date.now()) ?? shared[0];
    const flightKey = picked?.key ?? existing?.flight_key ?? '';

    const now = Date.now();
    let accepted = false;
    if (!existing) {
      await db.run("INSERT INTO connections (from_id, to_id, status, flight_key, created_at, updated_at) VALUES (?, ?, 'requested', ?, ?, ?)", me.id, target.id, flightKey, now, now);
    } else if (existing.status === 'requested' && existing.to_id === me.id) {
      await db.run("UPDATE connections SET status = 'connected', updated_at = ? WHERE id = ?", now, existing.id); // they asked first: it is mutual
      accepted = true;
    } else if (existing.status === 'declined' && existing.to_id === me.id) {
      await db.run("UPDATE connections SET from_id = ?, to_id = ?, status = 'requested', flight_key = ?, updated_at = ? WHERE id = ?", me.id, target.id, flightKey, now, existing.id);
    }
    // declined (by them) or already requested/connected: nothing changes, and nothing is revealed
    return ok({ conn: accepted ? 'connected' : 'requested' });
  },

  async 'POST /api/connections/respond'(ctx) {
    const me = requireUser(ctx);
    const { db } = ctx;
    const b = await readJson(ctx.request);
    const from = Number(b.from);
    const row = await db.get<ConnRow>("SELECT * FROM connections WHERE from_id = ? AND to_id = ? AND status = 'requested'", from, me.id);
    if (!row || (await isBlocked(db, me.id, from))) throw new HttpError(404, 'not_found', 'That request is no longer there.');
    await db.run('UPDATE connections SET status = ?, updated_at = ? WHERE id = ?', b.accept === true ? 'connected' : 'declined', Date.now(), row.id);
    return ok();
  },

  async 'POST /api/messages'(ctx) {
    const me = requireUser(ctx);
    const { db } = ctx;
    await rateLimit(db, `msg:${me.id}`, 40, 60_000);
    const b = await readJson(ctx.request);
    const to = Number(b.to);
    const text = v.str(b.text, 'text', 1, 1000);
    const row = await pairConnection(db, me.id, to);
    if (!row || row.status !== 'connected' || (await isBlocked(db, me.id, to))) throw new HttpError(403, 'not_connected', 'You can only message people you are connected with.');
    if (windowFor(await chatFlight(db, me.id, to, row), Date.now()).closed) throw new HttpError(403, 'chat_closed', 'This chat closed 48 hours after landing.');
    const id = (await db.run('INSERT INTO messages (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)', me.id, to, text, Date.now())).id;
    return json(201, { ok: true, id });
  },

  async 'POST /api/read'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.request);
    await ctx.db.run('UPDATE messages SET read_at = ? WHERE to_id = ? AND from_id = ? AND read_at IS NULL', Date.now(), me.id, Number(b.with));
    return ok();
  },

  async 'POST /api/block'(ctx) {
    const me = requireUser(ctx);
    const { db } = ctx;
    const b = await readJson(ctx.request);
    const target = await getUser(db, Number(b.userId));
    if (!target || target.id === me.id) throw new HttpError(404, 'not_found', 'That person is not available.');
    await db.batch([
      stmt('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', me.id, target.id, Date.now()),
      stmt('DELETE FROM connections WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', me.id, target.id, target.id, me.id),
      stmt('DELETE FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', me.id, target.id, target.id, me.id),
    ]);
    return ok();
  },

  async 'POST /api/report'(ctx) {
    const me = requireUser(ctx);
    const { db } = ctx;
    await rateLimit(db, `report:${me.id}`, 10, HOUR);
    const b = await readJson(ctx.request);
    const target = await getUser(db, Number(b.userId));
    if (!target || target.id === me.id) throw new HttpError(404, 'not_found', 'That person is not available.');
    const reason = v.str(b.reason, 'reason', 3, 500);
    await db.run('INSERT INTO reports (reporter_id, reported_id, reason, created_at) VALUES (?, ?, ?, ?)', me.id, target.id, reason, Date.now());
    return ok();
  },

  async 'GET /api/games'(ctx) {
    const me = requireUser(ctx);
    return ok({ games: await gamesFor(ctx.db, me.id, Date.now()) });
  },

  async 'POST /api/games'(ctx) {
    const me = requireUser(ctx);
    const { db } = ctx;
    await rateLimit(db, `game:${me.id}`, 60, HOUR);
    const b = await readJson(ctx.request);
    const kind = KINDS.find((k) => k === b.kind) as Kind | undefined;
    if (!kind) throw bad('Choose a game.');
    const to = Number(b.to);
    const conn = await pairConnection(db, me.id, to);
    if (!conn || conn.status !== 'connected' || (await isBlocked(db, me.id, to))) throw new HttpError(403, 'not_connected', 'You can only play with people you are connected with.');
    const word = kind === 'hangman' ? hangmanWord(b.word) : null;
    const open = await db.get<GameRow>(
      "SELECT * FROM games WHERE status IN ('invited','active') AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))",
      me.id, to, to, me.id,
    );
    if (open) throw new HttpError(409, 'game_open', open.status === 'invited' ? 'There is already an invitation between you two. Accept it or cancel it first.' : 'You already have a game going with them. End it first.');
    const now = Date.now();
    const id = (await db.run("INSERT INTO games (kind, from_id, to_id, status, state, version, created_at, updated_at) VALUES (?, ?, ?, 'invited', ?, 0, ?, ?)", kind, me.id, to, initialState(kind, me.id, word), now, now)).id;
    return ok({ game: gameDto((await myGame(db, me.id, id)), me.id) });
  },

  async 'POST /api/games/respond'(ctx) {
    const me = requireUser(ctx);
    const { db } = ctx;
    const b = await readJson(ctx.request);
    const row = await myGame(db, me.id, b.id);
    if (row.status !== 'invited' || row.to_id !== me.id) throw new HttpError(409, 'not_invited', 'That invitation is no longer open.');
    // the clock starts when the game starts, not when the invite was sent
    await db.run('UPDATE games SET status = ?, state = ?, version = version + 1, updated_at = ? WHERE id = ?', b.accept === true ? 'active' : 'declined', b.accept === true ? startClock(row.state) : row.state, Date.now(), row.id);
    return ok({ game: gameDto(await myGame(db, me.id, row.id), me.id) });
  },

  async 'POST /api/games/move'(ctx) {
    const me = requireUser(ctx);
    const { db } = ctx;
    await rateLimit(db, `gmove:${me.id}`, 240, 60_000);
    const b = await readJson(ctx.request);
    const row = await myGame(db, me.id, b.id);
    if (row.status !== 'active') throw new HttpError(409, 'not_active', row.status === 'invited' ? 'Waiting for them to accept.' : 'This game has ended.');
    const move = typeof b.move === 'object' && b.move !== null ? (b.move as Record<string, unknown>) : {};
    const state = applyMove(row, me.id, move);
    // only one change at a time: if someone else moved first, the player just tries again
    const changed = (await db.run('UPDATE games SET state = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?', state, Date.now(), row.id, row.version)).changes;
    if (!changed) throw new HttpError(409, 'conflict', 'Your travel mate moved at the same time. Try again.');
    return ok({ game: gameDto(await myGame(db, me.id, row.id), me.id) });
  },

  async 'POST /api/games/end'(ctx) {
    const me = requireUser(ctx);
    const { db } = ctx;
    const b = await readJson(ctx.request);
    const row = await myGame(db, me.id, b.id);
    if (row.status === 'invited' || row.status === 'active') {
      await db.run('UPDATE games SET status = ?, version = version + 1, updated_at = ? WHERE id = ?', row.status === 'invited' ? 'cancelled' : 'done', Date.now(), row.id);
    }
    return ok();
  },

  async 'DELETE /api/account'(ctx) {
    const me = requireUser(ctx);
    const b = await readJson(ctx.request);
    if (!(await ctx.rt.verifyPassword(typeof b.password === 'string' ? b.password : '', me.pw_hash))) throw new HttpError(403, 'bad_credentials', 'That password is not correct.', 'password');
    await ctx.db.run('DELETE FROM users WHERE id = ?', me.id);
    return ok({}, { 'set-cookie': sessionCookie('', 0, ctx.rt.settings.secureCookies) });
  },
};

// ---------------------------------------------------------------- entry point used by the Node server and the Worker

/** Handles one /api/ request. Never throws: problems become JSON error responses. `ip` is the visitor's address. */
export async function handleApi(request: Request, rt: Runtime, ip: string): Promise<Response> {
  try {
    const url = new URL(request.url);
    const method = request.method;
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) {
      const known = Object.keys(routes).some((k) => k.endsWith(` ${url.pathname}`));
      throw new HttpError(known ? 405 : 404, known ? 'method' : 'not_found', known ? 'That method is not allowed.' : 'Not found.');
    }
    // Only same-origin pages may change anything (a simple CSRF guard on top of SameSite cookies).
    if (method !== 'GET') {
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'forbidden', 'Cross-site requests are not allowed.');
    }
    rateLimitMemory(`ip:${ip}`, 600, 60_000);
    const token = parseCookies(request.headers.get('cookie')).wm_session;
    const user = await userForToken(rt.db, token);
    return await handler({ request, rt, db: rt.db, user, token, query: url.searchParams, ip });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    console.error(error);
    return json(500, { error: 'server', message: 'Something went wrong on our side. Please try again.' });
  }
}
