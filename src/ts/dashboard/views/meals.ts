/**
 * Pre-booking a meal: guests pick a meal for each flight (sample menu and prices) until the cut-off, and see what
 * their travel mates chose. Opened from the flight card. In the live version the menu, the prices and the cut-off
 * come from AirAsia, and the choice is saved to the booking.
 */
import { $, closest, esc } from '../../shared/dom';
import { ApiError, api } from '../../shared/api';
import { MEALS, mealById } from '../../shared/meals';
import { state } from '../state';
import { save } from '../sync';
import { toast } from '../ui';
import type { Flight } from '../types';

interface MealState {
  flight: string;
  mine: string | null;
  mates: Array<{ id: string; name: string; meal: string }>;
  closesAt: number;
  open: boolean;
}

let flights: Flight[] = [];
let flightKey = '';
let info: MealState | null = null;
let picked: string | null = null;

const flightLabel = (f: Flight): string => `${f.number} · ${f.from} → ${f.to} · ${new Date(f.departsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
const money = (n: number): string => `MYR ${n}`;

function render(): void {
  $('#mealTabs').innerHTML = flights.length > 1 ? flights.map((f) => `<button type="button" class="chip ${f.key === flightKey ? 'on' : ''}" data-meal-flight="${esc(f.key)}">${esc(flightLabel(f))}</button>`).join('') : '';
  const f = flights.find((x) => x.key === flightKey);
  $('#mealFlight').textContent = f ? flightLabel(f) : '';
  if (!info) {
    $('#mealList').innerHTML = '<p class="muted" style="padding:30px;text-align:center">Loading the menu…</p>';
    return;
  }
  const open = info.open;
  $('#mealList').innerHTML = MEALS.map((m) => {
    const on = picked === m.id;
    const mates = info?.mates.filter((x) => x.meal === m.id) ?? [];
    return `<button type="button" class="meal ${on ? 'on' : ''}" data-meal="${esc(m.id)}" aria-pressed="${on}" ${open ? '' : 'disabled'}>
      <span class="mn"><b>${esc(m.name)}</b><span>${esc(m.text)}</span>
        <span class="chips">${m.tags.map((t) => `<span class="chip soft">${esc(t)}</span>`).join('')}${mates.map((x) => `<span class="chip">${esc(x.name)} chose this</span>`).join('')}</span></span>
      <span class="mp">${money(m.price)}${on ? '<i aria-hidden="true">&#10003;</i>' : ''}</span></button>`;
  }).join('');
  const closes = new Date(info.closesAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  $('#mealMates').textContent = info.mates.length ? `Your travel mates: ${info.mates.map((x) => `${x.name} chose ${mealById(x.meal)?.name ?? 'a meal'}`).join(', ')}.` : 'None of your travel mates has pre-booked a meal yet.';
  const chosen = mealById(picked);
  $('#mealPick').innerHTML = chosen ? `<b>${esc(chosen.name)}</b><span>${money(chosen.price)} per person</span>` : info.mine ? '<b>Choose a different meal to change it</b><span></span>' : '<b>No meal yet</b><span>Tap a meal to choose it</span>';
  $<HTMLButtonElement>('#mealConfirm').disabled = !open || !picked || picked === info.mine;
  $('#mealClear').hidden = !open || !info.mine;
  $('#mealNote').textContent = open
    ? `Pre-booking closes ${closes}. Sample menu and prices. In the live AirAsia app the meal is added to your booking and paid with it.`
    : 'Pre-booking has closed for this flight. You can still buy on board.';
}

async function load(): Promise<void> {
  info = null;
  render();
  try {
    info = await api<MealState>('GET', `/api/meals?flight=${encodeURIComponent(flightKey)}`);
    picked = info.mine;
    render();
  } catch (error: unknown) {
    $('#mealList').innerHTML = `<p class="muted" style="padding:30px;text-align:center">${esc(error instanceof ApiError ? error.message : 'Could not load the menu.')}</p>`;
  }
}

const close = (): void => {
  $('#mealModal').hidden = true;
};

export function initMeals(): void {
  document.addEventListener('click', (event) => {
    if (closest(event, '[data-meals-open]')) {
      flights = state.flight ? [state.flight, ...state.flights.filter((f) => f.key !== state.flight?.key)] : state.flights;
      if (!flights.length) return toast('Add your flight first. Then you can pre-book a meal.');
      flightKey = (flights.find((f) => f.landsAt > Date.now()) ?? flights[0])?.key ?? '';
      picked = null;
      $('#mealModal').hidden = false;
      void load();
      return;
    }
    const tab = closest(event, '[data-meal-flight]');
    if (tab?.dataset.mealFlight) {
      flightKey = tab.dataset.mealFlight;
      picked = null;
      void load();
      return;
    }
    const meal = closest(event, '[data-meal]');
    if (meal?.dataset.meal) {
      picked = meal.dataset.meal;
      render();
    }
  });
  $('#mealCancel').addEventListener('click', close);
  $('#mealModal').addEventListener('click', (event) => {
    if ((event.target as HTMLElement).id === 'mealModal') close();
  });
  $('#mealClear').addEventListener('click', () => {
    void save(() => api('PUT', '/api/meals', { flight: flightKey, meal: null })).then(() => {
      toast('Meal removed');
      void load();
    });
  });
  $('#mealConfirm').addEventListener('click', () => {
    const meal = mealById(picked);
    const f = flights.find((x) => x.key === flightKey);
    if (!meal || !f) return;
    void save(() => api('PUT', '/api/meals', { flight: flightKey, meal: meal.id }))
      .then(() => {
        close();
        toast(`${meal.name} is booked for ${f.number}`);
      })
      .catch((error: unknown) => {
        toast(error instanceof ApiError ? error.message : 'Could not save the meal. Try again.');
        void load();
      });
  });
}
