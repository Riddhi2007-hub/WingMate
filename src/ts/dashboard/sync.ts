/**
 * Talks to the server. `sync()` fetches everything the screen needs (your profile, your flight, the
 * guests on it, your connections and new messages) and copies it into `state`; the screen then
 * re-renders if something changed. The page asks again every few seconds, so new messages and
 * connection requests from other people show up without reloading.
 */
import { ApiError, api } from '../shared/api';
import { setPeople } from './data';
import type { PrefKey } from './options';
import { state } from './state';
import type { ChatMessage, Flight, GroupDto, Person, Prefs } from './types';
import { setGames, type GameDto } from './gamestate';

interface MessageDto {
  id: number;
  with: string;
  from: 'me' | 'them';
  text: string;
  t: number;
  read: boolean;
}

interface SyncDto {
  now: number;
  me: {
    first: string;
    last: string;
    email: string;
    bio: string;
    visible: boolean;
    /** Whether the guest has ever saved their preferences (until then, matches are only suggestions). */
    prefsSet: boolean;
    prefs: Prefs;
    criteria: Record<PrefKey, boolean>;
    saveData: boolean;
    flyer: { num: string; tier: string } | null;
    lastFlightAt: number;
  };
  flight: Flight | null;
  flights: Flight[];
  people: Person[];
  games?: GameDto[];
  groups?: GroupDto[];
  groupMessages?: Array<{ id: number; group: string; from: 'me' | 'them'; by: string; text: string; t: number }>;
  groupCursor?: number;
  messages: MessageDto[];
  cursor: number;
}

let cursor = 0;
let gcursor = 0;
let loaded = false;
/** While the person's own change is on its way to the server, an older server answer must not undo it. */
let pending = 0;
let inFlight: Promise<boolean> | null = null;
let onChange: () => void = () => undefined;
let onNewMessage: (personId: string) => void = () => undefined;

export const hasLoaded = (): boolean => loaded;

export function configureSync(handlers: { changed: () => void; newMessage: (personId: string) => void }): void {
  onChange = handlers.changed;
  onNewMessage = handlers.newMessage;
}

/** Wraps a change the person makes: the server answer is applied only after the change has been saved. */
export async function save<T>(request: () => Promise<T>): Promise<T> {
  pending++;
  try {
    return await request();
  } finally {
    pending--;
    void sync();
  }
}

function toLogin(): void {
  location.replace('login.html');
}

const snapshot = (dto: SyncDto): string =>
  JSON.stringify({ me: dto.me, flight: dto.flight, flights: dto.flights, people: dto.people, groups: dto.groups });

let lastSnapshot = '';

function apply(dto: SyncDto): boolean {
  let changed = false;
  state.clockOffset = dto.now - Date.now();

  const snap = snapshot(dto);
  if (snap !== lastSnapshot && pending === 0) {
    lastSnapshot = snap;
    changed = true;
    const first = !loaded;
    state.user = { first: dto.me.first, last: dto.me.last, email: dto.me.email, bio: dto.me.bio };
    state.visible = dto.me.visible;
    state.prefs = dto.me.prefs;
    state.prefsSet = dto.me.prefsSet;
    if (first) state.draft = JSON.parse(JSON.stringify(dto.me.prefs)) as Prefs;
    state.criteria = { ...state.criteria, ...dto.me.criteria };
    state.saveData = dto.me.saveData;
    state.flyer = dto.me.flyer ? { num: dto.me.flyer.num, tier: dto.me.flyer.tier as 'Green' } : null;
    state.lastFlight = dto.me.lastFlightAt;
    state.flights = dto.flights;
    state.flight = dto.flights.find((f) => f.key === state.flightSel) ?? dto.flight;
    state.flightSel = state.flight?.key ?? null;
    setPeople(dto.people);
    state.groups = dto.groups ?? [];
    state.conn = {};
    state.windows = {};
    for (const p of dto.people) {
      if (p.conn) state.conn[p.id] = p.conn;
      if (p.window) state.windows[p.id] = p.window;
    }
  }

  if (pending === 0) setGames(dto.games ?? []);

  // messages: the first call returns the history, later calls only what is new
  for (const m of dto.messages) {
    const thread = state.chats[m.with] ?? [];
    if (thread.some((x) => x.id === m.id)) continue;
    const message: ChatMessage = { id: m.id, from: m.from, text: m.text, t: m.t };
    thread.push(message);
    state.chats[m.with] = thread;
    changed = true;
    if (m.from === 'them' && !m.read) {
      state.unread[m.with] = (state.unread[m.with] ?? 0) + 1;
      if (loaded) onNewMessage(m.with);
    }
  }
  // group messages work the same way, with their own cursor
  for (const m of dto.groupMessages ?? []) {
    const thread = state.groupChats[m.group] ?? [];
    if (thread.some((x) => x.id === m.id)) continue;
    thread.push({ id: m.id, from: m.from, by: m.by, text: m.text, t: m.t });
    state.groupChats[m.group] = thread;
    changed = true;
    const key = `g:${m.group}`;
    if (m.from === 'them' && loaded && !(state.currentView === 'messages' && state.activeChat === key)) {
      state.unread[key] = (state.unread[key] ?? 0) + 1;
      onNewMessage(key);
    }
  }
  gcursor = Math.max(gcursor, dto.groupCursor ?? 0);
  cursor = Math.max(cursor, dto.cursor);
  return changed;
}

/** Fetches the latest from the server and re-renders when something changed. Safe to call often. */
export function sync(): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = api<SyncDto>('GET', `/api/sync?after=${cursor}&gafter=${gcursor}`)
    .then((dto) => {
      const changed = apply(dto);
      const wasLoaded = loaded;
      loaded = true;
      if (changed || !wasLoaded) onChange();
      return changed;
    })
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) toLogin();
      return false;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

let timer: number | undefined;

/** How often to ask the server: quickly while a chat is open, slowly otherwise (the hosting plan counts every request). */
const pollDelay = (): number => (state.currentView === 'messages' ? 2500 : 8000);

export function startPolling(): void {
  const tick = (): void => {
    if (!document.hidden) void sync();
    timer = window.setTimeout(tick, pollDelay());
  };
  timer = window.setTimeout(tick, pollDelay());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void sync();
  });
  window.addEventListener('beforeunload', () => window.clearTimeout(timer));
}
