/**
 * Games: practise on your own, or play Hangman and Scribble with a connected travel mate. Playing together always
 * starts with an invitation; the game begins only when the other person accepts it. Each round has a clock (90 s for
 * Hangman, 80 s for Scribble). Scribble is laid out like the real game: players and scores on the left, the canvas
 * in the middle, guesses on the right, and the word as blanks that fill in a little as time runs out.
 * While a game is open on this tab the page asks the server for updates every 1.5 seconds.
 */
import { $, $$, closest, esc } from '../../shared/dom';
import { ApiError, api } from '../../shared/api';
import { findPerson } from '../data';
import { HANGMAN_PARTS, HANGMAN_WORDS, SCRIBBLE_WORDS } from '../data';
import { getGames, onGames, putGame, setGames, type GameDto, type StrokeDto } from '../gamestate';
import { nowMs, state } from '../state';
import { connectedPeople, toast } from '../ui';

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;
const nameOf = (id: string): string => (findPerson(id)?.name ?? 'Your travel mate').split(' ')[0] ?? 'Your travel mate';
const GAME_NAME = { hangman: 'Hangman', scribble: 'Scribble' } as const;
const isOpen = (g: GameDto): boolean => g.status === 'invited' || g.status === 'active';
const PRACTICE_LIMIT = { hang: 90_000, scribble: 80_000 } as const;

/** The live game shown on the boards (null = practising alone). */
let currentId: number | null = null;
let tab: 'hang' | 'scribble' = 'hang';

const current = (): GameDto | undefined => {
  const g = getGames().find((x) => x.id === currentId);
  return g && g.status === 'active' ? g : undefined;
};

async function send<T extends { game?: GameDto }>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await api<T>('POST', path, body);
    if (res.game) putGame(res.game);
    return res;
  } catch (error: unknown) {
    toast(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
    if (error instanceof ApiError && error.status === 409) void refreshGames();
    if (error instanceof ApiError && error.status === 400) void refreshGames();
    return null;
  }
}

async function refreshGames(): Promise<void> {
  try {
    const res = await api<{ games: GameDto[] }>('GET', '/api/games');
    setGames(res.games);
  } catch {
    /* the next poll tries again */
  }
}

const move = (m: Record<string, unknown>): void => {
  const g = current();
  if (g) void send('/api/games/move', { id: g.id, move: m });
};

/* ============================== the clock ============================== */

function paintClock(el: HTMLElement, label: HTMLElement, endsAt: number | null, idle = 0): number {
  if (endsAt === 0) {
    // not started yet: show the full time
    label.textContent = String(Math.round(idle / 1000));
    el.classList.remove('off', 'low');
    return idle;
  }
  if (endsAt === null) {
    el.classList.add('off');
    el.classList.remove('low');
    return 0;
  }
  const left = Math.max(0, Math.ceil((endsAt - nowMs()) / 1000));
  label.textContent = String(left);
  el.classList.remove('off');
  el.classList.toggle('low', left > 0 && left <= 10);
  return left;
}

/* ============================== Hangman ============================== */

const MAX_WRONG = 6;
let word = '';
let guessed: string[] = [];
let wrong = 0;
let hangEndsAt = 0;
let hangTimedOut = false;

function newHangman(): void {
  word = pick(HANGMAN_WORDS);
  guessed = [];
  wrong = 0;
  hangEndsAt = 0; // the practice clock starts with the first guess
  hangTimedOut = false;
  renderHangman();
}

function drawKeys(used: string[], hits: (c: string) => boolean, disabled: boolean): void {
  $('#hangKeys').innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    .split('')
    .map((c) => {
      const u = used.includes(c);
      const cls = u ? (hits(c) ? 'hit' : 'miss') : '';
      return `<button class="${cls}" data-key="${c}" ${u || disabled ? 'disabled' : ''} aria-label="Letter ${c}">${c}</button>`;
    })
    .join('');
}

function renderHangman(): void {
  const g = current();
  const againWord = $<HTMLInputElement>('#hangAgainWord');
  if (g?.hangman) {
    const h = g.hangman;
    const them = nameOf(g.with);
    $('#hangScore').innerHTML = `Round ${h.round} · You <b>${h.scores.me}</b> · ${esc(them)} <b>${h.scores.them}</b>`;
    $('#hangParts').innerHTML = HANGMAN_PARTS.slice(0, h.wrong).join('');
    $('#hangWord').innerHTML = h.mask.map((c) => `<span>${esc(c)}</span>`).join('');
    const left = `Wrong guesses left: ${h.max - h.wrong}`;
    $('#hangInfo').textContent = h.setterIsMe ? `${them} is guessing your word ${h.word ?? ''}. ${left}` : `Guess ${them}’s word before the clock runs out. ${left}`;
    const result = $('#hangResult');
    const iWon = (h.result === 'won') !== h.setterIsMe;
    result.className = 'result ' + (h.result ? (iWon ? 'win' : 'lose') : '');
    result.textContent = !h.result
      ? ''
      : h.result === 'won'
        ? h.setterIsMe ? `${them} got it!` : 'You got it. Well done!'
        : h.result === 'timeout'
          ? `Time’s up! The word was ${h.word ?? ''}.`
          : h.setterIsMe ? `${them} ran out of guesses. You win this round!` : `Out of guesses. The word was ${h.word ?? ''}.`;
    drawKeys(h.guessed, (c) => (h.word ? h.word.includes(c) : h.mask.includes(c)), h.setterIsMe || !!h.result);
    const button = $('#hangNew');
    button.hidden = !h.result;
    button.textContent = 'Play again (swap roles)';
    // next round: whoever just guessed sets the word
    againWord.hidden = !h.result || h.setterIsMe;
    tickClocks();
    return;
  }
  againWord.hidden = true;
  $('#hangScore').textContent = 'Practice';
  $('#hangNew').hidden = false;
  $('#hangNew').textContent = 'New word';
  const won = [...word].every((c) => guessed.includes(c));
  const lost = wrong >= MAX_WRONG || hangTimedOut;
  $('#hangParts').innerHTML = HANGMAN_PARTS.slice(0, hangTimedOut ? MAX_WRONG : wrong).join('');
  $('#hangWord').innerHTML = [...word].map((c) => `<span>${guessed.includes(c) || lost ? c : ''}</span>`).join('');
  $('#hangInfo').textContent = `Practice round. Wrong guesses left: ${MAX_WRONG - wrong}`;
  const result = $('#hangResult');
  result.className = 'result ' + (won ? 'win' : lost ? 'lose' : '');
  result.textContent = won ? 'You got it. Well done!' : hangTimedOut ? `Time’s up! The word was ${word}.` : lost ? 'Out of guesses. Try another word.' : '';
  drawKeys(guessed, (c) => word.includes(c), won || lost);
  tickClocks();
}

/* ============================== Scribble ============================== */

interface Stroke {
  color: string;
  size: number;
  pts: Array<[number, number]>;
}

/** A palette like the real game's: two rows of bright and dark colours. */
const PALETTE = [
  '#ffffff', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00b2ff', '#231fd3', '#a300ba', '#d37caa', '#a0522d',
  '#000000', '#4c4c4c', '#740b07', '#c23800', '#e8a200', '#005510', '#00569e', '#0e0865', '#550069', '#a75574', '#63300d',
];
const SIZES = [4, 10, 20, 36];
const PAD_BG = '#ffffff';

let strokes: Stroke[] = [];
let drawing: Stroke | null = null;
let brushColor = '#000000';
let brushSize = 10;
let eraser = false;
let practiceWord = '';
let scrEndsAt = 0;
let scrTimedOut = false;

const fromDto = (s: StrokeDto): Stroke => {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < s.p.length; i += 2) pts.push([s.p[i] ?? 0, s.p[i + 1] ?? 0]);
  return { color: s.c, size: s.s, pts };
};

function redrawPad(): void {
  const canvas = $<HTMLCanvasElement>('#pad');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const g = current();
  const list = g?.scribble ? g.scribble.strokes.map(fromDto) : strokes;
  const all = drawing && g ? [...list, drawing] : list;
  ctx.fillStyle = PAD_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of all) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    stroke.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    const first = stroke.pts[0];
    if (stroke.pts.length === 1 && first) ctx.lineTo(first[0] + 0.1, first[1]); // a single tap draws a dot
    ctx.stroke();
  }
}

function newScribble(): void {
  practiceWord = pick(SCRIBBLE_WORDS);
  strokes = [];
  scrEndsAt = 0; // the practice clock starts with the first line
  scrTimedOut = false;
  renderScribble();
}

/** The word line: blanks with the letter count for the guesser, the word itself for the drawer. */
function wordLine(letters: string[] | null, plain: string | null): string {
  if (plain !== null) return `<span class="plain">${esc(plain)}</span>`;
  if (!letters) return '';
  const count = letters.filter((c) => c !== ' ').length;
  return `${letters.map((c) => (c === ' ' ? '<span class="gap"></span>' : `<span class="ch">${esc(c) || '&nbsp;'}</span>`)).join('')}<sup>${count}</sup>`;
}

function renderScribble(): void {
  const g = current();
  const s = g?.scribble;
  const canDraw = !g || !!(s?.drawerIsMe && !s.result);
  $('#pad').classList.toggle('readonly', !canDraw);
  $<HTMLElement>('#game-scribble .skr-tools').hidden = !canDraw;
  const overlay = $('#scrOverlay');
  const guessBox = $<HTMLInputElement>('#scrGuessInput');

  if (g && s) {
    const them = nameOf(g.with);
    $('#scrRound').textContent = `Round ${s.round}`;
    $('#scrWordLine').innerHTML = s.drawerIsMe ? wordLine(null, `Draw: ${s.word ?? ''}`) : s.result ? wordLine(null, s.word ?? '') : wordLine(s.hint ?? Array.from({ length: s.length }, () => ''), null);
    const guessedIt = s.result === 'won';
    $('#scrPlayers').innerHTML = [
      { name: 'You', me: true, score: s.scores.me, drawer: s.drawerIsMe },
      { name: them, me: false, score: s.scores.them, drawer: !s.drawerIsMe },
    ]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => `<div class="skr-p ${p.me ? 'me' : ''} ${guessedIt && !p.drawer ? 'got' : ''}"><span class="rk">#${i + 1}</span><span><b>${esc(p.me ? 'You' : p.name)}</b><small>${p.score} points</small></span><span class="ic" title="${p.drawer ? 'Drawing' : 'Guessing'}">${p.drawer ? '&#9999;&#65039;' : ''}</span></div>`)
      .join('');
    const lines = [`<div class="sys">${s.drawerIsMe ? 'You are drawing now.' : `${esc(them)} is drawing now.`}</div>`];
    for (const x of s.guesses) {
      const who = x.mine ? 'You' : them;
      lines.push(x.ok ? `<div class="ok">${esc(who)} guessed the word!</div>` : `<div><b>${esc(who)}:</b> ${esc(x.text)}</div>`);
    }
    if (s.result === 'timeout') lines.push(`<div class="sys">Time’s up! The word was ${esc(s.word ?? '')}.</div>`);
    if (s.result === 'revealed') lines.push(`<div class="sys">${esc(them)} gave up. The word was ${esc(s.word ?? '')}.</div>`);
    const box = $('#scrGuesses');
    box.innerHTML = lines.join('');
    box.scrollTop = box.scrollHeight;
    guessBox.disabled = s.drawerIsMe || !!s.result;
    guessBox.placeholder = s.drawerIsMe ? 'You are drawing' : s.result ? 'Round over' : 'Type your guess';
    overlay.hidden = !s.result;
    if (s.result) {
      const title = s.result === 'won' ? (s.drawerIsMe ? `${them} guessed it!` : 'You guessed it!') : s.result === 'timeout' ? 'Time’s up!' : 'Round over';
      overlay.innerHTML = `<div>${esc(title)}<small>The word was ${esc(s.word ?? '')}. Scores: you ${s.scores.me}, ${esc(them)} ${s.scores.them}.</small></div>`;
    }
    $('#scrHint').textContent = s.drawerIsMe ? 'Draw the word without writing letters. Every line you finish appears on their screen.' : 'Type guesses on the right. Letters appear in the blanks as time runs out.';
    const button = $('#scrNew');
    button.hidden = !s.drawerIsMe && !s.result;
    button.textContent = s.result ? 'Next round (swap roles)' : 'Give up';
  } else {
    $('#scrRound').textContent = 'Practice';
    $('#scrWordLine').innerHTML = wordLine(null, `Draw: ${practiceWord}`);
    $('#scrPlayers').innerHTML = `<div class="skr-p me"><span class="rk">#1</span><span><b>You</b><small>Practice</small></span><span class="ic">&#9999;&#65039;</span></div>`;
    $('#scrGuesses').innerHTML = `<div class="sys">Practising on your own. Invite a travel mate above to play for real: they guess here.</div>`;
    guessBox.disabled = true;
    guessBox.placeholder = 'Play a real game to guess';
    overlay.hidden = !scrTimedOut;
    if (scrTimedOut) overlay.innerHTML = `<div>Time’s up!<small>Press New word to draw again.</small></div>`;
    $('#scrHint').textContent = 'Practice: draw the word before the clock runs out.';
    $('#scrNew').hidden = false;
    $('#scrNew').textContent = 'New word';
  }
  tickClocks();
  redrawPad();
}

function paintTools(): void {
  for (const b of $$<HTMLButtonElement>('#scrColors button')) b.setAttribute('aria-pressed', String(!eraser && b.dataset.color === brushColor));
  for (const b of $$<HTMLButtonElement>('#scrSizes button')) b.setAttribute('aria-pressed', String(Number(b.dataset.size) === brushSize));
  $('#scrEraser').setAttribute('aria-pressed', String(eraser));
}

function setupPad(): void {
  $('#scrColors').innerHTML = PALETTE.map((hex) => `<button type="button" style="background:${hex}" data-color="${hex}" aria-label="Colour ${hex}"></button>`).join('');
  $('#scrSizes').innerHTML = SIZES.map((n) => `<button type="button" data-size="${n}" aria-label="Brush size ${n}"><i style="width:${Math.max(4, n / 1.6)}px;height:${Math.max(4, n / 1.6)}px"></i></button>`).join('');
  paintTools();

  const canvas = $<HTMLCanvasElement>('#pad');
  const position = (e: PointerEvent): [number, number] => {
    const box = canvas.getBoundingClientRect();
    return [((e.clientX - box.left) * canvas.width) / box.width, ((e.clientY - box.top) * canvas.height) / box.height];
  };
  const canDraw = (): boolean => {
    const g = current();
    if (!g) return !scrTimedOut;
    return !!(g.scribble?.drawerIsMe && !g.scribble.result);
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!canDraw()) return;
    canvas.setPointerCapture(e.pointerId);
    drawing = { color: eraser ? PAD_BG : brushColor, size: eraser ? Math.max(brushSize, 20) : brushSize, pts: [position(e)] };
    if (!current()) {
      strokes.push(drawing);
      if (!scrEndsAt) scrEndsAt = nowMs() + PRACTICE_LIMIT.scribble;
    }
    redrawPad();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    drawing.pts.push(position(e));
    redrawPad();
  });
  const endStroke = (): void => {
    const done = drawing;
    drawing = null;
    const g = current();
    if (done && g) {
      // send the finished line; thin out very long ones so they stay small
      const step = Math.max(1, Math.ceil(done.pts.length / 500));
      const pts = done.pts.filter((_, i) => i % step === 0 || i === done.pts.length - 1);
      const p = pts.flatMap(([x, y]) => [Math.round(x), Math.round(y)]);
      if (p.length === 2) p.push((p[0] ?? 0) + 1, p[1] ?? 0);
      const s = g.scribble;
      if (s) s.strokes = [...s.strokes, { c: done.color, s: done.size, p }]; // show it straight away
      move({ stroke: { c: done.color, s: done.size, p } });
    }
    redrawPad();
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  $('#scrColors').addEventListener('click', (event) => {
    const button = closest(event, '[data-color]');
    if (!button?.dataset.color) return;
    brushColor = button.dataset.color;
    eraser = false;
    paintTools();
  });
  $('#scrSizes').addEventListener('click', (event) => {
    const button = closest(event, '[data-size]');
    if (!button?.dataset.size) return;
    brushSize = Number(button.dataset.size);
    paintTools();
  });
  $('#scrEraser').addEventListener('click', () => {
    eraser = !eraser;
    paintTools();
  });
  $('#scrUndo').addEventListener('click', () => {
    if (current()) return move({ undo: true });
    strokes.pop();
    redrawPad();
  });
  $('#scrClear').addEventListener('click', () => {
    if (current()) return move({ clear: true });
    strokes = [];
    redrawPad();
  });
  $('#scrNew').addEventListener('click', () => {
    const g = current();
    if (!g?.scribble) return newScribble();
    move(g.scribble.result ? { again: true } : { reveal: true });
  });
  $('#scrGuess').addEventListener('submit', (event) => {
    event.preventDefault();
    const box = $<HTMLInputElement>('#scrGuessInput');
    const text = box.value.trim();
    if (!text || box.disabled) return;
    box.value = '';
    move({ guess: text });
  });
}

/** Updates both clocks every quarter second. When a live round's time is up, asks the server for the result. */
let askedAt = 0;
function tickClocks(): void {
  const g = current();
  const hangLive = g?.hangman;
  const scrLive = g?.scribble;
  // Hangman
  if (hangLive) {
    const left = paintClock($('#hangClock'), $('#hangTime'), hangLive.result ? null : hangLive.endsAt);
    if (!hangLive.result && left === 0 && Date.now() - askedAt > 2500) {
      askedAt = Date.now();
      void refreshGames();
    }
  } else {
    const done = [...word].every((c) => guessed.includes(c)) || wrong >= MAX_WRONG || hangTimedOut;
    const left = paintClock($('#hangClock'), $('#hangTime'), done ? null : hangEndsAt, PRACTICE_LIMIT.hang);
    if (!done && hangEndsAt && left === 0) {
      hangTimedOut = true;
      renderHangman();
    }
  }
  // Scribble
  if (scrLive) {
    const left = paintClock($('#scrClock'), $('#scrTime'), scrLive.result ? null : scrLive.endsAt);
    if (!scrLive.result && left === 0 && Date.now() - askedAt > 2500) {
      askedAt = Date.now();
      void refreshGames();
    }
  } else {
    const left = paintClock($('#scrClock'), $('#scrTime'), scrTimedOut ? null : scrEndsAt, PRACTICE_LIMIT.scribble);
    if (!scrTimedOut && scrEndsAt && left === 0) {
      scrTimedOut = true;
      renderScribble();
    }
  }
}

/* ============================== invitations and the list of games ============================== */

let centerKey = '';

function renderCenter(): void {
  const games = getGames();
  const people = connectedPeople();
  // only redraw when something changed, so a half-typed invite is not wiped by the regular updates
  const key = JSON.stringify([games.map((g) => [g.id, g.status]), people.map((p) => p.id), currentId, tab]);
  if (key === centerKey) return;
  centerKey = key;
  const rows: string[] = [];
  for (const g of games) {
    const them = esc(nameOf(g.with));
    const game = GAME_NAME[g.kind];
    if (g.status === 'invited' && !g.invitedByMe) {
      rows.push(`<div class="gc-row invite"><div class="nm"><b>${them} wants to play ${game} with you</b><span>Accept to start. They will see your answer.</span></div><button class="btn sm" data-g-accept="${g.id}">Accept</button><button class="btn sm ghost" data-g-decline="${g.id}">Decline</button></div>`);
    } else if (g.status === 'invited') {
      rows.push(`<div class="gc-row"><div class="nm"><b>Waiting for ${them} to accept</b><span>You invited them to play ${game}.</span></div><button class="btn sm ghost" data-g-end="${g.id}">Cancel invite</button></div>`);
    } else if (g.status === 'active') {
      const here = g.id === currentId;
      rows.push(`<div class="gc-row"><div class="nm"><b>${game} with ${them}</b><span>${here ? 'Playing now, below.' : 'In progress.'}</span></div>${here ? '' : `<button class="btn sm" data-g-open="${g.id}">Open game</button>`}<button class="btn sm ghost" data-g-end="${g.id}">End game</button></div>`);
    } else if (g.status === 'declined' && g.invitedByMe) {
      rows.push(`<div class="gc-row"><div class="nm"><b>${them} can’t play ${game} right now</b><span>They declined your invite.</span></div></div>`);
    }
  }
  const busy = new Set(games.filter(isOpen).map((g) => g.with));
  const free = people.filter((p) => !busy.has(p.id));
  const form = !people.length
    ? '<p class="muted small">Connect with someone on your flight to play together. Until then, practise below.</p>'
    : !free.length
      ? ''
      : `<form class="gc-form" id="gcForm"><div class="fld"><label class="lbl" for="gcWho">Invite</label><select id="gcWho">${free.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div><div class="fld"><label class="lbl" for="gcKind">Game</label><select id="gcKind"><option value="hangman"${tab === 'hang' ? ' selected' : ''}>Hangman</option><option value="scribble"${tab === 'scribble' ? ' selected' : ''}>Scribble</option></select></div><div class="fld word" id="gcWordFld"${tab === 'hang' ? '' : ' hidden'}><label class="lbl" for="gcWord">Secret word (optional)</label><input type="text" id="gcWord" maxlength="14" placeholder="Random if empty"></div><button class="btn" type="submit">Send invite</button></form>`;
  $('#gameCenter').innerHTML = `<div class="card-head" style="margin-bottom:0"><div><h2>Play with a travel mate</h2><p class="muted small">They get an invite first, and the game starts only if they accept. Each round is against the clock.</p></div></div>${rows.join('')}${form}`;
}

function renderLiveBar(): void {
  const g = current();
  const bar = $('#liveBar');
  bar.hidden = !g;
  if (!g) return;
  bar.innerHTML = `<span class="live-dot"></span><span class="grow">Live: ${GAME_NAME[g.kind]} with ${esc(nameOf(g.with))}</span><button class="btn sm" type="button" data-g-practice>Practise alone</button><button class="btn sm" type="button" data-g-end="${g.id}">End game</button>`;
}

function showTab(next: 'hang' | 'scribble'): void {
  tab = next;
  $('#tabHang').setAttribute('aria-selected', String(tab === 'hang'));
  $('#tabScribble').setAttribute('aria-selected', String(tab === 'scribble'));
  $('#game-hang').hidden = tab !== 'hang';
  $('#game-scribble').hidden = tab !== 'scribble';
}

function openGame(id: number | null): void {
  currentId = id;
  const g = current();
  if (g) showTab(g.kind === 'hangman' ? 'hang' : 'scribble');
  renderGames();
}

/** Everything on the Games tab. */
export function renderGames(): void {
  if (currentId !== null && !current()) currentId = null;
  // the game being played must be on the visible tab, otherwise show practice there
  const g = current();
  if (g && (g.kind === 'hangman') !== (tab === 'hang')) currentId = null;
  renderCenter();
  renderLiveBar();
  renderHangman();
  renderScribble();
}

/** Kept for the router: the Games tab renders through this. */
export const renderPlayWith = renderGames;

function updateDot(): void {
  const n = getGames().filter((g) => g.status === 'invited' && !g.invitedByMe).length;
  const dot = $('#gamesDot');
  dot.hidden = n === 0;
  dot.textContent = String(n);
}

export function initGames(): void {
  setupPad();
  newHangman();
  newScribble();
  showTab('hang');

  $('#hangNew').addEventListener('click', () => {
    const g = current();
    if (!g?.hangman) return newHangman();
    const w = $<HTMLInputElement>('#hangAgainWord');
    const text = w.value.trim();
    w.value = '';
    move(text ? { again: true, word: text } : { again: true });
  });

  document.addEventListener('submit', (event) => {
    const form = event.target as HTMLElement;
    if (form.id !== 'gcForm') return;
    event.preventDefault();
    const to = $<HTMLSelectElement>('#gcWho').value;
    const kind = $<HTMLSelectElement>('#gcKind').value;
    const wordText = (document.querySelector<HTMLInputElement>('#gcWord')?.value ?? '').trim();
    void send<{ game?: GameDto }>('/api/games', { to, kind, ...(kind === 'hangman' && wordText ? { word: wordText } : {}) }).then((res) => {
      if (res) toast(`Invite sent. The game starts when ${nameOf(to)} accepts.`);
    });
  });
  document.addEventListener('change', (event) => {
    if ((event.target as HTMLElement).id === 'gcKind') {
      const fld = document.getElementById('gcWordFld');
      if (fld) fld.hidden = $<HTMLSelectElement>('#gcKind').value !== 'hangman';
    }
  });

  document.addEventListener('click', (event) => {
    const key = closest<HTMLButtonElement>(event, '[data-key]');
    if (key?.dataset.key) {
      const letter = key.dataset.key;
      if (current()) {
        move({ letter });
        return;
      }
      if (!hangEndsAt) hangEndsAt = nowMs() + PRACTICE_LIMIT.hang;
      if (!guessed.includes(letter) && !hangTimedOut) {
        guessed.push(letter);
        if (!word.includes(letter)) wrong++;
        renderHangman();
      }
      return;
    }
    const t = closest(event, '[data-game]');
    if (t) {
      showTab(t.dataset.game === 'scribble' ? 'scribble' : 'hang');
      // jump into the live game of this kind, if there is one
      const live = getGames().find((g) => g.status === 'active' && (g.kind === 'hangman') === (tab === 'hang'));
      currentId = live?.id ?? null;
      renderGames();
      return;
    }
    const el = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-g-accept],[data-g-decline],[data-g-end],[data-g-open],[data-g-practice]') : null;
    if (!el) return;
    if (el.dataset.gAccept) {
      const id = Number(el.dataset.gAccept);
      void send('/api/games/respond', { id, accept: true }).then((res) => res && openGame(id));
    } else if (el.dataset.gDecline) {
      void send('/api/games/respond', { id: Number(el.dataset.gDecline), accept: false }).then((res) => res && toast('Invite declined'));
    } else if (el.dataset.gEnd) {
      const id = Number(el.dataset.gEnd);
      void send('/api/games/end', { id }).then(async () => {
        if (currentId === id) currentId = null;
        await refreshGames();
      });
    } else if (el.dataset.gOpen) {
      openGame(Number(el.dataset.gOpen));
    } else if ('gPractice' in el.dataset) {
      openGame(null);
    }
  });

  // tell people about invitations and answers, wherever they are in the app
  onGames((previous) => {
    for (const g of getGames()) {
      const before = previous.find((x) => x.id === g.id);
      const them = nameOf(g.with);
      if (!before && g.status === 'invited' && !g.invitedByMe) toast(`${them} invited you to play ${GAME_NAME[g.kind]}. Open Games to accept.`);
      if (before?.status === 'invited' && g.status === 'active' && g.invitedByMe) {
        toast(`${them} accepted. Your ${GAME_NAME[g.kind]} game has started!`);
        if (state.currentView === 'games' && currentId === null) {
          currentId = g.id;
          showTab(g.kind === 'hangman' ? 'hang' : 'scribble');
        }
      }
      if (before?.status === 'invited' && g.status === 'declined' && g.invitedByMe) toast(`${them} declined your ${GAME_NAME[g.kind]} invite.`);
      if (before?.status === 'active' && g.status === 'done' && g.id === currentId) toast(`${them} ended the game.`);
    }
    updateDot();
    if (state.currentView === 'games' && !drawing) renderGames();
  });

  // while a game or an invitation is open on this tab, check for moves often
  window.setInterval(() => {
    if (state.currentView === 'games' && !document.hidden && getGames().some(isOpen)) void refreshGames();
  }, 1500);
  window.setInterval(() => {
    if (state.currentView === 'games' && !document.hidden) tickClocks();
  }, 250);
}
