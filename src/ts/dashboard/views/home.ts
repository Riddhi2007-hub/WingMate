import { $, esc } from '../../shared/dom';
import { TRIPS, getPeople } from '../data';
import { destinationFor } from '../destinations';
import { pictureHTML } from '../scenes';
import { ranked } from '../matching';
import { GOAL_LABEL } from '../options';
import { state } from '../state';
import { avatar, connectButton, flightTags } from '../ui';
import type { Prefs } from '../types';
import { BRAND } from '../../shared/brand';

/** How many of the six preferences have a value. */
function filledCount(p: Prefs): number {
  return [p.type, p.why, p.pers, p.interests.length ? 1 : 0, p.seat].filter(Boolean).length;
}

export function renderHome(): void {
  const { prefs, user, visible } = state;
  $('#hello').textContent = `Welcome aboard, ${user.first || 'there'}`;
  $('#whoAv').textContent = (user.first || 'A').charAt(0).toUpperCase();

  const all = ranked();
  $('#statMatches').textContent = state.prefsSet ? String(visible ? all.filter((x) => x.s.pct >= 70).length : 0) : String(visible ? all.length : 0);
  $('#statMatchesLabel').textContent = state.prefsSet ? 'strong matches (70%+) on your flight' : 'people on your flight, suggested for you';
  $('#statConns').textContent = String(Object.values(state.conn).filter((v) => v === 'connected').length);
  $('#statPrefs').textContent = state.prefsSet ? `${filledCount(prefs)}/5` : '0/5';

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
            `<div class="mate-compact">${avatar(p)}<div class="nm"><b>${esc(p.name)}</b><span>${esc(p.type)} trip · ${esc(GOAL_LABEL[p.why])}</span>${flightTags(p)}</div><span class="chip soft">${s.suggested ? 'Suggested' : `${s.pct}% match`}</span>${connectButton(p.id, true)}</div>`,
        )
        .join('');

  if (!state.prefsSet && state.flight && visible && all.length) {
    $('#topMatches').innerHTML += `<div class="nudge"><div><b>Want better matches?</b><p class="muted small">Tell us what you like (about 30 seconds) and we will show how well each person matches you.</p></div><a class="btn sm" href="#prefs">Sharpen my matches</a></div>`;
  }
  $('#topTitle').textContent = state.prefsSet ? 'Top matches for you' : 'People on your flight';

  const rows: Array<[string, string]> = [
    ['Travel purpose', prefs.type],
    ['Connection goal', GOAL_LABEL[prefs.why]],
    ['Personality type', prefs.pers],
    ['Interests', prefs.interests.length ? prefs.interests.join(', ') : 'None selected'],
    ['Seating preference', prefs.seat],
  ];
  $('#prefSummary').innerHTML = state.prefsSet
    ? rows.map(([label, value]) => `<div class="sum-row"><span>${label}</span><b>${esc(value)}</b></div>`).join('')
    : `<p class="muted">You have not chosen any yet. Your matches are only suggestions until you do.</p><a class="btn sm" href="#prefs" style="margin-top:10px">Choose my preferences</a>`;

  renderSuggestions();
}

/** The "Suggested for you" card depends on the connection goal. */
function renderSuggestions(): void {
  const { prefs } = state;
  const title = $('#suggestTitle');
  const body = $('#suggestBody');

  if (prefs.why === 'travel') {
    // ideas for the place you are flying to, when we have them; otherwise the general ones
    const dest = destinationFor(state.flight?.to);
    title.textContent = dest ? `Trip ideas for ${dest.city}` : 'Suggested trip packages';
    const ranked = (dest?.trips ?? TRIPS).map((trip, index) => ({ trip, index, n: trip.tags.filter((tag) => prefs.interests.includes(tag)).length })).sort((a, b) => b.n - a.n || a.index - b.index);
    body.innerHTML = ranked
      .slice(0, dest ? 4 : 3)
      .map(({ trip, index, n }, rank) => {
        const tags = trip.tags
          .map((tag) => `<span class="chip ${prefs.interests.includes(tag) ? 'soft' : ''}">${esc(tag)}</span>`)
          .join('');
        const stops: string[] = 'stops' in trip && Array.isArray(trip.stops) ? (trip.stops as string[]) : [];
        if (!dest || !stops.length) {
          return `<div class="trip"><div class="sw"><span>${trip.days}<small>days</small></span></div><div class="bd"><div><h3>${esc(trip.name)}</h3><p>${esc(trip.text)}</p></div><div class="chips">${tags}</div><div><button class="btn ghost sm" data-act="tripmates" data-tag="${esc(trip.tags[0])}">See mates who like this</button></div></div></div>`;
        }
        const best = rank === 0 && n > 0 ? '<span class="best">Best match for you</span>' : '';
        return `<div class="trip has-pic"><div class="pic">${pictureHTML(dest.key, index, `${trip.name} in ${dest.city}`)}<span class="days">${trip.days} day${trip.days === 1 ? '' : 's'}</span></div><div class="bd"><div><h3>${esc(trip.name)} ${best}</h3><p>${esc(trip.text)}</p></div><div class="chips">${tags}</div><details class="plan"><summary>See the plan (${stops.length} places)</summary><ol class="stops">${stops.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details><div class="trip-actions"><button class="btn ghost sm" data-act="tripmates" data-tag="${esc(trip.tags[0])}">See mates who like this</button><button class="btn sm" data-act="planChat" data-dest="${esc(dest.key)}" data-i="${index}">Discuss in chat</button></div></div></div>`;
      })
      .join('');
    if (dest) body.innerHTML += `<p class="hint" style="margin-top:2px">Ideas for your trip, not bookable packages. Check details before you go.</p>`;
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
