/**
 * Seats: guests who did not pick a seat when booking can choose one in WingMate, and see where their travel mates
 * are sitting, so friends can sit together. The cabin is an A320 like most of AirAsia's fleet: rows 1 to 31, seats
 * A to F, with an aisle between C and D. In this prototype other passengers' seats are simulated (the same for
 * everyone on a flight); in the live version both would come from, and be saved to, the AirAsia booking.
 */
export const ROWS = 31;
export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
/** Rows with extra legroom (the front of the cabin and the over-wing exits), sold as Hot Seats. */
export const HOT_ROWS = [1, 2, 3, 4, 5, 12, 13];

export const validSeat = (seat: unknown): seat is string =>
  typeof seat === 'string' && /^([1-9]|[12][0-9]|3[01])[A-F]$/.test(seat);

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seats other passengers already hold on this flight (simulated, about a third of the cabin). */
export function simulatedTaken(flightKey: string): string[] {
  const out: string[] = [];
  for (let r = 1; r <= ROWS; r++) {
    for (const l of LETTERS) {
      const seat = `${r}${l}`;
      if (hash(`${flightKey}|${seat}`) % 100 < 34) out.push(seat);
    }
  }
  return out;
}
