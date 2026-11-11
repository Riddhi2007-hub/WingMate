import type { GlobeApi } from './globe';
import { $, esc } from '../shared/dom';
import { CHAT_WINDOW_HOURS, HOUR_MS, stageOf, type ChatWindow, type Stage } from '../shared/stage';
import { ApiError, api } from '../shared/api';
import { refreshAll } from './router';
import { nowMs, state } from './state';
import { save, sync } from './sync';
import { toast } from './ui';
import { attachAirportPicker } from './airportPicker';
import { estimateFlightMs, resolveAirport } from './airports';

export { CHAT_WINDOW_HOURS };

/** Time left before a chat closes, e.g. "44h 59m", or null when it is not counting down. */
export function closesIn(window: ChatWindow | undefined): string | null {
  if (!window || window.closesAt === null) return null;
  const left = window.closesAt - nowMs();
  if (left <= 0) return null;
  const hours = Math.floor(left / HOUR_MS);
  const minutes = Math.floor((left % HOUR_MS) / 60e3);
  return `${hours}h ${minutes}m`;
}

export function stageLabel(stage: Stage): string {
  const labels: Record<Stage, string> = {
    pre: 'Pre-flight chat',
    in: 'In-flight chat',
    landed: 'Chat open after landing',
    closed: 'Chat closed',
  };
  return labels[stage];
}

/** Your own flight's stage (null until you add a flight). */
export function myStage(): Stage | null {
  return state.flight ? stageOf(state.flight, nowMs()) : null;
}

const fmtClock = (ms: number): string => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Updates the flight card on the home page. */
let globe: GlobeApi | null = null;
let globeKey = '';
let playNext = false;
export function attachGlobe(api: GlobeApi): void {
  globe = api;
}
function syncGlobe(): void {
  const f = state.flight;
  const key = f ? `${f.from}>${f.to}` : '';
  if (key === globeKey) return;
  globeKey = key;
  globe?.setRoute(f?.from ?? null, f?.to ?? null, playNext || globeKey !== '');
  playNext = false;
}

export function stageUI(): void {
  syncGlobe();
  const { flight } = state;
  const stage = myStage();
  
  if (!flight || !stage) {
    $('#stagePill').textContent = 'No flight yet';
    $('#routeFrom').textContent = '---';
    $('#routeTo').textContent = '---';
    $('#fromTime').textContent = '';
    $('#toTime').textContent = '';
    $('#flightMeta').textContent = 'Add your flight to see who else is on it.';
    $('#flightBtn').textContent = 'Add my flight';
    $('#addLegBtn').hidden = true;
    $('#legs').hidden = true;
    return;
  }
  const days = Math.max(1, Math.round((flight.departsAt - nowMs()) / 864e5));
  const pill: Record<Stage, string> = {
    pre: `Departs in ${days} day${days === 1 ? '' : 's'}`,
    in: 'You are in flight',
    landed: 'Landed',
    closed: 'Landed · chats closed',
  };
  const date = new Date(flight.departsAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  $('#stagePill').textContent = pill[stage];
  $('#routeFrom').textContent = flight.from;
  $('#routeTo').textContent = flight.to;
  $('#fromTime').textContent = fmtClock(flight.departsAt);
  $('#toTime').textContent = fmtClock(flight.landsAt);
  $('#flightMeta').innerHTML = `${esc(flight.number)} · ${esc(date)}`;
  $('#flightBtn').textContent = 'Change flight';
  $('#addLegBtn').hidden = state.flights.length >= MAX_FLIGHTS;
  renderLegs();
}

const MAX_FLIGHTS = 4;

/** With a layover there is more than one flight: a chip for each lets you switch which one the card shows. */
function renderLegs(): void {
  const box = $('#legs');
  box.hidden = state.flights.length < 2;
  box.innerHTML = state.flights
    .map((f, i) => `<button type="button" class="leg ${f.key === state.flight?.key ? 'on' : ''}" data-leg="${esc(f.key)}" aria-pressed="${f.key === state.flight?.key}"><b>${i + 1}</b> ${esc(f.number)} <small>${esc(f.from)} → ${esc(f.to)}</small></button>`)
    .join('');
}

/* ---------- add / change flight dialog ---------- */

const pad = (n: number): string => String(n).padStart(2, '0');
const localInput = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const input = (id: string): HTMLInputElement => $<HTMLInputElement>(id);

/** The flight being edited (null when adding a new one). */
let editKey: string | null = null;

const flightKeyOf = (number: string, date: string): string => {
  const n = number.trim().toUpperCase().replace(/\s+/g, '');
  const m = /^([A-Z0-9]{2})(\d.*)$/.exec(n);
  return `${m ? `${m[1]} ${m[2]}` : n}|${date}`;
};

export function openFlightDialog(mode: 'edit' | 'new' = 'edit'): void {
  const f = mode === 'edit' ? state.flight : null;
  const prev = state.flights[state.flights.length - 1];
  editKey = f?.key ?? null;
  input('#fNumber').value = f?.number ?? '';
  // a connecting flight usually leaves from where the last one landed
  input('#fDate').value = f ? localInput(f.departsAt).slice(0, 10) : prev ? localInput(prev.landsAt).slice(0, 10) : '';
  input('#fFrom').value = f?.from ?? prev?.to ?? '';
  input('#fTo').value = f?.to ?? '';
  input('#fDep').value = f ? localInput(f.departsAt).slice(11) : '';
  $('#fmTitle').textContent = f ? 'Your flight' : state.flights.length ? 'Add a connecting flight' : 'Your flight';
  $('#fErr').textContent = '';
  $('#fRemove').hidden = !f;
  $('#flightModal').hidden = false;
  for (const id of ['#fFrom', '#fTo']) input(id).dispatchEvent(new Event('change'));
  input('#fNumber').focus();
}

const closeFlightDialog = (): void => {
  $('#flightModal').hidden = true;
};

export function initFlight(): void {
  $('#flightBtn').addEventListener('click', () => openFlightDialog(state.flight ? 'edit' : 'new'));
  $('#addLegBtn').addEventListener('click', () => openFlightDialog('new'));
  $('#legs').addEventListener('click', (event) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-leg]')?.dataset.leg;
    const f = state.flights.find((x) => x.key === key);
    if (!f) return;
    state.flightSel = f.key;
    state.flight = f;
    stageUI();
    refreshAll();
  });
  document.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('[data-act="addFlight"]')) openFlightDialog('new');
  });
  attachAirportPicker(input('#fFrom'));
  attachAirportPicker(input('#fTo'));
  $('#fCancel').addEventListener('click', closeFlightDialog);
  $('#flightModal').addEventListener('click', (event) => {
    if ((event.target as HTMLElement).id === 'flightModal') closeFlightDialog();
  });
  $('#fRemove').addEventListener('click', () => {
    void save(() => api('DELETE', `/api/flight${editKey ? `?key=${encodeURIComponent(editKey)}` : ''}`)).then(async () => {
      state.flightSel = null;
      closeFlightDialog();
      await sync();
      refreshAll();
      toast('Flight removed');
    });
  });

  $('#flightForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const body = {
      number: input('#fNumber').value.trim(),
      date: input('#fDate').value,
      from: resolveAirport(input('#fFrom').value),
      to: resolveAirport(input('#fTo').value),
      departsAt: new Date(`${input('#fDate').value}T${input('#fDep').value}`).getTime(),
      landsAt: 0,
    };
    if (!body.date || !input('#fDep').value) {
      $('#fErr').textContent = 'Enter the date and the departure time.';
      return;
    }
    if (!body.from || !body.to) {
      $('#fErr').textContent = 'Pick the airports from the list, or type the 3-letter code.';
      return;
    }
    // we do not ask for the arrival time: it is estimated from the distance (the 48-hour chat window starts then)
    body.landsAt = body.departsAt + estimateFlightMs(body.from, body.to);
    const newKey = flightKeyOf(body.number, body.date);
    void save(async () => {
      await api('PUT', '/api/flight', body);
      // editing a flight's number or date makes it a different flight: drop the old one
      if (editKey && editKey !== newKey) await api('DELETE', `/api/flight?key=${encodeURIComponent(editKey)}`);
    })
      .then(async () => {
        state.flightSel = newKey;
        closeFlightDialog();
        await sync();
        refreshAll();
        toast('Flight saved');
        globe?.replay();
      })
      .catch((error: unknown) => {
        $('#fErr').textContent = error instanceof ApiError ? error.message : 'Could not save. Try again.';
      });
  });
}
