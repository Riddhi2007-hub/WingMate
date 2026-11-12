/**
 * Trips & agents: a small marketplace. Travel agents list trips for the places guests fly to; a guest (alone or with a
 * group) asks about a trip and the agent replies here. Trips that fit where you are going and what you like come
 * first. A few clearly marked SAMPLE trips are always shown so the page is never empty. In the live version agents
 * would be vetted by the airline and bookings and payments would go through its systems.
 */
import { $, closest, esc } from '../../shared/dom';
import { ApiError, api } from '../../shared/api';
import { currencyNote, money } from '../../shared/currency';
import { ALL_DESTINATIONS, destinationByKey, destinationFor } from '../destinations';
import { INTERESTS } from '../options';
import { pictureHTML } from '../scenes';
import { state } from '../state';
import { toast } from '../ui';

interface Offer {
  id: string;
  sample: boolean;
  agent: string;
  city: string;
  dest: string;
  destCity: string;
  title: string;
  days: number;
  price: number;
  text: string;
  tags: string[];
  mine?: boolean;
}
interface MyRequest { offer: string; title: string; party: number; note: string; reply: string | null; at: number; sample: boolean }
interface InboxItem { offer: string; title: string; user: string; who: string; party: number; note: string; reply: string | null; at: number }
interface Market {
  offers: Offer[];
  agent: { name: string; city: string; about: string } | null;
  requests: MyRequest[];
  inbox: InboxItem[];
  demand: Record<string, number>;
}

let data: Market | null = null;
let selected = ''; // destination key, or '' for all
let onSubmit: ((form: HTMLFormElement) => Promise<void>) | null = null;

const myDests = (): string[] => [...new Set(state.flights.map((f) => destinationFor(f.to)?.key).filter((k): k is string => !!k))];

/** Trips for where I am going first, then the ones that share the most of my interests (once I have chosen them). */
function ordered(offers: Offer[]): Array<{ o: Offer; fit: number; best: boolean }> {
  const dests = new Set(myDests());
  const mine = new Set<string>(state.prefsSet ? state.prefs.interests : []);
  const scored = offers.map((o) => ({ o, fit: o.tags.filter((t) => mine.has(t)).length, there: dests.has(o.dest) }));
  scored.sort((a, b) => Number(b.there) - Number(a.there) || b.fit - a.fit || a.o.id.localeCompare(b.o.id));
  const bestId = scored.find((s) => s.there && s.fit > 0)?.o.id;
  return scored.map((s) => ({ o: s.o, fit: s.fit, best: s.o.id === bestId }));
}

function offerCard({ o, best }: { o: Offer; fit: number; best: boolean }): string {
  const req = data?.requests.find((r) => r.offer === o.id);
  const mineInterests = new Set<string>(state.prefsSet ? state.prefs.interests : []);
  const tags = o.tags.map((t) => `<span class="chip ${mineInterests.has(t) ? 'soft' : ''}">${mineInterests.has(t) ? '✓ ' : ''}${esc(t)}</span>`).join('');
  const photo = pictureHTML(o.dest, Number(o.id.replace(/\D/g, '')) % 4, `${o.title} in ${o.destCity}`);
  const reply = req?.reply ? `<div class="mkt-reply"><b>${esc(o.agent)} replied</b><p>${esc(req.reply)}</p></div>` : '';
  const action = o.mine
    ? `<span class="chip soft">Your listing</span> <button class="btn ghost sm" data-mkt-remove="${esc(o.id)}" type="button">Remove</button>`
    : req
      ? `<span class="chip soft">Asked for ${req.party} ${req.party === 1 ? 'person' : 'people'}</span> <button class="btn ghost sm" data-mkt-ask="${esc(o.id)}" type="button">Change</button> <button class="btn ghost sm" data-mkt-withdraw="${esc(o.id)}" type="button">Withdraw</button>`
      : `<button class="btn sm" data-mkt-ask="${esc(o.id)}" type="button">Ask about this trip</button>`;
  return `<div class="trip has-pic"><div class="pic">${photo}<span class="days">${o.days} day${o.days === 1 ? '' : 's'}</span></div><div class="bd">
    <div><h3>${esc(o.title)} ${best ? '<span class="best">Best match for you</span>' : ''}</h3>
      <p class="muted small">${esc(o.destCity)} · by ${esc(o.agent)}${o.sample ? '' : ` (${esc(o.city)})`}</p>
      <p>${esc(o.text)}</p></div>
    <div class="chips">${tags}</div>
    <p class="mkt-price"><b>from ${money(o.price)}</b> per person${o.sample ? ' · sample listing' : ''}</p>
    ${reply}
    <div class="trip-actions">${action}</div></div></div>`;
}

function renderAgent(): void {
  const box = $('#mktAgent');
  if (!data) return;
  if (!data.agent) {
    box.innerHTML = `<div class="card-head"><h2>Are you a travel agent?</h2></div><p class="muted">List your trips here and reach guests who are flying to your city. You only see a guest's first name and last initial, how many are travelling and what they wrote to you. Guests never see your contact details unless you share them in a reply.</p><button class="btn" data-mkt-register type="button" style="margin-top:12px">Register as a travel agent</button>`;
    return;
  }
  const mine = data.offers.filter((o) => o.mine);
  const lines = mine.map((o) => {
    const n = data?.demand[o.dest] ?? 0;
    const asks = data?.inbox.filter((i) => i.offer === o.id).length ?? 0;
    return `<div class="sum-row"><span><b>${esc(o.title)}</b> · ${esc(o.destCity)} · ${money(o.price)}</span><span>${n} ${n === 1 ? 'guest is' : 'guests are'} flying there now · ${asks} ${asks === 1 ? 'request' : 'requests'}</span></div>`;
  }).join('');
  const inbox = data.inbox.length
    ? data.inbox.map((i) => `<div class="mkt-ask"><div><b>${esc(i.who)}</b> asked about <b>${esc(i.title)}</b> for ${i.party} ${i.party === 1 ? 'person' : 'people'}${i.note ? `<p class="muted small">“${esc(i.note)}”</p>` : ''}${i.reply ? `<p class="mkt-reply"><b>You replied</b> ${esc(i.reply)}</p>` : ''}</div><button class="btn sm ${i.reply ? 'ghost' : ''}" data-mkt-reply="${esc(i.offer)}|${esc(i.user)}" type="button">${i.reply ? 'Edit reply' : 'Reply'}</button></div>`).join('')
    : '<p class="muted">No requests yet. They appear here when a guest asks about one of your trips.</p>';
  box.innerHTML = `<div class="card-head"><h2>${esc(data.agent.name)} <span class="muted small">· ${esc(data.agent.city)}</span></h2><button class="btn sm" data-mkt-new type="button">List a trip</button></div>
    ${lines || '<p class="muted">You have not listed a trip yet.</p>'}
    <h3 style="margin:16px 0 8px">Requests from guests</h3>${inbox}`;
}

export function renderMarket(): void {
  $('#curNoteMkt').textContent = currencyNote();
  if (!data) {
    $('#mktOffers').innerHTML = '<p class="muted">Loading trips…</p>';
    return;
  }
  const mine = myDests();
  const chips = [['', 'All places'], ...mine.map((k) => [k, destinationByKey(k)?.city ?? k] as [string, string])];
  $('#mktDest').innerHTML = chips.map(([k, label]) => `<button type="button" class="chip ${selected === k ? 'on' : ''}" data-mkt-dest="${esc(k)}" aria-pressed="${selected === k}"><span class="tick">✓</span>${esc(label ?? '')}</button>`).join('');
  const list = ordered(data.offers.filter((o) => !selected || o.dest === selected));
  $('#mktOffers').innerHTML = list.length
    ? list.map(offerCard).join('')
    : `<div class="card empty"><h3>No trips listed there yet</h3><p>Agents have not listed trips for this place. Check back soon, or look at all places.</p></div>`;
  renderAgent();
}

export async function loadMarket(): Promise<void> {
  try {
    data = await api<Market>('GET', '/api/market');
    renderMarket();
  } catch (error: unknown) {
    $('#mktOffers').innerHTML = `<p class="muted">${esc(error instanceof ApiError ? error.message : 'Could not load trips.')}</p>`;
  }
}

/* ---------- the small form dialog used for every action ---------- */

function openForm(title: string, sub: string, body: string, submit: string, handler: (form: HTMLFormElement) => Promise<void>): void {
  $('#mktTitle').textContent = title;
  $('#mktSub').textContent = sub;
  $('#mktBody').innerHTML = body;
  $('#mktErr').textContent = '';
  $('#mktSubmit').textContent = submit;
  onSubmit = handler;
  $('#mktModal').hidden = false;
  $<HTMLElement>('#mktBody input, #mktBody select, #mktBody textarea').focus();
}

const closeForm = (): void => {
  $('#mktModal').hidden = true;
  onSubmit = null;
};

const field = (id: string, label: string, control: string): string => `<div class="fld"><label class="lbl" for="${id}">${label}</label>${control}</div>`;

function askForm(offer: Offer): void {
  const prev = data?.requests.find((r) => r.offer === offer.id);
  const sizes = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${(prev?.party ?? 1) === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('');
  openForm(
    offer.title,
    `${offer.destCity} · from ${money(offer.price)} per person${offer.sample ? ' (sample listing: a real agent would reply here)' : ''}`,
    field('mkParty', 'How many people?', `<select id="mkParty" name="party">${sizes}</select>`) + field('mkNote', 'A note for the agent (optional)', `<textarea id="mkNote" name="note" rows="3" maxlength="300" placeholder="Dates, ages, what you would like to see">${esc(prev?.note ?? '')}</textarea>`),
    prev ? 'Update request' : 'Send request',
    async (f) => {
      await api('POST', '/api/market/request', { offer: offer.id, party: Number(new FormData(f).get('party')), note: String(new FormData(f).get('note') ?? '') });
      toast('Request sent');
    },
  );
}

function registerForm(): void {
  const a = data?.agent;
  openForm(
    a ? 'Your agency' : 'Register as a travel agent',
    'In this prototype anyone can register. In the live version the airline would check each agent first.',
    field('mkName', 'Business name', `<input id="mkName" name="name" type="text" maxlength="60" value="${esc(a?.name ?? '')}" required>`) +
      field('mkCity', 'City', `<input id="mkCity" name="city" type="text" maxlength="40" value="${esc(a?.city ?? '')}" required>`) +
      field('mkAbout', 'About your agency', `<textarea id="mkAbout" name="about" rows="3" maxlength="300" required>${esc(a?.about ?? '')}</textarea>`),
    'Save',
    async (f) => {
      const fd = new FormData(f);
      await api('POST', '/api/market/agent', { name: fd.get('name'), city: fd.get('city'), about: fd.get('about') });
      toast('You are registered as an agent');
    },
  );
}

function offerForm(): void {
  const dests = ALL_DESTINATIONS.map((d) => `<option value="${esc(d.key)}">${esc(d.city)}</option>`).join('');
  const tags = INTERESTS.map((i) => `<label class="stop"><input type="checkbox" name="tags" value="${esc(i)}"><span>${esc(i)}</span></label>`).join('');
  openForm(
    'List a trip',
    'Guests flying to this place will see it first.',
    field('mkDest', 'Destination', `<select id="mkDest" name="dest">${dests}</select>`) +
      field('mkTitle', 'Trip name', '<input id="mkTitle" name="title" type="text" maxlength="60" required placeholder="e.g. Two-day food crawl">') +
      `<div class="mkt-two">${field('mkDays', 'Days', '<input id="mkDays" name="days" type="number" min="1" max="14" value="2" required>')}${field('mkPrice', 'Price per person (MYR)', '<input id="mkPrice" name="price" type="number" min="1" max="50000" value="300" required>')}</div>` +
      field('mkText', 'What is included', '<textarea id="mkText" name="text" rows="3" maxlength="400" required></textarea>') +
      `<p class="lbl" style="margin-top:12px">Suits people who like (up to 4)</p><div class="pl-stops">${tags}</div>`,
    'List trip',
    async (f) => {
      const fd = new FormData(f);
      await api('POST', '/api/market/offers', { dest: fd.get('dest'), title: fd.get('title'), days: Number(fd.get('days')), price: Number(fd.get('price')), text: fd.get('text'), tags: fd.getAll('tags') });
      toast('Your trip is listed');
    },
  );
}

function replyForm(offerId: string, user: string): void {
  const item = data?.inbox.find((i) => i.offer === offerId && i.user === user);
  openForm(
    `Reply to ${item?.who ?? 'the guest'}`,
    item ? `About ${item.title}, ${item.party} ${item.party === 1 ? 'person' : 'people'}` : '',
    field('mkReply', 'Your reply', `<textarea id="mkReply" name="reply" rows="4" maxlength="300" required placeholder="Price, dates, how to book">${esc(item?.reply ?? '')}</textarea>`),
    'Send reply',
    async (f) => {
      await api('POST', '/api/market/reply', { offer: offerId, user: Number(user), reply: new FormData(f).get('reply') });
      toast('Reply sent');
    },
  );
}

export function initMarket(): void {
  document.addEventListener('click', (event) => {
    const dest = closest(event, '[data-mkt-dest]');
    if (dest && dest.dataset.mktDest !== undefined) {
      selected = dest.dataset.mktDest;
      renderMarket();
      return;
    }
    const ask = closest(event, '[data-mkt-ask]');
    if (ask?.dataset.mktAsk) {
      const offer = data?.offers.find((o) => o.id === ask.dataset.mktAsk);
      if (offer) askForm(offer);
      return;
    }
    if (closest(event, '[data-mkt-register]')) return registerForm();
    if (closest(event, '[data-mkt-new]')) return offerForm();
    const reply = closest(event, '[data-mkt-reply]');
    if (reply?.dataset.mktReply) {
      const [offer, user] = reply.dataset.mktReply.split('|');
      if (offer && user) replyForm(offer, user);
      return;
    }
    const withdraw = closest(event, '[data-mkt-withdraw]');
    if (withdraw?.dataset.mktWithdraw) {
      void api('DELETE', `/api/market/request?offer=${encodeURIComponent(withdraw.dataset.mktWithdraw)}`).then(() => { toast('Request withdrawn'); return loadMarket(); }).catch(() => toast('Could not withdraw. Try again.'));
      return;
    }
    const remove = closest(event, '[data-mkt-remove]');
    if (remove?.dataset.mktRemove) {
      void api('DELETE', `/api/market/offers?id=${encodeURIComponent(remove.dataset.mktRemove)}`).then(() => { toast('Trip removed'); return loadMarket(); }).catch(() => toast('Could not remove. Try again.'));
    }
  });
  $('#mktCancel').addEventListener('click', closeForm);
  $('#mktModal').addEventListener('click', (event) => {
    if ((event.target as HTMLElement).id === 'mktModal') closeForm();
  });
  $('#mktForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const handler = onSubmit;
    if (!handler) return;
    const form = event.currentTarget as HTMLFormElement;
    handler(form)
      .then(() => {
        closeForm();
        return loadMarket();
      })
      .catch((error: unknown) => {
        $('#mktErr').textContent = error instanceof ApiError ? error.message : 'Could not save. Try again.';
      });
  });
}
