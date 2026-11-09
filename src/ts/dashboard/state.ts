/**
 * The app's in-memory copy of what the server knows (see sync.ts, which fills it in), plus the
 * bits that only live on this screen (filters, which tab is open, unsaved preference edits).
 * Changes the person makes are sent to the server by the module that makes them.
 */
import { clone } from '../shared/dom';
import type { ChatWindow } from '../shared/stage';
import type { Interest, PrefKey, ViewName } from './options';
import type { ChatMessage, Connection, FlyerInfo, Filters, Flight, Prefs, User } from './types';

export const DEFAULT_PREFS: Prefs = {
  type: 'Leisure',
  why: 'travel',
  pers: 'Ambivert',
  interests: ['Food & dining', 'Photography', 'Culture & museums'],
  awake: 'No preference',
  seat: 'Window',
};

export const emptyFilters = (): Filters => ({ type: '', why: '', pers: '', awake: '', seat: '' });

export interface AppState {
  /** Saved preferences. */
  prefs: Prefs;
  /** Unsaved edits on the preferences page. */
  draft: Prefs;
  /** "Open to connect": whether other guests can see you. */
  visible: boolean;
  /** Connection status by person id. */
  conn: Record<string, Connection | undefined>;
  /** Whether each connected person's chat is still open. */
  windows: Record<string, ChatWindow | undefined>;
  chats: Record<string, ChatMessage[] | undefined>;
  /** Unread message count by person id. */
  unread: Record<string, number | undefined>;
  /** Which preferences count towards the match percentage. */
  criteria: Record<PrefKey, boolean>;
  user: User;
  flyer: FlyerInfo | null;
  saveData: boolean;
  /** When the person last flew (ms), used for the 3-month data deletion notice. */
  lastFlight: number;
  /** The flight you are on, or null until you add one. */
  flight: Flight | null;
  /** Server time minus this device's clock (ms), so countdowns agree with the server. */
  clockOffset: number;
  /** Interest chips selected on the Find page. */
  interestFilter: Interest[];
  filters: Filters;
  activeChat: string | null;
  currentView: ViewName;
}

export const state: AppState = {
  prefs: clone(DEFAULT_PREFS),
  draft: clone(DEFAULT_PREFS),
  visible: true,
  conn: {},
  windows: {},
  chats: {},
  unread: {},
  criteria: { type: true, why: true, pers: true, interests: true, awake: true, seat: true },
  user: { first: '', last: '', email: '', bio: '' },
  flyer: null,
  saveData: true,
  lastFlight: Date.now(),
  flight: null,
  clockOffset: 0,
  interestFilter: [],
  filters: emptyFilters(),
  activeChat: null,
  currentView: 'home',
};

/** The current time according to the server. */
export const nowMs = (): number => Date.now() + state.clockOffset;
