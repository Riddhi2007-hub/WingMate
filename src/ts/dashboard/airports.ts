/** Airports the globe knows about: the AirAsia network plus the main Indian and Hong Kong airports.
 *  [code, city, country, latitude, longitude]. An airport that is not here still saves fine; the globe just can't draw it. */
export interface Airport {
  code: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

const RAW: Array<[string, string, string, number, number]> = [
  // Hong Kong and China
  ['HKG', 'Hong Kong', 'Hong Kong', 22.308, 113.9185],
  ['MFM', 'Macau', 'Macau', 22.1496, 113.5915],
  ['CAN', 'Guangzhou', 'China', 23.3924, 113.2988],
  ['SZX', 'Shenzhen', 'China', 22.6393, 113.8107],
  ['PVG', 'Shanghai', 'China', 31.1443, 121.8083],
  ['PEK', 'Beijing', 'China', 40.0801, 116.5846],
  ['TPE', 'Taipei', 'Taiwan', 25.0777, 121.2328],
  // India and neighbours
  ['CCU', 'Kolkata', 'India', 22.6547, 88.4467],
  ['DEL', 'Delhi', 'India', 28.5562, 77.1],
  ['BOM', 'Mumbai', 'India', 19.0896, 72.8656],
  ['BLR', 'Bengaluru', 'India', 13.1986, 77.7066],
  ['MAA', 'Chennai', 'India', 12.99, 80.1693],
  ['HYD', 'Hyderabad', 'India', 17.2403, 78.4294],
  ['COK', 'Kochi', 'India', 10.152, 76.4019],
  ['GOI', 'Goa', 'India', 15.3808, 73.8314],
  ['PNQ', 'Pune', 'India', 18.5821, 73.9197],
  ['AMD', 'Ahmedabad', 'India', 23.0772, 72.6347],
  ['JAI', 'Jaipur', 'India', 26.8242, 75.8122],
  ['LKO', 'Lucknow', 'India', 26.7606, 80.8893],
  ['PAT', 'Patna', 'India', 25.5913, 85.088],
  ['GAU', 'Guwahati', 'India', 26.1061, 91.5859],
  ['IXB', 'Bagdogra', 'India', 26.6812, 88.3286],
  ['BBI', 'Bhubaneswar', 'India', 20.2444, 85.8178],
  ['DAC', 'Dhaka', 'Bangladesh', 23.8433, 90.3978],
  ['KTM', 'Kathmandu', 'Nepal', 27.6966, 85.3591],
  ['CMB', 'Colombo', 'Sri Lanka', 7.1808, 79.8841],
  // Malaysia, Singapore, Thailand
  ['KUL', 'Kuala Lumpur', 'Malaysia', 2.7456, 101.7099],
  ['PEN', 'Penang', 'Malaysia', 5.2971, 100.2768],
  ['BKI', 'Kota Kinabalu', 'Malaysia', 5.9372, 116.051],
  ['KCH', 'Kuching', 'Malaysia', 1.4847, 110.3469],
  ['LGK', 'Langkawi', 'Malaysia', 6.3297, 99.7287],
  ['JHB', 'Johor Bahru', 'Malaysia', 1.6413, 103.6697],
  ['SIN', 'Singapore', 'Singapore', 1.3644, 103.9915],
  ['BKK', 'Bangkok', 'Thailand', 13.69, 100.7501],
  ['DMK', 'Bangkok Don Mueang', 'Thailand', 13.9126, 100.6067],
  ['HKT', 'Phuket', 'Thailand', 8.1132, 98.3169],
  ['CNX', 'Chiang Mai', 'Thailand', 18.7668, 98.9626],
  // Rest of South-East Asia
  ['CGK', 'Jakarta', 'Indonesia', -6.1256, 106.6559],
  ['DPS', 'Bali', 'Indonesia', -8.7482, 115.1672],
  ['SUB', 'Surabaya', 'Indonesia', -7.3798, 112.7868],
  ['MNL', 'Manila', 'Philippines', 14.5086, 121.0194],
  ['CEB', 'Cebu', 'Philippines', 10.3075, 123.9794],
  ['SGN', 'Ho Chi Minh City', 'Vietnam', 10.8188, 106.652],
  ['HAN', 'Hanoi', 'Vietnam', 21.2212, 105.8072],
  ['DAD', 'Da Nang', 'Vietnam', 16.0439, 108.1994],
  ['PNH', 'Phnom Penh', 'Cambodia', 11.5466, 104.8441],
  ['REP', 'Siem Reap', 'Cambodia', 13.4107, 103.8128],
  ['RGN', 'Yangon', 'Myanmar', 16.9073, 96.1332],
  // North-East Asia
  ['NRT', 'Tokyo Narita', 'Japan', 35.7647, 140.3864],
  ['HND', 'Tokyo Haneda', 'Japan', 35.5494, 139.7798],
  ['KIX', 'Osaka', 'Japan', 34.432, 135.2304],
  ['ICN', 'Seoul', 'South Korea', 37.4602, 126.4407],
  // Australia and beyond
  ['SYD', 'Sydney', 'Australia', -33.9399, 151.1772],
  ['MEL', 'Melbourne', 'Australia', -37.669, 144.841],
  ['PER', 'Perth', 'Australia', -31.9403, 115.967],
  ['DXB', 'Dubai', 'United Arab Emirates', 25.2532, 55.3657],
  ['DOH', 'Doha', 'Qatar', 25.2731, 51.6081],
  ['LHR', 'London', 'United Kingdom', 51.47, -0.4543],
];

export const AIRPORTS: Airport[] = RAW.map(([code, city, country, lat, lon]) => ({ code, city, country, lat, lon }));
const BY_CODE = new Map(AIRPORTS.map((a) => [a.code, a]));

export const airportByCode = (code: string): Airport | undefined => BY_CODE.get(code.trim().toUpperCase());

/** Airports matching what someone typed: by code, city or country, best matches first. */
export function searchAirports(text: string, limit = 6): Airport[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<[number, Airport]> = [];
  for (const a of AIRPORTS) {
    const code = a.code.toLowerCase();
    const city = a.city.toLowerCase();
    const country = a.country.toLowerCase();
    let score = -1;
    if (code === q) score = 0;
    else if (code.startsWith(q)) score = 1;
    else if (city.startsWith(q)) score = 2;
    else if (city.includes(q)) score = 3;
    else if (country.startsWith(q)) score = 4;
    if (score >= 0) scored.push([score, a]);
  }
  return scored.sort((x, y) => x[0] - y[0] || x[1].city.localeCompare(y[1].city)).slice(0, limit).map(([, a]) => a);
}

/** The 3-letter code for whatever was typed: a code as typed, or the best city match. Empty when there is no match. */
export function resolveAirport(text: string): string {
  const t = text.trim();
  if (/^[A-Za-z]{3}$/.test(t)) return t.toUpperCase();
  return searchAirports(t, 1)[0]?.code ?? '';
}
