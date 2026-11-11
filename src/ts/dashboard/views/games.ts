/**
 * Games: practise on your own, or play Hangman and Scribble with a connected travel mate. Playing together always
 * starts with an invitation; the game begins only when the other person accepts it. While a game is open on this
 * tab the page asks the server for updates every 1.5 seconds.
 */
import { $, $$, closest, esc } from '../../shared/dom';
import { ApiError, api } from '../../shared/api';
import { findPerson } from '../data';
import { HANGMAN_PARTS, HANGMAN_WORDS, SCRIBBLE_COLORS, SCRIBBLE_WORDS } from '../data';
import { getGames, onGames, putGame, setGames, type GameDto, type StrokeDto } from '../gamestate';
import { state } from '../state';
import { connectedPeople, toast } from '../ui';

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;
const nameOf = (id: string): string => (findPerson(id)?.name ?? 'Your travel mate').split(' ')[0] ?? 'Your travel mate';
const GAME_NAME = { hangman: 'Hangman', scribble: 'Scribble' } as const;
const isOpen = (g: GameDto): boolean => g.status === 'invited' || g.status === 'active';

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

/* ============================== Hangman ============================== */

const MAX_WRONG = 6;
let word = '';
let guessed: string[] = [];
let wrong = 0;

function newHangman(): void {
  word = pick(HANGMAN_WORDS);
  guessed = [];
  wrong = 0;
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
    $('#hangParts').innerHTML = HANGMAN_PARTS.slice(0, h.wrong).join('');
    $('#hangWord').innerHTML = h.mask.map((c) => `<span>${esc(c)}</span>`).join('');
    const left = `Wrong guesses left: ${h.max - h.wrong}`;
    $('#hangInfo').textContent = h.setterIsMe ? `${them} is guessing your word ${h.word ?? ''}. ${left}` : `Guess ${them}’s word. ${left}`;
    const result = $('#hangResult');
    const won = h.result === 'won';
    result.className = 'result ' + (h.result ? (won === !h.setterIsMe ? 'win' : 'lose') : '');
    result.textContent = !h.result ? '' : won ? (h.setterIsMe ? `${them} got it!` : 'You got it. Well done!') : h.setterIsMe ? `${them} ran out of guesses. You win this round!` : `Out of guesses. The word was ${h.word ?? ''}.`;
    drawKeys(h.guessed, (c) => (h.word ? h.word.includes(c) : h.mask.includes(c)), h.setterIsMe || !!h.result);
    const button = $('#hangNew');
    button.hidden = !h.result;
    button.textContent = 'Play again (swap roles)';
    // next round: whoever just guessed sets the word
    againWord.hidden = !h.result || h.setterIsMe;
    return;
  }
  againWord.hidden = true;
  $('#hangNew').hidden = false;
  $('#hangNew').textContent = 'New word';
  const won = [...word].every((c) => guessed.includes(c));
  const lost = wrong >= MAX_WRONG;
  $('#hangParts').innerHTML = HANGMAN_PARTS.slice(0, wrong).join('');
  $('#hangWord').innerHTML = [...word].map((c) => `<span>${guessed.includes(c) || lost ? c : ''}</span>`).join('');
  $('#hangInfo').textContent = `Practice round. Wrong guesses left: ${MAX_WRONG - wrong}`;
  const result = $('#hangResult');
  result.className = 'result ' + (won ? 'win' : lost ? 'lose' : '');
  result.textContent = won ? 'You got it. Well done!' : lost ? 'Out of guesses. Try another word.' : '';
  drawKeys(guessed, (c) => word.includes(c), won || lost);
}

/* ============================== Scribble ============================== */

interface Stroke {
  color: string;
  size: number;
  pts: Array<[number, number]>;
}

let strokes: Stroke[] = [];
let drawing: Stroke | null = null;
let brushColor: string = SCRIBBLE_COLORS[1]?.[0] ?? '#000000';

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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  $('#scrWordLine').textContent = `Your word to draw: ${pick(SCRIBBLE_WORDS)}`;
  strokes = [];
  redrawPad();
}

function renderScribble(): void {
  const g = current();
  const canDraw = !g || !!g.scribble?.drawerIsMe;
  $('#pad').classList.toggle('readonly', !canDraw);
  $<HTMLElement>('#game-scribble .tools').hidden = !canDraw;
  if (g?.scribble) {
    const s = g.scribble;
    const them = nameOf(g.with);
    const line = $('#scrWordLine');
    if (s.result === 'won') line.textContent = s.drawerIsMe ? `${them} guessed it: ${s.word ?? ''}!` : `You got it: ${s.word ?? ''}!`;
    else if (s.result === 'revealed') line.textContent = `The word was ${s.word ?? ''}.`;
    else line.textContent = s.drawerIsMe ? `Draw: ${s.word ?? ''} (${them} is guessing)` : `Guess what ${them} is drawing (${s.length} letters)`;
    $<HTMLFormElement>('#scrGuess').hidden = s.drawerIsMe || !!s.result;
    $('#scrGuesses').innerHTML = s.guesses.map((x) => `<span class="${x.ok ? 'ok' : x.mine ? 'mine' : ''}">${x.ok ? '&#10003; ' : ''}${esc(x.text)}</span>`).join('');
    $('#scrHint').textContent = s.drawerIsMe ? 'Draw the word without writing it. Every line you finish appears on their screen.' : 'Type a guess and press Enter. You can guess as often as you like.';
    const button = $('#scrNew');
    button.hidden = !s.drawerIsMe && !s.result;
    button.textContent = s.result ? 'Play again (swap roles)' : 'Reveal the word';
  } else {
    $<HTMLFormElement>('#scrGuess').hidden = true;
    $('#scrGuesses').innerHTML = '';
    $('#scrHint').textContent = 'Practice round: draw the word without writing it.';
    $('#scrNew').hidden = false;
    $('#scrNew').textContent = 'New word';
  }
  redrawPad();
}

function setupPad(): void {
  $('#scrColors').innerHTML = SCRIBBLE_COLORS.map(
    ([hex, name]) =>
      `<button class="sw-btn" style="background:${hex}" data-color="${hex}" aria-label="${esc(name)}" aria-pressed="${hex === brushColor}"></button>`,
  ).join('');

  const canvas = $<HTMLCanvasElement>('#pad');
  const position = (e: PointerEvent): [number, number] => {
    const box = canvas.getBoundingClientRect();
    return [((e.clientX - box.left) * canvas.width) / box.width, ((e.clientY - box.top) * canvas.height) / box.height];
  };
  const canDraw = (): boolean => {
    const g = current();
    return !g || !!(g.scribble?.drawerIsMe && !g.scribble.result);
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!canDraw()) return;
    canvas.setPointerCapture(e.pointerId);
    drawing = { color: brushColor, size: Number($<HTMLInputElement>('#scrSize').value) * 1.6, pts: [position(e)] };
    if (!current()) strokes.push(drawing);
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
    for (const b of $$('#scrColors .sw-btn')) b.setAttribute('aria-pressed', String(b === button));
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
    if (!text) return;
    box.value = '';
    move({ guess: text });
  });
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
  $('#gameCenter').innerHTML = `<div class="card-head" style="margin-bottom:0"><div><h2>Play with a travel mate</h2><p class="muted small">They get an invite first, and the game starts only if they accept.</p></div></div>${rows.join('')}${form}`;
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
      if (fld) fld.hidden = ($<HTMLSelectElement>('#gcKind').value !== 'hangman');
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
      if (!guessed.includes(letter)) {
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
}
