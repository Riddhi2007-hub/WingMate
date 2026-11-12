/**
 * The agent marketplace: small travel agents list trips for the places guests are flying to, and guests (alone or as a
 * group) send a request that the agent answers. Guests are shown the trips that fit where they are going and what
 * they like. Agents only ever see a guest's first name and last initial, the party size and the note the guest wrote,
 * and the number of guests flying to a place (never who they are).
 *
 * A few SAMPLE listings are always shown (clearly marked) so the page is never empty in a demo. In the live version
 * agents would be vetted and contracted by the airline, and bookings and payments would go through its systems.
 */
import { INTERESTS, isOneOf, type Interest } from '../src/ts/dashboard/options';
import { destinationByKey } from '../src/ts/dashboard/destinations';
import { bad } from './http';
import * as v from './validate';

export interface OfferDto {
  id: string;
  sample: boolean;
  agent: string;
  city: string;
  dest: string;
  destCity: string;
  title: string;
  days: number;
  price: number;
  text: string;
  tags: Interest[];
  mine?: boolean;
}

interface Sample {
  id: string;
  agent: string;
  city: string;
  dest: string;
  title: string;
  days: number;
  price: number;
  text: string;
  tags: Interest[];
}

/** Fictional agents, so nobody is mistaken for a real business. */
export const SAMPLES: readonly Sample[] = [
  { id: 's1', agent: 'Sample agent: Harbour Lane Tours', city: 'Hong Kong', dest: 'hongkong', title: 'Two-day Hong Kong food crawl', days: 2, price: 420, text: 'A small-group walking tour of dim sum houses, a market and a late-night noodle stop with a local guide.', tags: ['Food & dining', 'Nightlife'] },
  { id: 's2', agent: 'Sample agent: Peak & Island Co', city: 'Hong Kong', dest: 'hongkong', title: 'Lantau hike and Tai O lunch', days: 1, price: 260, text: 'Ngong Ping cable car, a guided ridge walk and a seafood lunch in the stilt village. Transport included.', tags: ['Hiking & outdoors', 'Photography'] },
  { id: 's3', agent: 'Sample agent: Selamat Trails', city: 'Kuala Lumpur', dest: 'kualalumpur', title: 'KL heritage and street food', days: 2, price: 380, text: 'Chinatown, Merdeka Square and the Batu Caves with a hawker-stall dinner each night.', tags: ['Culture & museums', 'Food & dining'] },
  { id: 's4', agent: 'Sample agent: Banyan Escapes', city: 'Bali', dest: 'bali', title: 'Ubud wellness weekend', days: 3, price: 900, text: 'Yoga, a rice-terrace walk and a spa day in Ubud. Shared villa, breakfast included.', tags: ['Wellness & spas', 'Hiking & outdoors'] },
  { id: 's5', agent: 'Sample agent: Chao Phraya Trips', city: 'Bangkok', dest: 'bangkok', title: 'Bangkok temples and night markets', days: 3, price: 560, text: 'Grand Palace, a canal boat ride and two night markets with a guide who knows the stalls.', tags: ['Culture & museums', 'Shopping', 'Nightlife'] },
  { id: 's6', agent: 'Sample agent: Merlion Meetups', city: 'Singapore', dest: 'singapore', title: 'Singapore tech and hawker day', days: 1, price: 300, text: 'Visit a startup hub and a co-working space, then eat your way through a hawker centre.', tags: ['Tech & startups', 'Business networking', 'Food & dining'] },
  { id: 's7', agent: 'Sample agent: Sakura Side Roads', city: 'Tokyo', dest: 'tokyo', title: 'Tokyo old and new', days: 4, price: 1500, text: 'Asakusa, a design museum, Shibuya at night and a day trip to the mountains.', tags: ['Art & design', 'Culture & museums', 'Photography'] },
];

export const sampleDto = (s: Sample): OfferDto => ({
  id: s.id,
  sample: true,
  agent: s.agent,
  city: s.city,
  dest: s.dest,
  destCity: destinationByKey(s.dest)?.city ?? s.dest,
  title: s.title,
  days: s.days,
  price: s.price,
  text: s.text,
  tags: s.tags,
});

export const MAX_OFFERS_PER_AGENT = 10;

export function agentInput(b: Record<string, unknown>) {
  return { name: v.str(b.name, 'name', 2, 60), city: v.str(b.city, 'city', 2, 40), about: v.str(b.about, 'about', 10, 300) };
}

export function offerInput(b: Record<string, unknown>) {
  const dest = typeof b.dest === 'string' ? b.dest : '';
  if (!destinationByKey(dest)) throw bad('Choose a destination from the list.', 'dest');
  const days = Number(b.days);
  if (!Number.isInteger(days) || days < 1 || days > 14) throw bad('Days must be between 1 and 14.', 'days');
  const price = Number(b.price);
  if (!Number.isInteger(price) || price < 1 || price > 50000) throw bad('Enter a price per person between 1 and 50,000.', 'price');
  const tags = Array.isArray(b.tags) ? [...new Set(b.tags)].filter((t): t is Interest => isOneOf(INTERESTS, t)).slice(0, 4) : [];
  if (!tags.length) throw bad('Pick at least one interest this trip suits.', 'tags');
  return { dest, title: v.str(b.title, 'title', 3, 60), days, price, body: v.str(b.text, 'text', 10, 400), tags };
}

export function requestInput(b: Record<string, unknown>) {
  const party = Number(b.party);
  if (!Number.isInteger(party) || party < 1 || party > 12) throw bad('Party size must be between 1 and 12.', 'party');
  return { offer: v.str(b.offer, 'offer', 1, 12), party, note: v.optionalStr(b.note, 'note', 300) };
}
