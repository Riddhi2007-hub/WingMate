import { $, closest, esc } from '../../shared/dom';
import { ApiError, api } from '../../shared/api';
import { findPerson, getPeople } from '../data';
import { closesIn, stageLabel } from '../flight';
import { stageOf } from '../../shared/stage';
import { nowMs, state } from '../state';
import { save, sync } from '../sync';
import { commonStripHTML, destinationsFor, planCardHTML, planPreview } from './plan';
import { groupInvitesHTML, groupListHTML, groupOf, renderGroupThread, sendGroupMessage } from './groups';
import { avatar, connectedPeople, fmtTime, flightTags, toast, updateNavDot } from '../ui';

/** Clears the unread count for a chat and tells the server. */
export function markRead(id: string): void {
  if (!state.unread[id]) return;
  state.unread[id] = 0;
  updateNavDot();
  if (id.startsWith('g:')) return; // group messages are counted on this device only
  void api('POST', '/api/read', { with: id }).catch(() => undefined);
}

/** A message from someone else arrived while the page was open. */
export function onIncoming(id: string): void {
  if (state.currentView === 'messages' && state.activeChat === id) markRead(id);
}

/** Runs each time the Messages tab opens. */
export function onShowMessages(): void {
  if (state.activeChat) markRead(state.activeChat);
  renderMessages();
}

function requestsHTML(): string {
  const incoming = getPeople().filter((p) => state.conn[p.id] === 'incoming');
  if (!incoming.length) return '';
  return `<div class="conv-head small muted" style="padding:8px 12px">Requests</div>${incoming
    .map(
      (p) =>
        `<div class="conv">${avatar(p)}<span class="nm"><b>${esc(p.name)}</b><span>wants to connect</span></span><span><button class="btn sm" data-act="accept" data-id="${esc(p.id)}">Accept</button> <button class="btn sm ghost" data-act="decline" data-id="${esc(p.id)}">Decline</button></span></div>`,
    )
    .join('')}`;
}

export function renderMessages(): void {
  const typing = document.activeElement?.matches('#msgInput') ?? false;
  const draft = typing ? $<HTMLInputElement>('#msgInput').value : '';

  const people = connectedPeople();
  const groupKeys = state.groups.filter((g) => g.myStatus === 'joined').map((g) => `g:${g.id}`);
  if (!people.some((p) => p.id === state.activeChat) && !groupKeys.includes(state.activeChat ?? '')) state.activeChat = groupKeys[0] ?? people[0]?.id ?? null;

  const list = people
    .map((p) => {
      const thread = state.chats[p.id] ?? [];
      const last = thread[thread.length - 1];
      const unread = state.unread[p.id];
      return `<button class="conv ${p.id === state.activeChat ? 'active' : ''}" data-chat="${esc(p.id)}">${avatar(p)}<span class="nm"><b>${esc(p.name)}</b><span>${last ? esc(planPreview(last.text) ?? last.text) : 'Say hello'}</span>${p.flights.length ? `<small class="cflight">&#9992; ${esc(p.flights.map((f) => f.number).join(', '))}</small>` : ''}</span>${unread ? `<span class="ub">${unread}</span>` : ''}</button>`;
    })
    .join('');
  const groupInvites = groupInvitesHTML();
  const requests = requestsHTML() + (groupInvites && !requestsHTML() ? `<div class="conv-head small muted" style="padding:8px 12px">Requests</div>` : '') + groupInvites;
  const top = people.length ? `<div class="conv-top"><button class="btn sm" type="button" data-group-new>+ New group</button></div>` : '';
  const groups = groupListHTML();
  $('#convs').innerHTML =
    top + groups + list + requests ||
    `<div class="empty"><h3>No chats yet</h3><p>Connect with someone to start chatting.</p></div>`;

  const group = groupOf(state.activeChat);
  if (group) {
    renderGroupThread(group);
    return;
  }

  const thread = $('#thread');
  const person = findPerson(state.activeChat);
  if (!person) {
    thread.innerHTML = `<div class="empty" style="align-self:center;grid-row:1/-1"><h3>Your chats will show here</h3><p style="margin-bottom:14px">Find a travel mate and send a connection request.</p><a class="btn" href="#find">Find travel mates</a></div>`;
    return;
  }

  const window = state.windows[person.id];
  const closed = window?.closed ?? false;
  // the stage of the flight this chat is about: the next one you share that has not landed, or the last one
  const shared = person.flights;
  const chatFlight = shared.find((f) => f.landsAt > nowMs()) ?? shared[shared.length - 1];
  const stage = chatFlight ? stageOf(chatFlight, nowMs()) : 'pre';
  let banner: string;
  if (closed) banner = `<div class="banner closed">This chat closed 48 hours after landing. You can no longer send messages.</div>`;
  else if (stage === 'pre') banner = `<div class="banner">Chat is open from booking. You can keep chatting on board.</div>`;
  else if (stage === 'in') banner = `<div class="banner">In-flight chat.</div>`;
  else banner = `<div class="banner warn">You have landed. This chat closes in ${closesIn(window) ?? '0h 0m'} (48 hours after landing).</div>`;

  const bubbles = (state.chats[person.id] ?? [])
    .map((m) => {
      const card = planCardHTML(m.text, m.from, person.id);
      return card ? `<div class="bub ${m.from} plan">${card}<small>${fmtTime(m.t)}</small></div>` : `<div class="bub ${m.from}">${esc(m.text)}<small>${fmtTime(m.t)}</small></div>`;
    })
    .join('');

  thread.innerHTML = `
    <div class="th-head">${avatar(person)}<div class="nm"><b>${esc(person.name)}</b><span>${esc(stageLabel(closed ? 'closed' : stage))}</span>${flightTags(person)}</div><span class="th-tools">${!closed && destinationsFor(person).length ? `<button class="btn sm" data-plan-open="${esc(person.id)}" type="button">Plan together</button> ` : ''}<button class="btn sm ghost" data-block="${esc(person.id)}" type="button">Block</button> <button class="btn sm ghost" data-report="${esc(person.id)}" type="button">Report</button></span></div>
    <div class="banners">${banner}${commonStripHTML(person)}</div>
    <div class="bubbles" id="bubbles" aria-live="polite">${bubbles}</div>
    <form class="composer" id="composer"><input type="text" id="msgInput" maxlength="1000" placeholder="${closed ? 'This chat is closed' : 'Write a message'}" ${closed ? 'disabled' : ''} aria-label="Message" autocomplete="off"><button class="btn" ${closed ? 'disabled' : ''}>Send</button></form>`;
  const scroller = $('#bubbles');
  scroller.scrollTop = scroller.scrollHeight;
  if (typing && !closed) {
    const box = $<HTMLInputElement>('#msgInput');
    box.value = draft;
    box.focus();
  }
}

export function initMessages(): void {
  document.addEventListener('click', (event) => {
    const block = closest(event, '[data-block]');
    if (block?.dataset.block) {
      const id = block.dataset.block;
      void save(() => api('POST', '/api/block', { userId: id }))
        .then(() => {
          state.activeChat = null;
          toast('Blocked. They can no longer see you or message you.');
        })
        .catch(() => toast('Could not block. Try again.'));
      return;
    }
    const report = closest(event, '[data-report]');
    if (report?.dataset.report) {
      const id = report.dataset.report;
      void api('POST', '/api/report', { userId: id, reason: 'Reported from chat' })
        .then(() => toast('Report sent. Thank you.'))
        .catch(() => toast('Could not send the report.'));
      return;
    }
    const conv = closest(event, '[data-chat]');
    const id = conv?.dataset.chat;
    if (!id) return;
    state.activeChat = id;
    markRead(id);
    renderMessages();
  });

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'composer') return;
    event.preventDefault();
    const field = $<HTMLInputElement>('#msgInput');
    const text = field.value.trim();
    const id = state.activeChat;
    if (!text || !id) return;
    field.value = '';
    if (id.startsWith('g:')) {
      void sendGroupMessage(id.slice(2), text)
        .then(() => renderMessages())
        .catch((error: unknown) => {
          field.value = text;
          toast(error instanceof ApiError ? error.message : 'Message not sent. Try again.');
        });
      return;
    }
    void save(() => api('POST', '/api/messages', { to: id, text }))
      .then(() => sync().then(() => renderMessages()))
      .catch((error: unknown) => {
        field.value = text;
        toast(error instanceof ApiError ? error.message : 'Message not sent. Try again.');
      });
  });

  // keep the "closes in 44h 59m" countdown fresh
  window.setInterval(() => {
    const typing = document.activeElement?.matches('#msgInput') ?? false;
    if (state.currentView === 'messages' && !typing) renderMessages();
  }, 60000);
}
