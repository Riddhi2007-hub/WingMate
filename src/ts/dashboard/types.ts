import type { ChatWindow } from '../shared/stage';
import type { Goal, Interest, Personality, PrefKey, Purpose, Seating, Sleeping, Tier } from './options';

/** A passenger's saved preferences (your own, or a sample passenger's). */
export interface Prefs {
  type: Purpose;
  why: Goal;
  pers: Personality;
  interests: Interest[];
  awake: Sleeping;
  seat: Seating;
}

/** Another passenger on the flight. */
export interface Person extends Prefs {
  id: string;
  name: string;
  bio: string;
  /** Which avatar colour (0-5) to use. */
  av: number;
  /** Where we stand with this person, as reported by the server. */
  conn?: Connection;
  /** For connected people: whether their chat is still open. */
  window?: ChatWindow;
  /** The flights you share with this person (or, for an old connection, the one it started on). */
  flights: Flight[];
}

export interface Trip {
  name: string;
  days: number;
  text: string;
  tags: Interest[];
}

export interface User {
  first: string;
  last: string;
  email: string;
  bio: string;
}

export interface FlyerInfo {
  num: string;
  tier: Tier;
}

/** requested = you asked, incoming = they asked you, connected = both agreed. */
export type Connection = 'requested' | 'incoming' | 'connected';

/** The flight you are on. Times are Unix ms. */
export interface Flight {
  key: string;
  number: string;
  from: string;
  to: string;
  departsAt: number;
  landsAt: number;
}

export interface ChatMessage {
  id: number;
  from: 'me' | 'them';
  text: string;
  /** Unix time in milliseconds. */
  t: number;
}

/** Result of comparing one passenger with your preferences. */
export interface MatchDetail {
  /** 0-100 */
  pct: number;
  /** Interests you both picked. */
  shared: Interest[];
  /** Per-preference score (0, 0.5 or 1) for the preferences currently counted. */
  hit: Partial<Record<PrefKey, number>>;
}

export interface Ranked {
  p: Person;
  s: MatchDetail;
}

/** Filters on the Find page. An empty string means "Any". */
export type Filters = Record<'type' | 'why' | 'pers' | 'awake' | 'seat', string>;
