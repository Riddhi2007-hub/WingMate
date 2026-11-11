/**
 * Group chats in the Messages tab: start a group with travel mates you are connected with (a family trip, or solo
 * travellers heading the same way), add more people later, or leave. Invited people must accept before they join.
 */
import { $, closest, esc } from '../../shared/dom';
import { ApiError, api } from '../../shared/api';
import { state } from '../state';
import { save, sync } from '../sync';
import { connectedPeople, fmtTime, initials, toast } from '../ui';
import type { GroupDto } from '../types';

const MAX = 8;
export const groupKey = (id: string): string => `g:${id}`;
export const groupOf = (key: string | null): GroupDto | undefined =>
  key?.startsWith('g:') ? state.groups.find((g) => g.id === key.slice(2)) : undefined;

const groupAvatar = (g: GroupDto): string => `<span class="av gav c${Number(g.id) % 6}" aria-hidden="true">${esc(initials(g.name) || 'G')}</span>`;

/** Joined groups for the chat list. */
export function groupListHTML(): string {
  return state.groups
    .filter((g) => g.myStatus === 'joined')
    .map((g) => {
      const key = groupKey(g.id);
      const thread = state.groupChats[g.id] ?? [];
      const last = thread[thread.length - 1];
      const unread = state.unread[key];
      const joined = g.members.filter((m) => m.status === 'joined').length;
      return `<button class="conv ${key === state.activeChat ? 'active' : ''}" data-chat="${esc(key)}">${groupAvatar(g)}<span class="nm"><b>${esc(g.name)}</b><span>${last ? `${esc(last.from === 'me' ? 'You' : last.by.split(' ')[0] ?? '')}: ${esc(last.text)}` : 'Say hello to the group'}</span><small class="cflight">&#128101; ${joined} ${joined === 1 ? 'person' : 'people'}</small></span>${unread ? `<span class="ub">${unread}</span>` : ''}</button>`;
    })
    .join('');
}

/** Group invitations, shown with the connection requests. */
export function groupInvitesHTML(): string {
  return state.groups
    .filter((g) => g.myStatus === 'invited')
    .map((g) => {
      const names = g.members.filter((m) => m.status === 'joined').map((m) => m.name).join(', ');
      return `<div class="conv">${groupAvatar(g)}<span class="nm"><b>${esc(g.name)}</b><span>Invited by ${esc(g.invitedBy ?? 'someone')}</span><small class="cflight">&#128101; ${esc(names)}</small></span><span><button class="btn sm" data-group-accept="${esc(g.id)}">Join</button> <button class="btn sm ghost" data-group-decline="${esc(g.id)}">Decline</button></span></div>`;
    })
    .join('');
}

export const pendingGroupInvites = (): number => state.groups.filter((g) => g.myStatus === 'invited').length;

/** The open group chat. */
export function renderGroupThread(g: GroupDto): void {
  const typing = document.activeElement?.matches('#msgInput') ?? false;
  const draft = typing ? $<HTMLInputElement>('#msgInput').value : '';
  const joined = g.members.filter((m) => m.status === 'joined');
  const invited = g.members.filter((m) => m.status === 'invited');
  const memberLine = `${joined.map((m) => esc(m.name)).join(', ')}${invited.length ? ` · ${invited.length} invited` : ''}`;
  const bubbles = (state.groupChats[g.id] ?? [])
    .map((m) => `<div class="bub ${m.from}">${m.from === 'them' ? `<b class="by">${esc(m.by)}</b>` : ''}${esc(m.text)}<small>${fmtTime(m.t)}</small></div>`)
    .join('');
  const canAdd = g.members.length < MAX && connectedPeople().some((p) => !g.members.some((m) => m.id === p.id));
  $('#thread').innerHTML = `
    <div class="th-head">${groupAvatar(g)}<div class="nm"><b>${esc(g.name)}</b><span>${memberLine}</span></div><span class="th-tools">${canAdd ? `<button class="btn sm" data-group-add="${esc(g.id)}" type="button">Add people</button> ` : ''}<button class="btn sm ghost" data-group-leave="${esc(g.id)}" type="button">Leave</button></span></div>
    <div class="banners"><div class="banner">Group chat. Everyone here accepted an invite. Only people you are connected with can be added.</div></div>
    <div class="bubbles" id="bubbles" aria-live="polite">${bubbles || '<p class="muted small" style="text-align:center;margin-top:20px">No messages yet. Say hello!</p>'}</div>
    <form class="composer" id="composer"><input type="text" id="msgInput" maxlength="1000" placeholder="Message ${esc(g.name)}" aria-label="Message" autocomplete="off"><button class="btn">Send</button></form>`;
  const scroller = $('#bubbles');
  scroller.scrollTop = scroller.scrollHeight;
  if (typing) {
    const box = $<HTMLInputElement>('#msgInput');
    box.value = draft;
    box.focus();
  }
}

export async function sendGroupMessage(groupId: string, text: string): Promise<void> {
  await save(() => api('POST', '/api/groups/messages', { id: groupId, text }));
  await sync();
}

/* ---------- create a group / add people ---------- */

let modalGroup: string | null = null;

function openModal(groupId: string | null): void {
  modalGroup = groupId;
  const g = groupId ? state.groups.find((x) => x.id === groupId) : undefined;
  const people = connectedPeople().filter((p) => !g?.members.some((m) => m.id === p.id));
  $('#gmTitle').textContent = g ? `Add people to ${g.name}` : 'New group chat';
  $('#gmSub').textContent = g
    ? 'They get an invite and join only if they accept.'
    : 'For a family trip, or solo travellers heading the same way. Everyone you add gets an invite and joins only if they accept.';
  $('#gmNameRow').hidden = !!g;
  $<HTMLInputElement>('#gmName').value = '';
  $('#gmList').innerHTML = people.length
    ? people.map((p) => `<label class="stop"><input type="checkbox" value="${esc(p.id)}"><span>${esc(p.name)}</span></label>`).join('')
    : '<p class="muted small">Everyone you are connected with is already here. Connect with more travel mates on Find travel mates.</p>';
  $('#gmErr').textContent = '';
  $('#groupModal').hidden = false;
  (g ? document.querySelector<HTMLInputElement>('#gmList input') : $<HTMLInputElement>('#gmName'))?.focus();
}

const closeModal = (): void => {
  $('#groupModal').hidden = true;
};

export function initGroups(onChange: () => void): void {
  document.addEventListener('click', (event) => {
    if (closest(event, '[data-group-new]')) return openModal(null);
    const add = closest(event, '[data-group-add]');
    if (add?.dataset.groupAdd) return openModal(add.dataset.groupAdd);
    const accept = closest(event, '[data-group-accept]');
    if (accept?.dataset.groupAccept) {
      const id = accept.dataset.groupAccept;
      void save(() => api('POST', '/api/groups/respond', { id, accept: true }))
        .then(async () => {
          await sync();
          state.activeChat = groupKey(id);
          onChange();
          toast('You joined the group');
        })
        .catch(() => toast('Could not join. Try again.'));
      return;
    }
    const decline = closest(event, '[data-group-decline]');
    if (decline?.dataset.groupDecline) {
      void save(() => api('POST', '/api/groups/respond', { id: decline.dataset.groupDecline, accept: false })).then(() => toast('Invite declined'));
      return;
    }
    const leave = closest(event, '[data-group-leave]');
    if (leave?.dataset.groupLeave) {
      const id = leave.dataset.groupLeave;
      void save(() => api('POST', '/api/groups/leave', { id }))
        .then(async () => {
          state.activeChat = null;
          delete state.groupChats[id];
          await sync();
          onChange();
          toast('You left the group');
        })
        .catch(() => toast('Could not leave. Try again.'));
    }
  });
  $('#gmCancel').addEventListener('click', closeModal);
  $('#groupModal').addEventListener('click', (event) => {
    if ((event.target as HTMLElement).id === 'groupModal') closeModal();
  });
  $('#groupForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const invite = [...document.querySelectorAll<HTMLInputElement>('#gmList input:checked')].map((i) => i.value);
    if (!invite.length) {
      $('#gmErr').textContent = 'Pick at least one travel mate.';
      return;
    }
    const groupId = modalGroup;
    const request = groupId
      ? api('POST', '/api/groups/invite', { id: groupId, invite })
      : api<{ id: string }>('POST', '/api/groups', { name: $<HTMLInputElement>('#gmName').value, invite });
    void save(() => request)
      .then(async (res) => {
        closeModal();
        await sync();
        if (!groupId && res && typeof res === 'object' && 'id' in res) state.activeChat = groupKey(String((res as { id: string }).id));
        onChange();
        toast(groupId ? 'Invites sent' : 'Group created. Your travel mates have been invited.');
      })
      .catch((error: unknown) => {
        $('#gmErr').textContent = error instanceof ApiError ? error.message : 'Could not save. Try again.';
      });
  });
}
