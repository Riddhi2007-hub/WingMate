import { $, closest, esc } from '../../shared/dom';
import { ApiError, api } from '../../shared/api';
import { findPerson, getPeople } from '../data';
import { closesIn, stageLabel } from '../flight';
import { stageOf } from '../../shared/stage';
import { nowMs, state } from '../state';
import { save, sync } from '../sync';
import { avatar, connectedPeople, fmtTime, toast, updateNavDot } from '../ui';

/** Clears the unread count for a chat and tells the server. */
export function markRead(id: string): void {
  if (!state.unread[id]) return;
  state.unread[id] = 0;
  updateNavDot();
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
  if (!people.some((p) => p.id === state.activeChat)) state.activeChat = people[0]?.id ?? null;

  const list = people
    .map((p) => {
      const thread = state.chats[p.id] ?? [];
      const last = thread[thread.length - 1];
      const unread = state.unread[p.id];
      return `<button class="conv ${p.id === state.activeChat ? 'active' : ''}" data-chat="${esc(p.id)}">${avatar(p)}<span class="nm"><b>${esc(p.name)}</b><span>${last ? esc(last.text) : 'Say hello'}</span></span>${unread ? `<span class="ub">${unread}</span>` : ''}</button>`;
    })
    .join('');
  const requests = requestsHTML();
  $('#convs').innerHTML =
    list + requests ||
    `<div class="empty"><h3>No chats yet</h3><p>Connect with someone to start chatting.</p></div>`;

  const thread = $('#thread');
  const person = findPerson(state.activeChat);
  if (!person) {
    thread.innerHTML = `<div class="empty" style="align-self:center;grid-row:1/-1"><h3>Your chats will show here</h3><p style="margin-bottom:14px">Find a travel mate and send a connection request.</p><a class="btn" href="#find">Find travel mates</a></div>`;
    return;
  }

  const window = state.windows[person.id];
  const closed = window?.closed ?? false;
  const stage = state.flight ? stageOf(state.flight, nowMs()) : 'pre';
  let banner: string;
  if (closed) banner = `<div class="banner closed">This chat closed 48 hours after landing. You can no longer send messages.</div>`;
  else if (stage === 'pre') banner = `<div class="banner">Pre-flight chat. You can keep chatting once you are on board.</div>`;
  else if (stage === 'in') banner = `<div class="banner">In-flight chat.</div>`;
  else banner = `<div class="banner warn">You have landed. This chat closes in ${closesIn(window) ?? '0h 0m'} (48 hours after landing).</div>`;

  const bubbles = (state.chats[person.id] ?? [])
    .map((m) => `<div class="bub ${m.from}">${esc(m.text)}<small>${fmtTime(m.t)}</small></div>`)
    .join('');

  thread.innerHTML = `
    <div class="th-head">${avatar(person)}<div class="nm"><b>${esc(person.name)}</b><span>${esc(stageLabel(closed ? 'closed' : stage))}</span></div><span class="th-tools"><button class="btn sm ghost" data-block="${esc(person.id)}" type="button">Block</button> <button class="btn sm ghost" data-report="${esc(person.id)}" type="button">Report</button></span></div>
    ${banner}
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
