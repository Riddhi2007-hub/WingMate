/** The two-player games and invitations the server knows about (filled in by sync.ts and by the Games tab). */

export interface HangmanView {
  setterIsMe: boolean;
  word: string | null;
  mask: string[];
  guessed: string[];
  wrong: number;
  max: number;
  round: number;
  result: '' | 'won' | 'lost' | 'timeout';
  /** When the round's clock runs out (server time, ms). */
  endsAt: number;
  limit: number;
  scores: { me: number; them: number };
}

export interface StrokeDto {
  c: string;
  s: number;
  p: number[];
}

export interface ScribbleView {
  drawerIsMe: boolean;
  word: string | null;
  length: number;
  strokes: StrokeDto[];
  guesses: Array<{ mine: boolean; text: string; ok: boolean }>;
  round: number;
  result: '' | 'won' | 'revealed' | 'timeout';
  endsAt: number;
  limit: number;
  scores: { me: number; them: number };
  /** For the guesser: one entry per letter, '' while hidden (a letter or two is given away as time runs out). */
  hint: string[] | null;
}

export interface GameDto {
  id: number;
  kind: 'hangman' | 'scribble';
  status: 'invited' | 'active' | 'declined' | 'done' | 'cancelled';
  /** The other player's id. */
  with: string;
  invitedByMe: boolean;
  version: number;
  updatedAt: number;
  hangman?: HangmanView;
  scribble?: ScribbleView;
}

let games: GameDto[] = [];
const listeners: Array<(previous: GameDto[]) => void> = [];

export const getGames = (): GameDto[] => games;

/** Replaces the list. A game the page already has in a newer version is kept, so a slow answer cannot undo a move. */
export function setGames(next: GameDto[]): void {
  const previous = games;
  games = next.map((g) => {
    const old = previous.find((x) => x.id === g.id);
    return old && old.version > g.version ? old : g;
  });
  for (const fn of listeners) fn(previous);
}

/** Puts one updated game into the list (from the answer to a move). */
export function putGame(game: GameDto): void {
  setGames([game, ...games.filter((g) => g.id !== game.id)]);
}

export function onGames(fn: (previous: GameDto[]) => void): void {
  listeners.push(fn);
}
