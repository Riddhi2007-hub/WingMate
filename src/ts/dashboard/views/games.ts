import { $, $$, closest, esc } from '../../shared/dom';
import { HANGMAN_PARTS, HANGMAN_WORDS, SCRIBBLE_COLORS, SCRIBBLE_WORDS } from '../data';
import { connectedPeople } from '../ui';

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;

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

function renderHangman(): void {
  const won = [...word].every((c) => guessed.includes(c));
  const lost = wrong >= MAX_WRONG;

  $('#hangParts').innerHTML = HANGMAN_PARTS.slice(0, wrong).join('');
  $('#hangWord').innerHTML = [...word].map((c) => `<span>${guessed.includes(c) || lost ? c : ''}</span>`).join('');
  $('#hangInfo').textContent = `Wrong guesses left: ${MAX_WRONG - wrong}`;

  const result = $('#hangResult');
  result.className = 'result ' + (won ? 'win' : lost ? 'lose' : '');
  result.textContent = won ? 'You got it. Well done!' : lost ? 'Out of guesses. Try another word.' : '';

  $('#hangKeys').innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    .split('')
    .map((c) => {
      const used = guessed.includes(c);
      const state = used ? (word.includes(c) ? 'hit' : 'miss') : '';
      return `<button class="${state}" data-key="${c}" ${used || won || lost ? 'disabled' : ''} aria-label="Letter ${c}">${c}</button>`;
    })
    .join('');
}

/* ============================== Scribble ============================== */

interface Stroke {
  color: string;
  size: number;
  pts: Array<[number, number]>;
}

let strokes: Stroke[] = [];
let brushColor: string = SCRIBBLE_COLORS[1]?.[0] ?? '#000000';

function redrawPad(): void {
  const canvas = $<HTMLCanvasElement>('#pad');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    stroke.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    const first = stroke.pts[0];
    if (stroke.pts.length === 1 && first) ctx.lineTo(first[0] + 0.1, first[1]); // a single tap draws a dot
    ctx.stroke();
  }
}

function clearPad(): void {
  strokes = [];
  redrawPad();
}

function newScribble(): void {
  $('#scrWordLine').textContent = `Your word to draw: ${pick(SCRIBBLE_WORDS)}`;
  clearPad();
}

function setupPad(): void {
  $('#scrColors').innerHTML = SCRIBBLE_COLORS.map(
    ([hex, name]) =>
      `<button class="sw-btn" style="background:${hex}" data-color="${hex}" aria-label="${esc(name)}" aria-pressed="${hex === brushColor}"></button>`,
  ).join('');

  const canvas = $<HTMLCanvasElement>('#pad');
  let current: Stroke | null = null;
  const position = (e: PointerEvent): [number, number] => {
    const box = canvas.getBoundingClientRect();
    return [((e.clientX - box.left) * canvas.width) / box.width, ((e.clientY - box.top) * canvas.height) / box.height];
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    current = { color: brushColor, size: Number($<HTMLInputElement>('#scrSize').value) * 1.6, pts: [position(e)] };
    strokes.push(current);
    redrawPad();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    current.pts.push(position(e));
    redrawPad();
  });
  const endStroke = (): void => {
    current = null;
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
    strokes.pop();
    redrawPad();
  });
  $('#scrClear').addEventListener('click', clearPad);
  $('#scrNew').addEventListener('click', newScribble);
}

/* ============================== tab ============================== */

/** The "Playing with" dropdown lists your connected travel mates. */
export function renderPlayWith(): void {
  const select = $<HTMLSelectElement>('#playWith');
  const previous = select.value;
  select.innerHTML =
    `<option value="">Practice on my own</option>` +
    connectedPeople()
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join('');
  if ([...select.options].some((o) => o.value === previous)) select.value = previous;
}

export function initGames(): void {
  setupPad();
  newHangman();
  newScribble();

  $('#hangNew').addEventListener('click', newHangman);

  document.addEventListener('click', (event) => {
    const key = closest<HTMLButtonElement>(event, '[data-key]');
    if (key?.dataset.key) {
      const letter = key.dataset.key;
      if (!guessed.includes(letter)) {
        guessed.push(letter);
        if (!word.includes(letter)) wrong++;
        renderHangman();
      }
      return;
    }
    const tab = closest(event, '[data-game]');
    if (tab) {
      const game = tab.dataset.game;
      $('#tabHang').setAttribute('aria-selected', String(game === 'hang'));
      $('#tabScribble').setAttribute('aria-selected', String(game === 'scribble'));
      $('#game-hang').hidden = game !== 'hang';
      $('#game-scribble').hidden = game !== 'scribble';
    }
  });
}
