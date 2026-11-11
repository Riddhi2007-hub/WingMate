/**
 * "Plan together": two travel mates look at trip plans for the place they are flying to, send plans or the places they
 * like into their chat, and see which places they both picked. It uses the ordinary chat messages (no new server
 * part): a plan or a list of picks is a message that starts with a small tag, and the chat draws it as a card.
 *
 *   [plan] Kuala Lumpur | Heritage KL | Merdeka Square; Central Market; Batu Caves
 *   [pick] Kuala Lumpur | Merdeka Square; Batu Caves
 */
import { $, closest, esc } from '../../shared/dom';
import { ApiError, api } from '../../shared/api';
import { findPerson } from '../data';
import { ALL_DESTINATIONS, destinationByKey, destinationFor, type Destination } from '../destinations';
import { refreshAll, show } from '../router';
import { sceneSVG } from '../scenes';
import { state } from '../state';
import { save, sync } from '../sync';
import { connectedPeople, toast } from '../ui';
import type { Person } from '../types';

/* ---------- the message format ---------- */

interface Parsed {
  kind: 'plan' | 'pick';
  city: string;
  name: string;
  stops: string[];
}

const clean = (text: string): string => text.replace(/[|;]/g, ',').trim();

export function parsePlan(text: string): Parsed | null {
  const m = /^\[(plan|pick)\] (.*)$/s.exec(text);
  if (!m) return null;
  const parts = (m[2] ?? '').split(' | ');
  const kind = m[1] === 'plan' ? 'plan' : 'pick';
  const city = parts[0] ?? '';
  const name = kind === 'plan' ? (parts[1] ?? '') : '';
  const stops = ((kind === 'plan' ? parts[2] : parts[1]) ?? '').split('; ').map((s) => s.trim()).filter(Boolean);
  return stops.length ? { kind, city, name, stops } : null;
}

export const planMessage = (city: string, name: string, stops: string[]): string => `[plan] ${clean(city)} | ${clean(name)} | ${stops.map(clean).join('; ')}`;
export const pickMessage = (city: string, stops: string[]): string => `[pick] ${clean(city)} | ${stops.map(clean).join('; ')}`;

/** A short line for the chat list. */
export function planPreview(text: string): string | null {
  const p = parsePlan(text);
  if (!p) return null;
  return p.kind === 'plan' ? `Plan idea: ${p.name}` : `Picked ${p.stops.length} place${p.stops.length === 1 ? '' : 's'} in ${p.city}`;
}

/** The places both of you have picked (lower case), from the plans and picks each of you sent in this chat. */
export function commonPlaces(personId: string): Set<string> {
  const mine = new Set<string>();
  const theirs = new Set<string>();
  for (const m of state.chats[personId] ?? []) {
    const p = parsePlan(m.text);
    if (!p) continue;
    // sending a plan, or ticking places, means you like those places
    for (const s of p.stops) (m.from === 'me' ? mine : theirs).add(s.toLowerCase());
  }
  return new Set([...mine].filter((s) => theirs.has(s)));
}

/** All places either of you picked, with who picked them. */
function pickedBy(personId: string): Map<string, { me: boolean; them: boolean; label: string }> {
  const out = new Map<string, { me: boolean; them: boolean; label: string }>();
  for (const m of state.chats[personId] ?? []) {
    const p = parsePlan(m.text);
    if (!p) continue;
    for (const s of p.stops) {
      const e = out.get(s.toLowerCase()) ?? { me: false, them: false, label: s };
      if (m.from === 'me') e.me = true;
      else e.them = true;
      out.set(s.toLowerCase(), e);
    }
  }
  return out;
}

/** The strip above a chat that lists the places you both picked. */
export function commonStripHTML(person: Person): string {
  const picked = pickedBy(person.id);
  if (!picked.size) return '';
  const both = [...picked.values()].filter((e) => e.me && e.them);
  const rest = [...picked.values()].filter((e) => !(e.me && e.them));
  const chip = (e: { label: string; me: boolean; them: boolean }, cls: string): string => `<span class="pchip ${cls}">${cls === 'both' ? '&#10003; ' : ''}${esc(e.label)}</span>`;
  return `<div class="common"><b>${both.length ? 'Places you both picked' : 'No places in common yet'}</b>${both.length ? `<div class="pchips">${both.map((e) => chip(e, 'both')).join('')}</div>` : ''}${rest.length ? `<small>Picked by only one of you: ${rest.map((e) => `${esc(e.label)} (${e.me ? 'you' : esc(person.name.split(' ')[0] ?? 'them')})`).join(', ')}</small>` : ''}</div>`;
}

/** A plan or a list of picks drawn as a card inside a chat bubble (null when the message is plain text). */
export function planCardHTML(text: string, from: 'me' | 'them', personId: string): string | null {
  const p = parsePlan(text);
  if (!p) return null;
  const common = commonPlaces(personId);
  const chips = p.stops.map((s) => `<span class="pchip ${common.has(s.toLowerCase()) ? 'both' : ''}">${common.has(s.toLowerCase()) ? '&#10003; ' : ''}${esc(s)}</span>`).join('');
  const dest = ALL_DESTINATIONS.find((d) => d.city === p.city);
  const trip = dest?.trips.find((t) => t.name === p.name);
  const pic = dest && p.kind === 'plan' ? `<div class="pc-pic">${sceneSVG(dest.key, trip ? dest.trips.indexOf(trip) : 0, p.name, 'xMidYMid')}</div>` : '';
  const data = `data-city="${esc(p.city)}" data-stops="${esc(p.stops.join('; '))}"`;
  if (p.kind === 'plan') {
    const actions = from === 'them' ? `<div class="pc-act"><button type="button" class="btn sm" data-plan-in ${data}>I’m in</button> <button type="button" class="btn sm ghost" data-plan-open="${esc(personId)}" data-dest="${esc(dest?.key ?? '')}">Pick places</button></div>` : '';
    return `<div class="pcard">${pic}<div class="pc-t">Plan idea: <b>${esc(p.name)}</b> <span>${esc(p.city)}</span></div><div class="pchips">${chips}</div>${actions}</div>`;
  }
  return `<div class="pcard pick"><div class="pc-t">Places I would like to visit <span>${esc(p.city)}</span></div><div class="pchips">${chips}</div></div>`;
}

/* ---------- which places can this chat plan for ---------- */

/** Places you could plan for with this person: where the flights you share are going. */
export function destinationsFor(person: Person): Destination[] {
  const seen = new Set<string>();
  const out: Destination[] = [];
  for (const f of person.flights) {
    const d = destinationFor(f.to);
    if (d && !seen.has(d.key)) {
      seen.add(d.key);
      out.push(d);
    }
  }
  return out;
}

/* ---------- sending ---------- */

async function sendText(personId: string, text: string): Promise<boolean> {
  try {
    await save(() => api('POST', '/api/messages', { to: personId, text }));
    await sync();
    refreshAll();
    return true;
  } catch (error: unknown) {
    toast(error instanceof ApiError ? error.message : 'Message not sent. Try again.');
    return false;
  }
}

/* ---------- the picker ---------- */

let modalPerson: string | null = null;
let modalDest: string | null = null;

function renderModal(): void {
  const person = findPerson(modalPerson);
  if (!person) return;
  const dests = destinationsFor(person);
  const dest = dests.find((d) => d.key === modalDest) ?? dests[0];
  if (!dest) return;
  modalDest = dest.key;
  $('#plTitle').textContent = `Plan together with ${person.name.split(' ')[0] ?? 'them'}`;
  $('#plSub').textContent = `Ideas for ${dest.city}. Tick the places you like and send them to the chat. Whatever you both pick shows up as a shared list.`;
  $('#plTabs').innerHTML =
    dests.length > 1 ? dests.map((d) => `<button type="button" class="chip ${d.key === dest.key ? 'on' : ''}" data-pl-dest="${esc(d.key)}">${esc(d.city)}</button>`).join('') : '';
  $('#plList').innerHTML = dest.trips
    .map(
      (t, i) => `<article class="pl">
      <div class="pl-pic">${sceneSVG(dest.key, i, `${t.name} in ${dest.city}`)}</div>
      <div class="pl-bd"><div class="pl-h"><b>${esc(t.name)}</b><span>${t.days} day${t.days === 1 ? '' : 's'}</span></div>
        <p>${esc(t.text)}</p>
        <div class="pl-stops">${t.stops.map((s) => `<label class="stop"><input type="checkbox" data-stop value="${esc(s)}"><span>${esc(s)}</span></label>`).join('')}</div>
        <button type="button" class="btn sm ghost" data-plan-send="${i}">Send this plan</button>
      </div></article>`,
    )
    .join('');
  updatePicksButton();
}

function checkedStops(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>('#plList input[data-stop]:checked')].map((i) => i.value);
}

function updatePicksButton(): void {
  const n = checkedStops().length;
  const b = $<HTMLButtonElement>('#plSendPicks');
  b.disabled = n === 0;
  b.textContent = n ? `Send my ${n} pick${n === 1 ? '' : 's'}` : 'Tick places to send';
}

export function openPlanModal(personId: string, destKey?: string, highlight?: number): void {
  const person = findPerson(personId);
  if (!person || !destinationsFor(person).length) {
    toast('There are no plan ideas for this flight yet.');
    return;
  }
  modalPerson = personId;
  modalDest = destKey || null;
  renderModal();
  $('#planModal').hidden = false;
  if (highlight !== undefined) {
    const el = document.querySelectorAll('#plList .pl')[highlight];
    el?.classList.add('flash');
    el?.scrollIntoView({ block: 'nearest' });
  }
}

const closeModal = (): void => {
  $('#planModal').hidden = true;
};

/** From a trip idea on Home: pick a travel mate whose flight goes there and open the plan picker in the chat. */
export function planFromHome(destKey: string, index: number): void {
  const people = connectedPeople();
  if (!people.length) {
    toast('Connect with someone on your flight first. Then you can plan together in the chat.');
    return;
  }
  const match = people.find((p) => destinationsFor(p).some((d) => d.key === destKey)) ?? people[0];
  if (!match) return;
  state.activeChat = match.id;
  show('messages', true);
  openPlanModal(match.id, destKey, index);
}

export function initPlan(): void {
  document.addEventListener('click', (event) => {
    const open = closest(event, '[data-plan-open]');
    if (open?.dataset.planOpen) {
      openPlanModal(open.dataset.planOpen, open.dataset.dest);
      return;
    }
    const home = closest(event, '[data-act="planChat"]');
    if (home) {
      planFromHome(home.dataset.dest ?? '', Number(home.dataset.i ?? 0));
      return;
    }
    const yes = closest(event, '[data-plan-in]');
    if (yes && state.activeChat) {
      const stops = (yes.dataset.stops ?? '').split('; ').filter(Boolean);
      void sendText(state.activeChat, pickMessage(yes.dataset.city ?? '', stops)).then((ok) => ok && toast('Sent. You will see which places you both picked.'));
      return;
    }
    const tab = closest(event, '[data-pl-dest]');
    if (tab) {
      modalDest = tab.dataset.plDest ?? null;
      renderModal();
      return;
    }
    const send = closest(event, '[data-plan-send]');
    if (send && modalPerson && modalDest) {
      const d = destinationByKey(modalDest);
      const t = d?.trips[Number(send.dataset.planSend)];
      if (d && t) {
        const id = modalPerson;
        void sendText(id, planMessage(d.city, t.name, t.stops)).then((ok) => {
          if (ok) {
            closeModal();
            toast('Plan sent to the chat');
          }
        });
      }
    }
  });
  document.addEventListener('change', (event) => {
    if ((event.target as HTMLElement).matches?.('#plList input[data-stop]')) updatePicksButton();
  });
  $('#plClose').addEventListener('click', closeModal);
  $('#planModal').addEventListener('click', (event) => {
    if ((event.target as HTMLElement).id === 'planModal') closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#planModal').hidden) closeModal();
  });
  $('#plSendPicks').addEventListener('click', () => {
    const stops = checkedStops();
    const d = modalDest ? destinationByKey(modalDest) : undefined;
    if (!stops.length || !modalPerson || !d) return;
    const id = modalPerson;
    void sendText(id, pickMessage(d.city, stops)).then((ok) => {
      if (ok) {
        closeModal();
        toast('Your picks are in the chat');
      }
    });
  });
}
