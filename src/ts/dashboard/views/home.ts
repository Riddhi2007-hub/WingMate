import { $, esc } from '../../shared/dom';
import { TRIPS, getPeople } from '../data';
import { ranked } from '../matching';
import { GOAL_LABEL } from '../options';
import { state } from '../state';
import { avatar, connectButton, flightTags } from '../ui';
import type { Prefs } from '../types';
import { BRAND } from '../../shared/brand';

/** How many of the six preferences have a value. */
function filledCount(p: Prefs): number {
  return [p.type, p.why, p.pers, p.interests.length ? 1 : 0, p.awake, p.seat].filter(Boolean).length;
}

export function renderHome(): void {
  const { prefs, user, visible } = state;
  $('#hello').textContent = `Welcome aboard, ${user.first || 'there'}`;
  $('#whoAv').textContent = (user.first || 'A').charAt(0).toUpperCase();

  const all = ranked();
  $('#statMatches').textContent = String(visible ? all.filter((x) => x.s.pct >= 70).length : 0);
  $('#statConns').textContent = String(Object.values(state.conn).filter((v) => v === 'connected').length);
  $('#statPrefs').textContent = `${filledCount(prefs)}/6`;

  $('#topMatches').innerHTML = !state.flight
    ? `<div class="empty"><h3>Add your flight first</h3><p style="margin-bottom:14px">Tell us which flight you are on and you will see the other ${BRAND.guests} who have added it.</p><button class="btn" data-act="addFlight">Add my flight</button></div>`
    : !visible
    ? `<div class="empty"><h3>You are not visible to other ${BRAND.guests}</h3><p>Turn on “Open to connect” to see and meet people on your flight.</p></div>`
    : !all.length
      ? `<div class="empty"><h3>No one else yet</h3><p>Nobody else on your flight has joined yet. Check back closer to departure.</p></div>`
      : all
        .slice(0, 3)
        .map(
          ({ p, s }) =>
            `<div class="mate-compact">${avatar(p)}<div class="nm"><b>${esc(p.name)}</b><span>${esc(p.type)} trip · ${esc(GOAL_LABEL[p.why])}</span>${flightTags(p)}</div><span class="chip soft">${s.pct}% match</span>${connectButton(p.id, true)}</div>`,
        )
        .join('');

  const rows: Array<[string, string]> = [
    ['Travel purpose', prefs.type],
    ['Connection goal', GOAL_LABEL[prefs.why]],
    ['Personality type', prefs.pers],
    ['Interests', prefs.interests.length ? prefs.interests.join(', ') : 'None selected'],
    ['Sleeping preference', prefs.awake],
    ['Seating preference', prefs.seat],
  ];
  $('#prefSummary').innerHTML = rows
    .map(([label, value]) => `<div class="sum-row"><span>${label}</span><b>${esc(value)}</b></div>`)
    .join('');

  renderSuggestions();
}

/** The "Suggested for you" card depends on the connection goal. */
function renderSuggestions(): void {
  const { prefs } = state;
  const title = $('#suggestTitle');
  const body = $('#suggestBody');

  if (prefs.why === 'travel') {
    title.textContent = 'Suggested trip packages';
    const best = TRIPS.map((trip) => ({ trip, n: trip.tags.filter((tag) => prefs.interests.includes(tag)).length }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);
    body.innerHTML = best
      .map(({ trip }) => {
        const tags = trip.tags
          .map((tag) => `<span class="chip ${prefs.interests.includes(tag) ? 'soft' : ''}">${esc(tag)}</span>`)
          .join('');
        return `<div class="trip"><div class="sw"><span>${trip.days}<small>days</small></span></div><div class="bd"><div><h3>${esc(trip.name)}</h3><p>${esc(trip.text)}</p></div><div class="chips">${tags}</div><div><button class="btn ghost sm" data-act="tripmates" data-tag="${esc(trip.tags[0])}">See mates who like this</button></div></div></div>`;
      })
      .join('');
  } else if (prefs.why === 'cab') {
    title.textContent = 'Share a cab after landing';
    const n = getPeople().filter((p) => p.why === 'cab').length;
    body.innerHTML = `<p class="muted">${n} ${BRAND.guests} on your flight want to split a cab. Connect with them in the chat and agree a pick-up point before you land.</p><div><button class="btn sm" data-act="cabmates">See cab-share passengers</button></div>`;
  } else if (prefs.type === 'Business') {
    title.textContent = 'Business networking';
    const n = getPeople().filter((p) => p.interests.includes('Business networking') || p.type === 'Business').length;
    body.innerHTML = `<p class="muted">${n} business travellers on your flight are open to connecting.</p><div><button class="btn sm" data-act="bizmates">See business travellers</button></div>`;
  } else {
    title.textContent = 'Meet new people';
    body.innerHTML = `<p class="muted">Start a chat with anyone from your matches. You can play Hangman or Scribble together to break the ice.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn sm" href="#find">Find travel mates</a><a class="btn ghost sm" href="#games">Play a game</a></div>`;
  }
}
