import { $, esc } from '../shared/dom';
import { CHAT_WINDOW_HOURS, HOUR_MS, stageOf, type ChatWindow, type Stage } from '../shared/stage';
import { ApiError, api } from '../shared/api';
import { refreshAll } from './router';
import { nowMs, state } from './state';
import { save, sync } from './sync';
import { toast } from './ui';

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
export function stageUI(): void {
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
}

/* ---------- add / change flight dialog ---------- */

const pad = (n: number): string => String(n).padStart(2, '0');
const localInput = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const input = (id: string): HTMLInputElement => $<HTMLInputElement>(id);

export function openFlightDialog(): void {
  const f = state.flight;
  input('#fNumber').value = f?.number ?? '';
  input('#fDate').value = f ? localInput(f.departsAt).slice(0, 10) : '';
  input('#fFrom').value = f?.from ?? '';
  input('#fTo').value = f?.to ?? '';
  input('#fDep').value = f ? localInput(f.departsAt) : '';
  input('#fArr').value = f ? localInput(f.landsAt) : '';
  $('#fErr').textContent = '';
  $('#fRemove').hidden = !f;
  $('#flightModal').hidden = false;
  input('#fNumber').focus();
}

const closeFlightDialog = (): void => {
  $('#flightModal').hidden = true;
};

export function initFlight(): void {
  $('#flightBtn').addEventListener('click', openFlightDialog);
  document.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('[data-act="addFlight"]')) openFlightDialog();
  });
  $('#fCancel').addEventListener('click', closeFlightDialog);
  $('#flightModal').addEventListener('click', (event) => {
    if ((event.target as HTMLElement).id === 'flightModal') closeFlightDialog();
  });
  // choosing the date fills in the times if they are empty
  input('#fDate').addEventListener('change', () => {
    const date = input('#fDate').value;
    if (date && !input('#fDep').value) input('#fDep').value = `${date}T09:00`;
    if (date && !input('#fArr').value) input('#fArr').value = `${date}T12:00`;
  });

  $('#fRemove').addEventListener('click', () => {
    void save(() => api('DELETE', '/api/flight')).then(() => {
      closeFlightDialog();
      refreshAll();
      toast('Flight removed');
    });
  });

  $('#flightForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const body = {
      number: input('#fNumber').value.trim(),
      date: input('#fDate').value,
      from: input('#fFrom').value.trim().toUpperCase(),
      to: input('#fTo').value.trim().toUpperCase(),
      departsAt: new Date(input('#fDep').value).getTime(),
      landsAt: new Date(input('#fArr').value).getTime(),
    };
    void save(() => api('PUT', '/api/flight', body))
      .then(async () => {
        closeFlightDialog();
        await sync();
        refreshAll();
        toast('Flight saved');
      })
      .catch((error: unknown) => {
        $('#fErr').textContent = error instanceof ApiError ? error.message : 'Could not save. Try again.';
      });
  });
}
