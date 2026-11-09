/**
 * Local data: the people on your flight (from the server), example trip packages and game words.
 * TRIPS are examples until the airline's real itineraries and hotel packages are connected.
 */
import type { Person, Trip } from './types';
import { BRAND } from '../shared/brand';

/** The other guests on your flight. Filled from the server (see sync.ts). */
let people: Person[] = [];

export const getPeople = (): Person[] => people;
export function setPeople(next: Person[]): void {
  people = next;
}

export function findPerson(id: string | null): Person | undefined {
  return id === null ? undefined : people.find((p) => p.id === id);
}

export const TRIPS: Trip[] = [
  { name: 'City highlights', days: 3, text: 'Classic sights, markets and a day trip.', tags: ['Culture & museums', 'Food & dining', 'Photography'] },
  { name: 'Food trail', days: 2, text: 'Local dishes, street food and morning markets.', tags: ['Food & dining'] },
  { name: 'Art & design weekend', days: 2, text: 'Galleries, architecture and design stores.', tags: ['Art & design', 'Culture & museums', 'Shopping'] },
  { name: 'Nature escape', days: 3, text: 'Trails, viewpoints and quiet corners.', tags: ['Hiking & outdoors', 'Photography', 'Wellness & spas'] },
];

export const HANGMAN_WORDS = ['AIRPORT', 'SUITCASE', 'BOARDING', 'JETLAG', 'PASSPORT', 'LAYOVER', 'SOUVENIR', 'TURBULENCE', 'ITINERARY', 'WINDOW', 'LUGGAGE', 'DEPARTURE'];

/** One SVG fragment per wrong guess, drawn in order. */
export const HANGMAN_PARTS = [
  '<circle cx="145" cy="72" r="14"/>',
  '<path d="M145 86v52"/>',
  '<path d="M145 98l-22 20"/>',
  '<path d="M145 98l22 20"/>',
  '<path d="M145 138l-20 32"/>',
  '<path d="M145 138l20 32"/>',
];

export const SCRIBBLE_WORDS = ['Suitcase', 'Airplane', 'Sunset', 'Noodles', 'Passport', 'Mountain', 'Umbrella', 'Temple', 'Taxi', 'Skyline', 'Boarding pass', 'Camera'];

/** Brand palette colours for the drawing pad: [hex, name]. */
export const SCRIBBLE_COLORS: ReadonlyArray<readonly [string, string]> = BRAND.palette;
