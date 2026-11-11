/**
 * Choosing seats, AirAsia style: guests who did not pick a seat when booking can choose one here and see where their
 * travel mates sit, so friends and families can sit together. Opened from a chat (shares the choice in that chat) or
 * from the flight card. The cabin is an A320: rows 1 to 31, A B C | aisle | D E F.
 */
import { $, closest, esc } from '../../shared/dom';
import { ApiError, api } from '../../shared/api';
import { state } from '../state';
import { save, sync } from '../sync';
import { initials, toast } from '../ui';
import type { Flight } from '../types';
import { groupOf } from './groups';
import { findPerson } from '../data';

const ROWS = 31;
const LEFT = ['A', 'B', 'C'];
const RIGHT = ['D', 'E', 'F'];
const HOT_ROWS = new Set([1, 2, 3, 4, 5, 12, 13]);
const EXIT_ROWS = new Set([12, 13]);

interface SeatMap {
  flight: string;
  mine: string | null;
  mates: Array<{ id: string; name: string; seat: string }>;
  taken: string[];
}

let flights: Flight[] = [];
let flightKey = '';
let map: SeatMap | null = null;
let picked: string | null = null;
/** The chat the seat map was opened from (the choice is shared there), or null. */
let chatId: string | null = null;

const kind = (row: number): string => (HOT_ROWS.has(row) ? 'Hot Seat · extra legroom' : 'Standard seat');
const flightLabel = (f: Flight): string => `${f.number} · ${f.from} → ${f.to} · ${new Date(f.departsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;

function seatButton(row: number, letter: string): string {
  const seat = `${row}${letter}`;
  const mate = map?.mates.find((m) => m.seat === seat);
  const mine = picked === seat;
  const wasMine = map?.mine === seat;
  const taken = !!map?.taken.includes(seat);
  const hot = HOT_ROWS.has(row);
  if (mate) return `<button type="button" class="seat mate" disabled title="${esc(mate.name)} · ${seat}" aria-label="${seat}, ${esc(mate.name)}">${esc(initials(mate.name))}</button>`;
  if (taken && !wasMine) return `<button type="button" class="seat taken" disabled aria-label="${seat}, taken"></button>`;
  return `<button type="button" class="seat ${hot ? 'hot' : 'std'} ${mine ? 'on' : ''}" data-seat="${seat}" aria-pressed="${mine}" aria-label="${seat}, ${hot ? 'Hot Seat' : 'standard'}${mine ? ', selected' : ''}">${mine ? '&#10003;' : letter}</button>`;
}

function render(): void {
  const tabs = flights.length > 1 ? flights.map((f) => `<button type="button" class="chip ${f.key === flightKey ? 'on' : ''}" data-seat-flight="${esc(f.key)}">${esc(flightLabel(f))}</button>`).join('') : '';
  $('#seatTabs').innerHTML = tabs;
  const f = flights.find((x) => x.key === flightKey);
  $('#seatFlight').textContent = f ? flightLabel(f) : '';
  if (!map) {
    $('#seatMap').innerHTML = '<p class="muted" style="padding:30px;text-align:center">Loading the seat map…</p>';
    return;
  }
  let rows = `<div class="cabin-row head"><span>A</span><span>B</span><span>C</span><span class="aisle"></span><span>D</span><span>E</span><span>F</span></div>`;
  for (let r = 1; r <= ROWS; r++) {
    const exit = EXIT_ROWS.has(r) ? '<span class="exit l">EXIT</span><span class="exit r">EXIT</span>' : '';
    rows += `<div class="cabin-row ${EXIT_ROWS.has(r) ? 'is-exit' : ''}">${exit}${LEFT.map((l) => seatButton(r, l)).join('')}<span class="aisle">${r}</span>${RIGHT.map((l) => seatButton(r, l)).join('')}</div>`;
  }
  $('#seatMap').innerHTML = `<div class="cabin"><div class="nose"></div>${rows}<div class="tail"></div></div>`;
  const mates = map.mates.length ? map.mates.map((m) => `${esc(m.name)} in ${m.seat}`).join(', ') : 'None of your travel mates has picked a seat yet.';
  $('#seatMates').textContent = map.mates.length ? `Your travel mates: ${mates}` : mates;
  const row = picked ? Number(picked.replace(/[A-F]/, '')) : 0;
  $('#seatPick').innerHTML = picked ? `<b>Seat ${esc(picked)}</b><span>${kind(row)}</span>` : map.mine ? `<b>Your seat: ${esc(map.mine)}</b><span>Tap another seat to change it</span>` : '<b>No seat yet</b><span>Tap a seat to choose it</span>';
  $<HTMLButtonElement>('#seatConfirm').disabled = !picked || picked === map.mine;
  $('#seatClear').hidden = !map.mine;
  $('#seatShareRow').hidden = !chatId;
}

async function load(): Promise<void> {
  map = null;
  render();
  try {
    map = await api<SeatMap>('GET', `/api/seats?flight=${encodeURIComponent(flightKey)}`);
    picked = map.mine;
    render();
    // start the view near the chosen seat, or near a travel mate
    const target = document.querySelector('#seatMap .seat.on, #seatMap .seat.mate');
    target?.scrollIntoView({ block: 'center' });
  } catch (error: unknown) {
    $('#seatMap').innerHTML = `<p class="muted" style="padding:30px;text-align:center">${esc(error instanceof ApiError ? error.message : 'Could not load the seat map.')}</p>`;
  }
}

/** Opens the seat map for these flights (the first one shown first). */
export function openSeats(options: Flight[], fromChat: string | null): void {
  // only flights I am on can be chosen
  const mineKeys = new Set(state.flights.map((f) => f.key));
  flights = options.filter((f) => mineKeys.has(f.key));
  if (!flights.length) {
    toast('Add your flight first. Then you can choose a seat.');
    return;
  }
  chatId = fromChat;
  flightKey = (flights.find((f) => f.landsAt > Date.now()) ?? flights[0])?.key ?? '';
  picked = null;
  $<HTMLInputElement>('#seatShare').checked = true;
  $('#seatModal').hidden = false;
  void load();
}

/** The flights a chat is about: the ones you share with that person, or all your flights in a group. */
export function chatFlights(chat: string | null): Flight[] {
  if (!chat) return state.flights;
  if (groupOf(chat)) return state.flights;
  return findPerson(chat)?.flights ?? [];
}

const close = (): void => {
  $('#seatModal').hidden = true;
};

export function initSeats(): void {
  document.addEventListener('click', (event) => {
    const open = closest(event, '[data-seats-open]');
    if (open) {
      const chat = open.dataset.seatsOpen || null;
      openSeats(chat ? chatFlights(chat) : state.flight ? [state.flight, ...state.flights.filter((f) => f.key !== state.flight?.key)] : [], chat);
      return;
    }
    const tab = closest(event, '[data-seat-flight]');
    if (tab?.dataset.seatFlight) {
      flightKey = tab.dataset.seatFlight;
      picked = null;
      void load();
      return;
    }
    const seat = closest(event, '[data-seat]');
    if (seat?.dataset.seat) {
      picked = seat.dataset.seat;
      render();
    }
  });
  $('#seatCancel').addEventListener('click', close);
  $('#seatModal').addEventListener('click', (event) => {
    if ((event.target as HTMLElement).id === 'seatModal') close();
  });
  $('#seatClear').addEventListener('click', () => {
    void save(() => api('PUT', '/api/seats', { flight: flightKey, seat: null })).then(() => {
      toast('Seat cleared');
      void load();
    });
  });
  $('#seatConfirm').addEventListener('click', () => {
    const seat = picked;
    const f = flights.find((x) => x.key === flightKey);
    if (!seat || !f) return;
    const share = chatId && $<HTMLInputElement>('#seatShare').checked ? chatId : null;
    void save(() => api('PUT', '/api/seats', { flight: flightKey, seat }))
      .then(async () => {
        if (share) {
          const text = `💺 I picked seat ${seat} on ${f.number} (${f.from} → ${f.to}).`;
          if (share.startsWith('g:')) await api('POST', '/api/groups/messages', { id: share.slice(2), text });
          else await api('POST', '/api/messages', { to: share, text });
          await sync();
        }
        close();
        toast(`Seat ${seat} is yours on ${f.number}`);
      })
      .catch((error: unknown) => {
        toast(error instanceof ApiError ? error.message : 'Could not save the seat. Try again.');
        void load();
      });
  });
}
