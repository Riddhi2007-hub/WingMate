import { GOALS, INTERESTS, PERSONALITIES, PREF_KEYS, PURPOSES, SEATING, SLEEPING, TIERS, isOneOf, type Interest, type PrefKey } from '../src/ts/dashboard/options';
import type { Prefs } from '../src/ts/dashboard/types';
import { config } from './config';
import { bad } from './http';

export const str = (value: unknown, field: string, min: number, max: number): string => {
  if (typeof value !== 'string') throw bad('Please fill this in.', field);
  const text = value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  if (text.length < min) throw bad('Please fill this in.', field);
  if (text.length > max) throw bad(`Please keep this under ${max} characters.`, field);
  return text;
};

export const optionalStr = (value: unknown, field: string, max: number): string => (value === undefined || value === null || value === '' ? '' : str(value, field, 0, max));

export function email(value: unknown): string {
  const text = str(value, 'email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) throw bad('Enter a valid email address.', 'email');
  return text;
}

export function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8) throw bad('Use at least 8 characters.', 'pw');
  if (value.length > 200) throw bad('That password is too long.', 'pw');
  return value;
}

export function phone(value: unknown): string {
  const text = str(value, 'phone', 5, 30);
  const digits = text.replace(/[\s\-().]/g, '');
  if (!/^\+?\d{7,15}$/.test(digits)) throw bad('Enter a valid phone number.', 'phone');
  return digits;
}

/** The age rule is enforced here as well as in the form: you must be 16 or older. */
export function dateOfBirth(value: unknown): string {
  const text = str(value, 'dob', 10, 10);
  const born = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(born.getTime()) || born.toISOString().slice(0, 10) !== text) throw bad('Enter a valid date of birth.', 'dob');
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const monthGap = now.getUTCMonth() - born.getUTCMonth();
  if (monthGap < 0 || (monthGap === 0 && now.getUTCDate() < born.getUTCDate())) age--;
  if (born > now || age > 120) throw bad('Enter a valid date of birth.', 'dob');
  if (age < config.minAge) throw bad(`You must be ${config.minAge} or older to use WingMate.`, 'dob');
  return text;
}

export function prefs(raw: unknown): Prefs {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  if (!isOneOf(PURPOSES, r.type)) throw bad('Choose a travel purpose.', 'type');
  if (!isOneOf(GOALS, r.why)) throw bad('Choose why you want to connect.', 'why');
  if (!isOneOf(PERSONALITIES, r.pers)) throw bad('Choose a personality type.', 'pers');
  if (!isOneOf(SLEEPING, r.awake)) throw bad('Choose a sleeping preference.', 'awake');
  if (!isOneOf(SEATING, r.seat)) throw bad('Choose a seating preference.', 'seat');
  if (!Array.isArray(r.interests)) throw bad('Choose your interests.', 'interests');
  const interests = [...new Set(r.interests)].filter((i): i is Interest => isOneOf(INTERESTS, i));
  if (!interests.length) throw bad('Pick at least one interest.', 'interests');
  return { type: r.type, why: r.why, pers: r.pers, interests, awake: r.awake, seat: r.seat };
}

export function criteria(raw: unknown): Record<PrefKey, boolean> {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const out = {} as Record<PrefKey, boolean>;
  for (const key of PREF_KEYS) out[key] = r[key] !== false;
  return out;
}

export const tier = (value: unknown): (typeof TIERS)[number] => {
  if (!isOneOf(TIERS, value)) throw bad('Choose a membership tier.', 'tier');
  return value;
};

export interface FlightInput {
  number: string;
  date: string;
  from: string;
  to: string;
  departsAt: number;
  landsAt: number;
}

export function flight(raw: Record<string, unknown>): FlightInput {
  const numberText = str(raw.number, 'number', 3, 8).toUpperCase();
  const m = /^([A-Z0-9]{2})\s?(\d{1,4}[A-Z]?)$/.exec(numberText);
  if (!m) throw bad('Enter a flight number like D7 543.', 'number');
  const date = str(raw.date, 'date', 10, 10);
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(day)) throw bad('Enter the departure date.', 'date');
  const from = str(raw.from, 'from', 3, 3).toUpperCase();
  const to = str(raw.to, 'to', 3, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(from)) throw bad('Use the 3-letter airport code, for example KUL.', 'from');
  if (!/^[A-Z]{3}$/.test(to)) throw bad('Use the 3-letter airport code, for example HND.', 'to');
  if (from === to) throw bad('The two airports must be different.', 'to');
  const departsAt = Number(raw.departsAt);
  const landsAt = Number(raw.landsAt);
  if (!Number.isFinite(departsAt) || !Number.isFinite(landsAt)) throw bad('Enter the departure and arrival times.', 'departsAt');
  if (landsAt <= departsAt) throw bad('Arrival must be after departure.', 'landsAt');
  if (landsAt - departsAt > 30 * 3_600_000) throw bad('That flight is longer than 30 hours. Check the times.', 'landsAt');
  if (Math.abs(departsAt - day) > 2 * 86_400_000) throw bad('The departure time does not match the date.', 'departsAt');
  const now = Date.now();
  if (day < now - 60 * 86_400_000 || day > now + 366 * 86_400_000) throw bad('Choose a date within the last 60 days or the next year.', 'date');
  return { number: `${m[1]} ${m[2]}`, date, from, to, departsAt, landsAt };
}
