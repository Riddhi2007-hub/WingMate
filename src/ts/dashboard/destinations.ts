/**
 * Trip ideas for the places people fly to. Written by hand as suggestions (not bookable packages):
 * well-known sights and neighbourhoods only, no prices or opening times. Real airline holiday packages could
 * plug into the same slot. An airport that is not here falls back to the general ideas in data.ts.
 */
import type { Interest } from './options';

export interface TripIdea {
  name: string;
  days: number;
  text: string;
  tags: Interest[];
}

export interface Destination {
  city: string;
  trips: TripIdea[];
}

const D: Record<string, Destination> = {
  hongkong: {
    city: 'Hong Kong',
    trips: [
      { name: 'Harbour & Peak', days: 2, text: 'Victoria Peak at sunset, the Star Ferry across the harbour and the neon streets of Tsim Sha Tsui.', tags: ['Photography', 'Culture & museums'] },
      { name: 'Dim sum & street food', days: 2, text: 'Morning dim sum, Temple Street night market and egg waffles in Mong Kok.', tags: ['Food & dining', 'Nightlife', 'Shopping'] },
      { name: 'Lantau & the hills', days: 3, text: 'The Ngong Ping cable car and Big Buddha, a hike on Lantau and a fishing-village lunch in Tai O.', tags: ['Hiking & outdoors', 'Photography', 'Wellness & spas'] },
    ],
  },
  kualalumpur: {
    city: 'Kuala Lumpur',
    trips: [
      { name: 'Towers & Bukit Bintang', days: 2, text: 'Petronas Towers, KLCC park and the shopping and street food of Bukit Bintang.', tags: ['Shopping', 'Food & dining', 'Photography'] },
      { name: 'Heritage KL', days: 2, text: 'Merdeka Square, Chinatown and Little India, Central Market and the Batu Caves.', tags: ['Culture & museums', 'Photography', 'Art & design'] },
      { name: 'Green escape', days: 3, text: 'The KL Forest Eco Park canopy walk, a day trip to the Genting Highlands and a spa evening.', tags: ['Hiking & outdoors', 'Wellness & spas'] },
    ],
  },
  kolkata: {
    city: 'Kolkata',
    trips: [
      { name: 'Colonial Kolkata', days: 2, text: 'Victoria Memorial, Howrah Bridge at dawn and the old College Street book stalls.', tags: ['Culture & museums', 'Photography', 'Art & design'] },
      { name: 'Street food & sweets', days: 2, text: 'Kathi rolls, phuchka, Bengali fish thali and a mishti doi sweet-shop crawl.', tags: ['Food & dining', 'Shopping'] },
      { name: 'Festival & river', days: 3, text: 'Ghat walks on the Hooghly, the potters of Kumartuli and an evening of Bengali music.', tags: ['Music & concerts', 'Photography', 'Culture & museums'] },
    ],
  },
  delhi: {
    city: 'Delhi',
    trips: [
      { name: 'Old & New Delhi', days: 3, text: 'Red Fort and Chandni Chowk, Humayun’s Tomb and India Gate.', tags: ['Culture & museums', 'Photography', 'Food & dining'] },
      { name: 'Markets & street food', days: 2, text: 'Chandni Chowk parathas, Khan Market and the handicraft stalls at Dilli Haat.', tags: ['Food & dining', 'Shopping'] },
      { name: 'Agra day trip', days: 2, text: 'Sunrise at the Taj Mahal and Agra Fort, with the train or a road trip from Delhi.', tags: ['Photography', 'Culture & museums'] },
    ],
  },
  mumbai: {
    city: 'Mumbai',
    trips: [
      { name: 'South Mumbai walk', days: 2, text: 'Gateway of India, Marine Drive at sunset and the Colaba cafés.', tags: ['Photography', 'Culture & museums', 'Food & dining'] },
      { name: 'Street food & Bollywood', days: 2, text: 'Vada pav and chaat, the Juhu beach evening and a film-studio tour.', tags: ['Food & dining', 'Music & concerts', 'Nightlife'] },
      { name: 'Business hub', days: 2, text: 'Meetings around Bandra Kurla and Nariman Point, with startup meet-ups in the evening.', tags: ['Business networking', 'Tech & startups'] },
    ],
  },
  bengaluru: {
    city: 'Bengaluru',
    trips: [
      { name: 'Startup city', days: 2, text: 'Co-working spots and tech meet-ups around Koramangala and Indiranagar.', tags: ['Tech & startups', 'Business networking'] },
      { name: 'Gardens & breweries', days: 2, text: 'Lalbagh Botanical Garden, Cubbon Park and a craft-beer evening.', tags: ['Nightlife', 'Hiking & outdoors', 'Food & dining'] },
      { name: 'Day trip to Mysuru', days: 3, text: 'Mysore Palace and the Chamundi Hills, with a stop at a silk shop.', tags: ['Culture & museums', 'Shopping', 'Photography'] },
    ],
  },
  bangkok: {
    city: 'Bangkok',
    trips: [
      { name: 'Temples & river', days: 2, text: 'The Grand Palace, Wat Pho and a longtail-boat ride on the Chao Phraya.', tags: ['Culture & museums', 'Photography'] },
      { name: 'Street food & night markets', days: 2, text: 'Yaowarat (Chinatown) after dark, rooftop bars and a Thai cooking class.', tags: ['Food & dining', 'Nightlife', 'Shopping'] },
      { name: 'Spa & slow day', days: 2, text: 'A traditional Thai massage, a quiet canal tour and Lumphini Park at sunrise.', tags: ['Wellness & spas', 'Hiking & outdoors'] },
    ],
  },
  singapore: {
    city: 'Singapore',
    trips: [
      { name: 'Gardens & skyline', days: 2, text: 'Gardens by the Bay, the Marina Bay waterfront and the Supertrees light show.', tags: ['Photography', 'Hiking & outdoors', 'Art & design'] },
      { name: 'Hawker food trail', days: 2, text: 'Hawker centres in Chinatown and Lau Pa Sat, with kaya toast and chilli crab.', tags: ['Food & dining', 'Shopping'] },
      { name: 'Business & rooftops', days: 2, text: 'Meetings in the CBD, then drinks along the river and at Clarke Quay.', tags: ['Business networking', 'Tech & startups', 'Nightlife'] },
    ],
  },
  bali: {
    city: 'Bali',
    trips: [
      { name: 'Ubud culture', days: 3, text: 'Rice terraces, the Sacred Monkey Forest and traditional dance in the evening.', tags: ['Culture & museums', 'Photography', 'Art & design'] },
      { name: 'Beaches & surf', days: 3, text: 'Surf lessons in Canggu, sunset at Uluwatu and a beach-club afternoon.', tags: ['Sports', 'Nightlife', 'Photography'] },
      { name: 'Wellness retreat', days: 3, text: 'Morning yoga, a Balinese massage and a waterfall hike.', tags: ['Wellness & spas', 'Hiking & outdoors'] },
    ],
  },
  hochiminh: {
    city: 'Ho Chi Minh City',
    trips: [
      { name: 'Old Saigon', days: 2, text: 'The War Remnants Museum, Notre-Dame Cathedral, Ben Thanh Market and the old post office.', tags: ['Culture & museums', 'Shopping', 'Photography'] },
      { name: 'Street food & coffee', days: 2, text: 'Banh mi, pho and egg coffee, then a motorbike food tour in the evening.', tags: ['Food & dining', 'Nightlife'] },
      { name: 'Mekong Delta day', days: 2, text: 'A boat trip through the canals, local fruit orchards and a small-village lunch.', tags: ['Hiking & outdoors', 'Photography'] },
    ],
  },
  manila: {
    city: 'Manila',
    trips: [
      { name: 'Intramuros & bay', days: 2, text: 'The walled city of Intramuros, Fort Santiago and a Manila Bay sunset.', tags: ['Culture & museums', 'Photography'] },
      { name: 'Food & night out', days: 2, text: 'Filipino classics in Binondo, then live music and bars in Poblacion.', tags: ['Food & dining', 'Music & concerts', 'Nightlife'] },
      { name: 'Makati business', days: 2, text: 'Meetings in Makati and Bonifacio Global City, with networking events in the evening.', tags: ['Business networking', 'Tech & startups', 'Shopping'] },
    ],
  },
  tokyo: {
    city: 'Tokyo',
    trips: [
      { name: 'Old & new Tokyo', days: 3, text: 'Senso-ji in Asakusa, the Shibuya crossing and the lights of Shinjuku.', tags: ['Culture & museums', 'Photography', 'Nightlife'] },
      { name: 'Ramen & markets', days: 2, text: 'Tsukiji outer market breakfast, ramen alleys and a depachika food-hall evening.', tags: ['Food & dining', 'Shopping'] },
      { name: 'Design & tech', days: 3, text: 'Art museums, Akihabara electronics and the design stores of Omotesando.', tags: ['Art & design', 'Tech & startups', 'Shopping'] },
    ],
  },
  sydney: {
    city: 'Sydney',
    trips: [
      { name: 'Harbour icons', days: 2, text: 'The Opera House, the Harbour Bridge and a ferry to Manly.', tags: ['Photography', 'Culture & museums'] },
      { name: 'Beaches & coastal walk', days: 2, text: 'The Bondi to Coogee coastal walk, a beach day and fish and chips by the water.', tags: ['Hiking & outdoors', 'Sports', 'Food & dining'] },
      { name: 'Blue Mountains day', days: 3, text: 'The Three Sisters lookout, bushwalks and a village café stop.', tags: ['Hiking & outdoors', 'Photography', 'Wellness & spas'] },
    ],
  },
};

/** Which destination each airport belongs to (an airport code may share a city with another). */
const AIRPORT_TO: Record<string, keyof typeof D> = {
  HKG: 'hongkong',
  KUL: 'kualalumpur',
  CCU: 'kolkata',
  DEL: 'delhi',
  BOM: 'mumbai',
  BLR: 'bengaluru',
  BKK: 'bangkok',
  DMK: 'bangkok',
  SIN: 'singapore',
  DPS: 'bali',
  SGN: 'hochiminh',
  MNL: 'manila',
  NRT: 'tokyo',
  HND: 'tokyo',
  SYD: 'sydney',
};

/** Trip ideas for an airport, or undefined when there are none yet. */
export function destinationFor(code: string | undefined): Destination | undefined {
  const key = code ? AIRPORT_TO[code.toUpperCase()] : undefined;
  return key ? D[key] : undefined;
}
