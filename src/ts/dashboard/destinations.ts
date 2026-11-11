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
  /** The places in the plan, in the order you would visit them. */
  stops: string[];
}

export interface Destination {
  key: string;
  city: string;
  trips: TripIdea[];
}

const D: Record<string, Destination> = {
  hongkong: {
    key: 'hongkong',
    city: 'Hong Kong',
    trips: [
      { name: 'Harbour & Peak', days: 2, text: 'Victoria Peak at sunset, the Star Ferry across the harbour and the neon streets of Tsim Sha Tsui.', tags: ['Photography', 'Culture & museums'], stops: ['Victoria Peak', 'Peak Tram', 'Star Ferry', 'Tsim Sha Tsui waterfront', 'Temple Street Night Market'] },
      { name: 'Dim sum & street food', days: 2, text: 'Morning dim sum, Temple Street night market and egg waffles in Mong Kok.', tags: ['Food & dining', 'Nightlife', 'Shopping'], stops: ['Dim sum breakfast', 'Mong Kok street food', 'Egg waffles', 'Temple Street Night Market', 'Sham Shui Po snacks'] },
      { name: 'Lantau & the hills', days: 3, text: 'The Ngong Ping cable car and Big Buddha, a hike on Lantau and a fishing-village lunch in Tai O.', tags: ['Hiking & outdoors', 'Photography', 'Wellness & spas'], stops: ['Ngong Ping 360 cable car', 'Big Buddha', 'Po Lin Monastery', 'Tai O fishing village', 'Lantau Trail'] },
      { name: 'Old Hong Kong & art', days: 2, text: 'Temples, galleries and the heritage lanes of Central and Sheung Wan.', tags: ['Culture & museums', 'Art & design', 'Shopping'], stops: ['Man Mo Temple', 'Tai Kwun', 'PMQ creative hub', 'Hollywood Road antiques', 'Central-Mid-Levels Escalator'] },
    ],
  },
  kualalumpur: {
    key: 'kualalumpur',
    city: 'Kuala Lumpur',
    trips: [
      { name: 'Towers & Bukit Bintang', days: 2, text: 'Petronas Towers, KLCC park and the shopping and street food of Bukit Bintang.', tags: ['Shopping', 'Food & dining', 'Photography'], stops: ['Petronas Twin Towers', 'KLCC Park', 'Suria KLCC', 'Bukit Bintang', 'Jalan Alor food street'] },
      { name: 'Heritage KL', days: 2, text: 'Merdeka Square, Chinatown and Little India, Central Market and the Batu Caves.', tags: ['Culture & museums', 'Photography', 'Art & design'], stops: ['Merdeka Square', 'Sultan Abdul Samad Building', 'Petaling Street Chinatown', 'Central Market', 'Batu Caves'] },
      { name: 'Green escape', days: 3, text: 'The KL Forest Eco Park canopy walk, a day trip to the Genting Highlands and a spa evening.', tags: ['Hiking & outdoors', 'Wellness & spas'], stops: ['KL Forest Eco Park', 'Perdana Botanical Gardens', 'Bukit Nanas', 'Genting Highlands', 'Spa evening'] },
      { name: 'Street food & night views', days: 2, text: 'Hawker streets after dark, a rooftop bar with a view of the towers and late-night supper.', tags: ['Food & dining', 'Nightlife'], stops: ['Jalan Alor', 'Lot 10 Hutong food court', 'Nasi lemak breakfast', 'Petaling Street night market', 'Rooftop bar by the towers'] },
    ],
  },
  kolkata: {
    key: 'kolkata',
    city: 'Kolkata',
    trips: [
      { name: 'Colonial Kolkata', days: 2, text: 'Victoria Memorial, Howrah Bridge at dawn and the old College Street book stalls.', tags: ['Culture & museums', 'Photography', 'Art & design'], stops: ['Victoria Memorial', 'Howrah Bridge', 'St Paul’s Cathedral', 'Indian Museum', 'College Street book market'] },
      { name: 'Street food & sweets', days: 2, text: 'Kathi rolls, phuchka, Bengali fish thali and a sweet-shop crawl.', tags: ['Food & dining', 'Shopping'], stops: ['Phuchka stalls', 'Kathi rolls', 'Bengali fish thali', 'Mishti doi', 'Sweet-shop crawl'] },
      { name: 'Festival & river', days: 3, text: 'Ghat walks on the Hooghly, the potters of Kumartuli and an evening of Bengali music.', tags: ['Music & concerts', 'Photography', 'Culture & museums'], stops: ['Prinsep Ghat', 'Mullick Ghat flower market', 'Kumartuli potters’ quarter', 'Hooghly river boat', 'Evening Bengali music'] },
      { name: 'Art & tea afternoon', days: 2, text: 'Galleries, grand old houses, Park Street cafés and a tea tasting.', tags: ['Art & design', 'Culture & museums', 'Food & dining'], stops: ['Academy of Fine Arts', 'Marble Palace', 'Park Street cafés', 'Dakshineswar Kali Temple', 'Tea tasting'] },
    ],
  },
  delhi: {
    key: 'delhi',
    city: 'Delhi',
    trips: [
      { name: 'Old & New Delhi', days: 3, text: 'Red Fort and Chandni Chowk, Humayun’s Tomb and India Gate.', tags: ['Culture & museums', 'Photography', 'Food & dining'], stops: ['Red Fort', 'Jama Masjid', 'Humayun’s Tomb', 'India Gate', 'Lotus Temple'] },
      { name: 'Markets & street food', days: 2, text: 'Chandni Chowk parathas, Khan Market and the handicraft stalls at Dilli Haat.', tags: ['Food & dining', 'Shopping'], stops: ['Chandni Chowk parathas', 'Karim’s', 'Khan Market', 'Dilli Haat', 'Sarojini Nagar Market'] },
      { name: 'Agra day trip', days: 2, text: 'Sunrise at the Taj Mahal and Agra Fort, with the train or a road trip from Delhi.', tags: ['Photography', 'Culture & museums'], stops: ['Taj Mahal at sunrise', 'Agra Fort', 'Mehtab Bagh', 'Fatehpur Sikri'] },
      { name: 'Gardens & monuments', days: 2, text: 'Qutub Minar, the Lodhi Garden and the cafés of Hauz Khas Village.', tags: ['Culture & museums', 'Hiking & outdoors', 'Art & design'], stops: ['Qutub Minar', 'Lodhi Garden', 'National Museum', 'Hauz Khas Village', 'Akshardham Temple'] },
    ],
  },
  mumbai: {
    key: 'mumbai',
    city: 'Mumbai',
    trips: [
      { name: 'South Mumbai walk', days: 2, text: 'Gateway of India, Marine Drive at sunset and the Colaba cafés.', tags: ['Photography', 'Culture & museums', 'Food & dining'], stops: ['Gateway of India', 'Colaba Causeway', 'Kala Ghoda', 'Chhatrapati Shivaji Terminus', 'Marine Drive at sunset'] },
      { name: 'Street food & Bollywood', days: 2, text: 'Vada pav and chaat, the Juhu beach evening and a film-studio tour.', tags: ['Food & dining', 'Music & concerts', 'Nightlife'], stops: ['Vada pav', 'Chowpatty chaat', 'Juhu Beach', 'Bollywood film city tour', 'Bandra cafés'] },
      { name: 'Business hub', days: 2, text: 'Meetings around Bandra Kurla and Nariman Point, with startup meet-ups in the evening.', tags: ['Business networking', 'Tech & startups'], stops: ['Bandra Kurla Complex', 'Nariman Point', 'Lower Parel offices', 'Startup meet-up in Powai'] },
      { name: 'Islands & sea views', days: 2, text: 'A ferry to the Elephanta Caves, a mosque on the sea and sunset at the Bandstand.', tags: ['Hiking & outdoors', 'Photography', 'Culture & museums'], stops: ['Elephanta Caves ferry', 'Haji Ali Dargah', 'Bandra-Worli Sea Link view', 'Bandstand sunset', 'Sanjay Gandhi National Park'] },
    ],
  },
  bengaluru: {
    key: 'bengaluru',
    city: 'Bengaluru',
    trips: [
      { name: 'Startup city', days: 2, text: 'Co-working spots and tech meet-ups around Koramangala and Indiranagar.', tags: ['Tech & startups', 'Business networking'], stops: ['Koramangala cafés', 'Indiranagar', 'Co-working spaces', 'Tech meet-up', 'UB City'] },
      { name: 'Gardens & breweries', days: 2, text: 'Lalbagh Botanical Garden, Cubbon Park and a craft-beer evening.', tags: ['Nightlife', 'Hiking & outdoors', 'Food & dining'], stops: ['Lalbagh Botanical Garden', 'Cubbon Park', 'Vidhana Soudha', 'Church Street', 'Craft breweries'] },
      { name: 'Day trip to Mysuru', days: 3, text: 'Mysore Palace and the Chamundi Hills, with a stop at a silk shop.', tags: ['Culture & museums', 'Shopping', 'Photography'], stops: ['Mysore Palace', 'Chamundi Hills', 'Devaraja Market', 'Brindavan Gardens', 'Silk shops'] },
      { name: 'Dosas & temples', days: 2, text: 'Famous dosa breakfasts, an old temple and the street food of VV Puram.', tags: ['Food & dining', 'Culture & museums', 'Shopping'], stops: ['Vidyarthi Bhavan dosas', 'Bull Temple', 'VV Puram Food Street', 'Commercial Street', 'Bangalore Palace'] },
    ],
  },
  bangkok: {
    key: 'bangkok',
    city: 'Bangkok',
    trips: [
      { name: 'Temples & river', days: 2, text: 'The Grand Palace, Wat Pho and a longtail-boat ride on the Chao Phraya.', tags: ['Culture & museums', 'Photography'], stops: ['Grand Palace', 'Wat Pho', 'Wat Arun', 'Chao Phraya river boat', 'Tha Tien market'] },
      { name: 'Street food & night markets', days: 2, text: 'Yaowarat (Chinatown) after dark, rooftop bars and a Thai cooking class.', tags: ['Food & dining', 'Nightlife', 'Shopping'], stops: ['Yaowarat Chinatown street food', 'Thai cooking class', 'Rot Fai Train Night Market', 'Rooftop bar', 'Pad thai at Thip Samai'] },
      { name: 'Spa & slow day', days: 2, text: 'A traditional Thai massage, a quiet canal tour and Lumphini Park at sunrise.', tags: ['Wellness & spas', 'Hiking & outdoors'], stops: ['Traditional Thai massage', 'Khlong canal tour', 'Lumphini Park at sunrise', 'Jim Thompson House', 'Benjakitti Park'] },
      { name: 'Markets & malls', days: 2, text: 'Chatuchak Weekend Market, big malls and the Asiatique riverfront.', tags: ['Shopping', 'Food & dining'], stops: ['Chatuchak Weekend Market', 'Siam Paragon', 'MBK Center', 'Pratunam Market', 'Asiatique riverfront'] },
    ],
  },
  singapore: {
    key: 'singapore',
    city: 'Singapore',
    trips: [
      { name: 'Gardens & skyline', days: 2, text: 'Gardens by the Bay, the Marina Bay waterfront and the Supertrees light show.', tags: ['Photography', 'Hiking & outdoors', 'Art & design'], stops: ['Gardens by the Bay', 'Supertree Grove', 'Marina Bay Sands SkyPark', 'Merlion Park', 'Helix Bridge'] },
      { name: 'Hawker food trail', days: 2, text: 'Hawker centres in Chinatown and Lau Pa Sat, with kaya toast and chilli crab.', tags: ['Food & dining', 'Shopping'], stops: ['Maxwell Food Centre', 'Lau Pa Sat', 'Chinatown Complex Food Centre', 'Kaya toast breakfast', 'Chilli crab'] },
      { name: 'Business & rooftops', days: 2, text: 'Meetings in the CBD, then drinks along the river and at Clarke Quay.', tags: ['Business networking', 'Tech & startups', 'Nightlife'], stops: ['Raffles Place', 'one-north tech hub', 'Boat Quay', 'Clarke Quay', 'Rooftop drinks'] },
      { name: 'Neighbourhoods & culture', days: 2, text: 'Little India, Kampong Glam and the colourful Peranakan houses of Katong.', tags: ['Culture & museums', 'Art & design', 'Shopping'], stops: ['Little India', 'Kampong Glam', 'Haji Lane', 'Katong Peranakan houses', 'National Gallery Singapore'] },
    ],
  },
  bali: {
    key: 'bali',
    city: 'Bali',
    trips: [
      { name: 'Ubud culture', days: 3, text: 'Rice terraces, the Sacred Monkey Forest and traditional dance in the evening.', tags: ['Culture & museums', 'Photography', 'Art & design'], stops: ['Tegallalang rice terraces', 'Sacred Monkey Forest', 'Ubud Palace', 'Traditional dance show', 'Campuhan Ridge Walk'] },
      { name: 'Beaches & surf', days: 3, text: 'Surf lessons in Canggu, sunset at Uluwatu and a beach-club afternoon.', tags: ['Sports', 'Nightlife', 'Photography'], stops: ['Canggu surf lessons', 'Echo Beach', 'Beach club afternoon', 'Padang Padang Beach', 'Uluwatu Temple sunset'] },
      { name: 'Wellness retreat', days: 3, text: 'Morning yoga, a Balinese massage and a waterfall hike.', tags: ['Wellness & spas', 'Hiking & outdoors'], stops: ['Morning yoga', 'Balinese massage', 'Tegenungan Waterfall', 'Healthy café brunch'] },
      { name: 'Temples & coast', days: 3, text: 'Sea and lake temples, and the green terraces of Jatiluwih.', tags: ['Culture & museums', 'Photography', 'Hiking & outdoors'], stops: ['Tanah Lot', 'Ulun Danu Beratan Temple', 'Jatiluwih rice terraces', 'Tirta Gangga water palace'] },
    ],
  },
  hochiminh: {
    key: 'hochiminh',
    city: 'Ho Chi Minh City',
    trips: [
      { name: 'Old Saigon', days: 2, text: 'The War Remnants Museum, Notre-Dame Cathedral, Ben Thanh Market and the old post office.', tags: ['Culture & museums', 'Shopping', 'Photography'], stops: ['War Remnants Museum', 'Notre-Dame Cathedral Basilica', 'Saigon Central Post Office', 'Ben Thanh Market', 'Independence Palace'] },
      { name: 'Street food & coffee', days: 2, text: 'Banh mi, pho and Vietnamese iced coffee, then a motorbike food tour in the evening.', tags: ['Food & dining', 'Nightlife'], stops: ['Banh mi', 'Pho', 'Vietnamese iced coffee', 'Vinh Khanh street food', 'Motorbike food tour'] },
      { name: 'Mekong Delta day', days: 2, text: 'A boat trip through the canals, local fruit orchards and a small-village lunch.', tags: ['Hiking & outdoors', 'Photography'], stops: ['Mekong canal boat trip', 'Fruit orchards', 'Village lunch', 'Cai Be floating market'] },
      { name: 'Chinatown & history', days: 2, text: 'Cholon’s temples, the Cu Chi Tunnels and the lights of Bui Vien.', tags: ['Culture & museums', 'Nightlife', 'Photography'], stops: ['Cholon Chinatown', 'Thien Hau Temple', 'Cu Chi Tunnels', 'Bitexco Financial Tower', 'Bui Vien walking street'] },
    ],
  },
  manila: {
    key: 'manila',
    city: 'Manila',
    trips: [
      { name: 'Intramuros & bay', days: 2, text: 'The walled city of Intramuros, Fort Santiago and a Manila Bay sunset.', tags: ['Culture & museums', 'Photography'], stops: ['Intramuros', 'Fort Santiago', 'San Agustin Church', 'Manila Cathedral', 'Manila Bay sunset'] },
      { name: 'Food & night out', days: 2, text: 'Filipino classics in Binondo, then live music and bars in Poblacion.', tags: ['Food & dining', 'Music & concerts', 'Nightlife'], stops: ['Binondo Chinatown food crawl', 'Adobo and sinigang', 'Poblacion bars', 'Live music in Poblacion'] },
      { name: 'Makati business', days: 2, text: 'Meetings in Makati and Bonifacio Global City, with networking events in the evening.', tags: ['Business networking', 'Tech & startups', 'Shopping'], stops: ['Ayala Avenue', 'Bonifacio Global City', 'Greenbelt', 'Networking event'] },
      { name: 'Tagaytay day trip', days: 2, text: 'A ridge-top view of Taal Volcano, bulalo lunch and cafés in the cool air.', tags: ['Hiking & outdoors', 'Photography', 'Food & dining'], stops: ['Taal Volcano view', 'Bulalo lunch', 'People’s Park in the Sky', 'Tagaytay ridge cafés'] },
    ],
  },
  tokyo: {
    key: 'tokyo',
    city: 'Tokyo',
    trips: [
      { name: 'Old & new Tokyo', days: 3, text: 'Senso-ji in Asakusa, the Shibuya crossing and the lights of Shinjuku.', tags: ['Culture & museums', 'Photography', 'Nightlife'], stops: ['Senso-ji', 'Tokyo Skytree', 'Meiji Shrine', 'Shibuya Crossing', 'Shinjuku at night'] },
      { name: 'Ramen & markets', days: 2, text: 'Tsukiji outer market breakfast, ramen alleys and a depachika food-hall evening.', tags: ['Food & dining', 'Shopping'], stops: ['Tsukiji Outer Market', 'Ramen Street at Tokyo Station', 'Ameya-Yokocho market', 'Depachika food hall', 'Izakaya in Yurakucho'] },
      { name: 'Design & tech', days: 3, text: 'Art museums, Akihabara electronics and the design stores of Omotesando.', tags: ['Art & design', 'Tech & startups', 'Shopping'], stops: ['Akihabara', 'Omotesando', 'Mori Art Museum', 'Nezu Museum', 'Daikanyama'] },
      { name: 'Gardens & quiet Tokyo', days: 2, text: 'Shinjuku Gyoen, the old streets of Yanaka and a traditional tea house.', tags: ['Hiking & outdoors', 'Wellness & spas', 'Culture & museums'], stops: ['Shinjuku Gyoen', 'Yanaka old town', 'Hamarikyu Gardens', 'Tea house in Asakusa'] },
    ],
  },
  sydney: {
    key: 'sydney',
    city: 'Sydney',
    trips: [
      { name: 'Harbour icons', days: 2, text: 'The Opera House, the Harbour Bridge and a ferry to Manly.', tags: ['Photography', 'Culture & museums'], stops: ['Sydney Opera House', 'Sydney Harbour Bridge', 'Circular Quay', 'Manly ferry', 'Royal Botanic Garden'] },
      { name: 'Beaches & coastal walk', days: 2, text: 'The Bondi to Coogee coastal walk, a beach day and fish and chips by the water.', tags: ['Hiking & outdoors', 'Sports', 'Food & dining'], stops: ['Bondi Beach', 'Bondi to Coogee coastal walk', 'Bronte Beach', 'Coogee Beach', 'Fish and chips by the water'] },
      { name: 'Blue Mountains day', days: 3, text: 'The Three Sisters lookout, bushwalks and a village café stop.', tags: ['Hiking & outdoors', 'Photography', 'Wellness & spas'], stops: ['Three Sisters at Echo Point', 'Scenic World', 'Leura village', 'Bushwalking trails'] },
      { name: 'The Rocks & markets', days: 2, text: 'The old Rocks quarter, a contemporary art museum and the food of Chinatown.', tags: ['Culture & museums', 'Art & design', 'Food & dining', 'Shopping'], stops: ['The Rocks', 'Museum of Contemporary Art', 'Darling Harbour', 'Haymarket Chinatown', 'Paddy’s Markets'] },
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

export const destinationByKey = (key: string): Destination | undefined => D[key];

export const ALL_DESTINATIONS: Destination[] = Object.values(D);
