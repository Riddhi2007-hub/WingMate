/**
 * Flight stages and the 48-hour chat window. Pure functions, shared by the server (which enforces the
 * rules) and the browser (which only displays them).
 */
export const HOUR_MS = 3_600_000;
export const CHAT_WINDOW_HOURS = 48;

export type Stage = 'pre' | 'in' | 'landed' | 'closed';

export interface FlightTimes {
  /** Unix ms */
  departsAt: number;
  /** Unix ms */
  landsAt: number;
}

/** Before departure, in the air, landed (chat still open), or closed 48 hours after landing. */
export function stageOf(flight: FlightTimes, now: number): Stage {
  if (now < flight.departsAt) return 'pre';
  if (now < flight.landsAt) return 'in';
  if (now < flight.landsAt + CHAT_WINDOW_HOURS * HOUR_MS) return 'landed';
  return 'closed';
}

/** When chats for this flight close (Unix ms). */
export const chatClosesAt = (flight: FlightTimes): number => flight.landsAt + CHAT_WINDOW_HOURS * HOUR_MS;

/** Per-conversation view of the window, sent from the server with each connection. */
export interface ChatWindow {
  stage: Stage;
  closed: boolean;
  /** Unix ms; null when the flight has not landed yet. */
  closesAt: number | null;
}

export function chatWindow(flight: FlightTimes, now: number): ChatWindow {
  const stage = stageOf(flight, now);
  return { stage, closed: stage === 'closed', closesAt: stage === 'landed' || stage === 'closed' ? chatClosesAt(flight) : null };
}
