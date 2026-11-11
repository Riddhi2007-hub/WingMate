/**
 * Two-player games between connected travel mates. A game starts as an invitation and only begins once the other
 * person accepts it. The server keeps the game state, checks every move, and never shows the secret word to the
 * person who has to guess it.
 *
 * Hangman: one player sets a word (or gets a random one), the other guesses letters. Six wrong guesses and it is over.
 * Scribble: one player draws a random word, the other types guesses. Each new round swaps the roles.
 */
import { bad } from './http';

export type Kind = 'hangman' | 'scribble';
export const KINDS: readonly Kind[] = ['hangman', 'scribble'];
export type Status = 'invited' | 'active' | 'declined' | 'done' | 'cancelled';

export interface GameRow {
  id: number;
  kind: Kind;
  from_id: number;
  to_id: number;
  status: Status;
  state: string;
  version: number;
  created_at: number;
  updated_at: number;
}

const HANGMAN_WORDS = ['AIRPORT', 'SUITCASE', 'BOARDING', 'JETLAG', 'PASSPORT', 'LAYOVER', 'SOUVENIR', 'TURBULENCE', 'ITINERARY', 'WINDOW', 'LUGGAGE', 'DEPARTURE', 'RUNWAY', 'TICKET', 'BEACH', 'TEMPLE'];
const SCRIBBLE_WORDS = ['Suitcase', 'Airplane', 'Sunset', 'Noodles', 'Passport', 'Mountain', 'Umbrella', 'Temple', 'Taxi', 'Skyline', 'Camera', 'Beach', 'Pizza', 'Island', 'Bridge', 'Rainbow', 'Elephant', 'Volcano'];
const MAX_WRONG = 6;
const MAX_STROKES = 400;
const MAX_POINTS = 24000;
const PAD_W = 960;
const PAD_H = 540;

interface HangState {
  setter: number;
  word: string;
  guessed: string[];
  wrong: number;
  round: number;
  result: '' | 'won' | 'lost';
}
interface Stroke {
  c: string;
  s: number;
  p: number[];
}
interface ScribState {
  drawer: number;
  word: string;
  strokes: Stroke[];
  guesses: Array<{ by: number; text: string; ok: boolean }>;
  round: number;
  result: '' | 'won' | 'revealed';
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;
const other = (row: GameRow, me: number): number => (row.from_id === me ? row.to_id : row.from_id);

export function hangmanWord(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const word = String(raw).trim().toUpperCase();
  if (!/^[A-Z]{3,14}$/.test(word)) throw bad('Use one word of 3 to 14 letters, with no spaces or numbers.', 'word');
  return word;
}

/** The state when the invitation is accepted: the person who invited sets the word or draws first. */
export function initialState(kind: Kind, first: number, word: string | null): string {
  if (kind === 'hangman') {
    const s: HangState = { setter: first, word: word ?? pick(HANGMAN_WORDS), guessed: [], wrong: 0, round: 1, result: '' };
    return JSON.stringify(s);
  }
  const s: ScribState = { drawer: first, word: pick(SCRIBBLE_WORDS), strokes: [], guesses: [], round: 1, result: '' };
  return JSON.stringify(s);
}

const norm = (t: string): string => t.toLowerCase().replace(/[^a-z]/g, '');

/** Checks and applies one move. Returns the new state, or throws a 400 with a friendly message. */
export function applyMove(row: GameRow, me: number, move: Record<string, unknown>): string {
  if (row.kind === 'hangman') {
    const s = JSON.parse(row.state) as HangState;
    if (move.again === true) {
      if (!s.result) throw bad('Finish this round first.');
      // roles swap: the person who guessed now sets the word
      const setter = s.setter === row.from_id ? row.to_id : row.from_id;
      const word = setter === me ? hangmanWord(move.word) : null;
      const next: HangState = { setter, word: word ?? pick(HANGMAN_WORDS), guessed: [], wrong: 0, round: s.round + 1, result: '' };
      return JSON.stringify(next);
    }
    if (s.result) throw bad('This round is over. Start a new one.');
    if (s.setter === me) throw bad('You set this word. Your travel mate is guessing.');
    const letter = String(move.letter ?? '').toUpperCase();
    if (!/^[A-Z]$/.test(letter)) throw bad('Pick a letter.');
    if (s.guessed.includes(letter)) return row.state;
    s.guessed.push(letter);
    if (!s.word.includes(letter)) s.wrong++;
    if ([...s.word].every((c) => s.guessed.includes(c))) s.result = 'won';
    else if (s.wrong >= MAX_WRONG) s.result = 'lost';
    return JSON.stringify(s);
  }

  const s = JSON.parse(row.state) as ScribState;
  if (move.again === true) {
    if (!s.result) throw bad('Finish this round first.');
    const drawer = s.drawer === row.from_id ? row.to_id : row.from_id;
    let word = pick(SCRIBBLE_WORDS);
    if (word === s.word) word = pick(SCRIBBLE_WORDS);
    const next: ScribState = { drawer, word, strokes: [], guesses: [], round: s.round + 1, result: '' };
    return JSON.stringify(next);
  }
  if (s.result) throw bad('This round is over. Start a new one.');
  const drawing = s.drawer === me;
  if (move.stroke !== undefined) {
    if (!drawing) throw bad('Only the person drawing can draw.');
    const st = move.stroke as Partial<Stroke>;
    const c = typeof st.c === 'string' && /^#[0-9a-fA-F]{6}$/.test(st.c) ? st.c : '#000000';
    const size = Math.max(1, Math.min(48, Number(st.s) || 6));
    const p = Array.isArray(st.p) ? st.p.slice(0, 1200).map((n, i) => Math.max(0, Math.min(i % 2 ? PAD_H : PAD_W, Math.round(Number(n) || 0)))) : [];
    if (p.length < 2 || p.length % 2) throw bad('That stroke was empty.');
    const total = s.strokes.reduce((n, x) => n + x.p.length, 0);
    if (s.strokes.length >= MAX_STROKES || total + p.length > MAX_POINTS * 2) throw bad('The canvas is full. Clear it to keep drawing.');
    s.strokes.push({ c, s: size, p });
    return JSON.stringify(s);
  }
  if (move.undo === true) {
    if (!drawing) throw bad('Only the person drawing can undo.');
    s.strokes.pop();
    return JSON.stringify(s);
  }
  if (move.clear === true) {
    if (!drawing) throw bad('Only the person drawing can clear.');
    s.strokes = [];
    return JSON.stringify(s);
  }
  if (move.reveal === true) {
    if (!drawing) throw bad('Only the person drawing can reveal the word.');
    s.result = 'revealed';
    return JSON.stringify(s);
  }
  if (move.guess !== undefined) {
    if (drawing) throw bad('You are drawing. Your travel mate guesses.');
    const text = String(move.guess).trim().slice(0, 40);
    if (!text) throw bad('Type a guess.');
    const okGuess = norm(text) === norm(s.word);
    s.guesses.push({ by: me, text, ok: okGuess });
    if (s.guesses.length > 60) s.guesses = s.guesses.slice(-60);
    if (okGuess) s.result = 'won';
    return JSON.stringify(s);
  }
  throw bad('Unknown move.');
}

/** What one player is allowed to see. */
export function gameDto(row: GameRow, me: number) {
  const base = {
    id: row.id,
    kind: row.kind,
    status: row.status,
    with: String(other(row, me)),
    invitedByMe: row.from_id === me,
    version: row.version,
    updatedAt: row.updated_at,
  };
  if (row.status !== 'active' && row.status !== 'done') return base;
  if (row.kind === 'hangman') {
    const s = JSON.parse(row.state) as HangState;
    const mine = s.setter === me;
    const over = s.result !== '' || row.status === 'done';
    return {
      ...base,
      hangman: {
        setterIsMe: mine,
        word: mine || over ? s.word : null,
        mask: [...s.word].map((c) => (s.guessed.includes(c) || over ? c : '')),
        guessed: s.guessed,
        wrong: s.wrong,
        max: MAX_WRONG,
        round: s.round,
        result: s.result,
      },
    };
  }
  const s = JSON.parse(row.state) as ScribState;
  const mine = s.drawer === me;
  const over = s.result !== '' || row.status === 'done';
  return {
    ...base,
    scribble: {
      drawerIsMe: mine,
      word: mine || over ? s.word : null,
      length: s.word.length,
      strokes: s.strokes,
      guesses: s.guesses.map((g) => ({ mine: g.by === me, text: g.text, ok: g.ok })),
      round: s.round,
      result: s.result,
    },
  };
}
