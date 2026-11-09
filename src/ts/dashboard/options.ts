/**
 * Every choice a passenger can make. The union types below are derived from these lists,
 * so adding an option here updates the types, the preferences page and the filters together.
 */

export const INTERESTS = [
  'Business networking',
  'Food & dining',
  'Photography',
  'Hiking & outdoors',
  'Culture & museums',
  'Shopping',
  'Music & concerts',
  'Tech & startups',
  'Wellness & spas',
  'Sports',
  'Art & design',
  'Nightlife',
] as const;
export type Interest = (typeof INTERESTS)[number];

/** Travel purpose */
export const PURPOSES = ['Business', 'Leisure', 'Family', 'Study'] as const;
export type Purpose = (typeof PURPOSES)[number];

/** Connection goal */
export const GOALS = ['cab', 'travel', 'meet'] as const;
export type Goal = (typeof GOALS)[number];
export const GOAL_LABEL: Record<Goal, string> = {
  cab: 'Just sharing a cab',
  travel: 'Travel & sightsee together',
  meet: 'Just meet new people',
};

/** Personality type */
export const PERSONALITIES = ['Extrovert', 'Introvert', 'Ambivert'] as const;
export type Personality = (typeof PERSONALITIES)[number];

/** Sleeping preference */
export const SLEEPING = ['Mostly awake', 'Mostly asleep', 'No preference'] as const;
export type Sleeping = (typeof SLEEPING)[number];

/** Seating preference */
export const SEATING = ['Window', 'Middle', 'Aisle'] as const;
export type Seating = (typeof SEATING)[number];

/** The six saved preferences, in the order they appear on the preferences page. */
export const PREF_KEYS = ['type', 'why', 'pers', 'interests', 'awake', 'seat'] as const;
export type PrefKey = (typeof PREF_KEYS)[number];

/** Preferences that are a single choice (everything except interests): used by the Find filters. */
export type FilterKey = Exclude<PrefKey, 'interests'>;
export const FILTER_KEYS: readonly FilterKey[] = ['type', 'why', 'pers', 'awake', 'seat'];

export const PREF_LABEL: Record<PrefKey, string> = {
  type: 'Travel purpose',
  why: 'Connection goal',
  pers: 'Personality type',
  interests: 'Interests',
  awake: 'Sleeping preference',
  seat: 'Seating preference',
};

/** How much each preference counts towards the match percentage. */
export const WEIGHTS: Record<PrefKey, number> = {
  type: 15,
  why: 25,
  pers: 10,
  interests: 30,
  awake: 10,
  seat: 10,
};

export const TIERS = ['Green', 'Silver', 'Gold', 'Diamond'] as const;
export type Tier = (typeof TIERS)[number];

export const STAGES = ['pre', 'in', 'landed', 'closed'] as const;
export type Stage = (typeof STAGES)[number];

export const VIEWS = ['home', 'find', 'messages', 'games', 'prefs', 'profile'] as const;
export type ViewName = (typeof VIEWS)[number];

export const VIEW_TITLE: Record<ViewName, string> = {
  home: 'Dashboard',
  find: 'Find travel mates',
  messages: 'Messages',
  games: 'Games',
  prefs: 'My preferences',
  profile: 'Profile & data',
};

/** Type guard helper: is `value` one of the allowed strings? */
export function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}
