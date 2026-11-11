import { $, $$, closest, esc } from '../../shared/dom';
import { api } from '../../shared/api';
import { save } from '../sync';
import { ranked } from '../matching';
import { FILTER_KEYS, GOAL_LABEL, INTERESTS, PREF_KEYS, PREF_LABEL, isOneOf, type FilterKey, type Interest } from '../options';
import { emptyFilters, state } from '../state';
import { avatar, connectButton, flightTags, toast } from '../ui';
import { refreshAll } from '../router';
import { BRAND } from '../../shared/brand';

const FILTER_SELECTS: Record<FilterKey, string> = {
  type: '#fType',
  why: '#fWhy',
  pers: '#fPers',
  seat: '#fSeat',
};

export function renderFind(): void {
  const { criteria, filters, interestFilter } = state;

  // "Rank by" chips and interest chips
  $('#critChips').innerHTML = PREF_KEYS.map(
    (k) =>
      `<button type="button" class="chip ${criteria[k] ? 'on' : ''}" data-crit="${k}" aria-pressed="${criteria[k]}"><span class="tick">✓</span>${PREF_LABEL[k]}</button>`,
  ).join('');
  $('#intChips').innerHTML = INTERESTS.map((i) => {
    const on = interestFilter.includes(i);
    return `<button type="button" class="chip ${on ? 'on' : ''}" data-int="${esc(i)}" aria-pressed="${on}"><span class="tick">✓</span>${esc(i)}</button>`;
  }).join('');

  // filter dropdowns
  for (const key of FILTER_KEYS) {
    const select = $<HTMLSelectElement>(FILTER_SELECTS[key]);
    select.value = filters[key];
    select.classList.toggle('on', Boolean(filters[key]));
  }
  const activeCount = Object.values(filters).filter(Boolean).length + (interestFilter.length ? 1 : 0);
  $('#resetFilters').textContent = activeCount ? `Clear filters (${activeCount})` : 'Clear filters';

  const box = $('#results');
  if (!state.visible) {
    $('#resultCount').textContent = '';
    box.innerHTML = `<div class="card empty" style="grid-column:1/-1"><h3>You are not visible to other ${BRAND.guests}</h3><p style="margin-bottom:14px">Turn on “Open to connect” to see people on your flight.</p><button class="btn" data-act="goVisible">Turn on</button></div>`;
    return;
  }

  const query = $<HTMLInputElement>('#q').value.trim().toLowerCase();
  const list = ranked().filter(({ p }) => {
    for (const key of FILTER_KEYS) {
      const wanted = filters[key];
      if (!wanted || p[key] === wanted) continue;
      return false;
    }
    if (interestFilter.length && !interestFilter.some((i) => p.interests.includes(i))) return false;
    if (query) {
      const haystack = `${p.name} ${p.type} ${GOAL_LABEL[p.why]} ${p.pers} ${p.interests.join(' ')} ${p.bio}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  if ($<HTMLSelectElement>('#sort').value === 'name') list.sort((a, b) => a.p.name.localeCompare(b.p.name));

  $('#resultCount').textContent = `${list.length} ${list.length === 1 ? BRAND.guest : BRAND.guests} ${state.flights.length > 1 ? `on your ${state.flights.length} flights` : state.flight ? `on ${state.flight.number} to ${state.flight.to}` : '(add your flight to see who is aboard)'}`;
  box.innerHTML = list.length
    ? list
        .map(({ p, s }) => {
          const chips = p.interests
            .map((i) => {
              const shared = s.shared.includes(i);
              return `<span class="chip ${shared ? 'soft' : ''}">${shared ? '✓ ' : ''}${esc(i)}</span>`;
            })
            .join('');
          return `
    <article class="mate">
      <div class="mate-top">${avatar(p)}<div class="nm"><b>${esc(p.name)}</b><span>${esc(p.type)} trip</span></div>
        <div class="ring" style="--p:${s.pct}" title="${s.pct}% match"><span>${s.pct}%</span></div></div>
      ${flightTags(p)}
      <p class="bio">${esc(p.bio)}</p>
      <div class="chips">${chips}</div>
      <div class="facts">
        <span class="${s.hit.why ? 'yes' : ''}">Goal: <b>${esc(GOAL_LABEL[p.why])}</b></span>
        <span class="${s.hit.pers ? 'yes' : ''}">Personality: <b>${esc(p.pers)}</b></span>
        <span class="${s.hit.seat ? 'yes' : ''}">Seating: <b>${esc(p.seat)}</b></span>
      </div>
      <div class="mate-actions">${connectButton(p.id)}</div>
    </article>`;
        })
        .join('')
    : `<div class="card empty" style="grid-column:1/-1"><h3>No one matches those filters</h3><p style="margin-bottom:14px">Try setting one of the filters back to “Any”, or clear them all.</p><button class="btn" data-act="clearFilters">Clear filters</button></div>`;
}

export function initFind(): void {
  $('#q').addEventListener('input', renderFind);
  $('#sort').addEventListener('change', renderFind);

  for (const select of $$<HTMLSelectElement>('[data-filter]')) {
    select.addEventListener('change', () => {
      const key = select.dataset.filter;
      if (isOneOf(FILTER_KEYS, key)) {
        state.filters[key] = select.value;
        renderFind();
      }
    });
  }

  $('#resetFilters').addEventListener('click', () => {
    state.filters = emptyFilters();
    state.interestFilter = [];
    $<HTMLInputElement>('#q').value = '';
    $<HTMLSelectElement>('#sort').value = 'match';
    renderFind();
  });

  $('#usePrefs').addEventListener('click', () => {
    const { prefs } = state;
    state.filters = { type: prefs.type, why: prefs.why, pers: prefs.pers, seat: prefs.seat };
    state.interestFilter = [...prefs.interests];
    renderFind();
    toast('Filters set to your saved preferences');
  });

  // "Rank by" chips and interest chips
  document.addEventListener('click', (event) => {
    const crit = closest(event, '[data-crit]');
    if (crit) {
      const key = crit.dataset.crit;
      if (!isOneOf(PREF_KEYS, key)) return;
      const onCount = Object.values(state.criteria).filter(Boolean).length;
      if (state.criteria[key] && onCount === 1) {
        toast('Keep at least one match option on');
        return;
      }
      state.criteria[key] = !state.criteria[key];
      void save(() => api('PUT', '/api/criteria', { criteria: state.criteria }));
      refreshAll();
      return;
    }
    const chip = closest(event, '[data-int]');
    if (chip) {
      const interest = chip.dataset.int;
      if (!isOneOf(INTERESTS, interest)) return;
      state.interestFilter = state.interestFilter.includes(interest)
        ? state.interestFilter.filter((i): i is Interest => i !== interest)
        : [...state.interestFilter, interest];
      renderFind();
    }
  });
}
