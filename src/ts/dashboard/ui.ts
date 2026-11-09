/** Small UI pieces used by several tabs: toast, confirm dialog, avatars, buttons, the unread badge. */
import { $, esc } from '../shared/dom';
import { getPeople } from './data';
import { state } from './state';
import type { Person } from './types';

/* ---------- formatting ---------- */

export const fmtTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export const fmtDate = (value: string | number | Date): string =>
  new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const initials = (name: string): string =>
  name
    .split(' ')
    .map((word) => word.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

/* ---------- toast ---------- */

let toastTimer: number | undefined;

export function toast(message: string): void {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- confirm dialog (browser confirm() is blocked in many previews) ---------- */

export interface AskOptions {
  title: string;
  text: string;
  okLabel: string;
  danger?: boolean;
  onOk: () => void;
}

let pendingOk: (() => void) | null = null;

export function ask(options: AskOptions): void {
  $('#mTitle').textContent = options.title;
  $('#mText').textContent = options.text;
  const ok = $('#mOk');
  ok.textContent = options.okLabel;
  ok.className = 'btn' + (options.danger ? ' danger' : '');
  pendingOk = options.onOk;
  $('#modal').hidden = false;
  $('#mCancel').focus();
}

function closeAsk(): void {
  $('#modal').hidden = true;
  pendingOk = null;
}

export function initDialog(): void {
  $('#mCancel').addEventListener('click', closeAsk);
  $('#mOk').addEventListener('click', () => {
    const callback = pendingOk;
    closeAsk();
    callback?.();
  });
  $('#modal').addEventListener('click', (event) => {
    if ((event.target as HTMLElement).id === 'modal') closeAsk();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#modal').hidden) closeAsk();
  });
}

/* ---------- shared pieces ---------- */

export function avatar(person: Person): string {
  return `<span class="av c${person.av}">${esc(initials(person.name))}</span>`;
}

/** Connect / Request sent / Message button for a passenger. */
export function connectButton(id: string, small = false): string {
  const size = small ? 'btn sm' : 'btn';
  switch (state.conn[id]) {
    case 'connected':
      return `<button class="${size} ghost" data-act="message" data-id="${esc(id)}">Message</button>`;
    case 'requested':
      return `<button class="${size}" disabled>Request sent</button>`;
    case 'incoming':
      return `<span class="req-actions"><button class="${size}" data-act="accept" data-id="${esc(id)}">Accept</button> <button class="${size} ghost" data-act="decline" data-id="${esc(id)}">Decline</button></span>`;
    default:
      return `<button class="${size}" data-act="connect" data-id="${esc(id)}">Connect</button>`;
  }
}

/** Passengers you are connected with, in the order they appear on the flight. */
export function connectedPeople(): Person[] {
  return getPeople().filter((p) => state.conn[p.id] === 'connected');
}

/** Red badge on the Messages tab. */
export function updateNavDot(): void {
  const incoming = Object.values(state.conn).filter((c) => c === 'incoming').length;
  const total = incoming + Object.values(state.unread).reduce<number>((sum, n) => sum + (n ?? 0), 0);
  const dot = $('#navDot');
  dot.hidden = total === 0;
  dot.textContent = String(total);
}

/** Keeps the two "Open to connect" switches (Home and Find) in step with the state. */
export function syncVisibleToggles(): void {
  $<HTMLInputElement>('#visibleToggle').checked = state.visible;
  $<HTMLInputElement>('#visibleToggle2').checked = state.visible;
}
