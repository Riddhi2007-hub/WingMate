/**
 * Actions that cross tabs: the "Open to connect" switch and every button with a data-act
 * attribute (Connect, Accept, Message, "See mates who like this" ...). Each change is sent to the server.
 */
import { $, closest } from '../shared/dom';
import { ApiError, api } from '../shared/api';
import { findPerson } from './data';
import { INTERESTS, isOneOf, type Interest } from './options';
import { emptyFilters, state } from './state';
import { refreshAll, show } from './router';
import { save, sync } from './sync';
import { syncVisibleToggles, toast } from './ui';
import { markRead } from './views/messages';
import type { Filters, Person } from './types';
import { BRAND } from '../shared/brand';

const firstName = (person: Person): string => person.name.split(' ')[0] ?? person.name;
const failure = (error: unknown): string => (error instanceof ApiError ? error.message : 'Something went wrong. Try again.');

export function setVisible(visible: boolean): void {
  state.visible = visible;
  syncVisibleToggles();
  refreshAll();
  void save(() => api('PUT', '/api/visible', { visible }))
    .then(() => toast(visible ? 'You are now open to connect' : `You are hidden from other ${BRAND.guests}`))
    .catch((e: unknown) => toast(failure(e)));
}

function connect(person: Person): void {
  if (!state.visible) {
    toast('Turn on “Open to connect” first');
    return;
  }
  state.conn[person.id] = 'requested';
  refreshAll();
  void save(() => api('POST', '/api/connections', { to: person.id }))
    .then(async () => {
      await sync();
      toast(state.conn[person.id] === 'connected' ? `You are now connected with ${firstName(person)}` : `Request sent to ${firstName(person)}`);
    })
    .catch(async (e: unknown) => {
      delete state.conn[person.id];
      await sync();
      refreshAll();
      toast(failure(e));
    });
}

function respond(person: Person, accept: boolean): void {
  state.conn[person.id] = accept ? 'connected' : undefined;
  void save(() => api('POST', '/api/connections/respond', { from: person.id, accept }))
    .then(async () => {
      await sync();
      refreshAll();
      toast(accept ? `You are now connected with ${firstName(person)}` : 'Request declined');
    })
    .catch((e: unknown) => toast(failure(e)));
}

/** Opens the Find tab with fresh filters. */
function openFind(filters: Partial<Filters>, interests: Interest[]): void {
  state.filters = { ...emptyFilters(), ...filters };
  state.interestFilter = interests;
  $<HTMLInputElement>('#q').value = '';
  show('find', true);
}

export function initActions(): void {
  $<HTMLInputElement>('#visibleToggle').addEventListener('change', (e) => setVisible((e.target as HTMLInputElement).checked));
  $<HTMLInputElement>('#visibleToggle2').addEventListener('change', (e) => setVisible((e.target as HTMLInputElement).checked));

  document.addEventListener('click', (event) => {
    const button = closest(event, '[data-act]');
    if (!button) return;
    const person = findPerson(button.dataset.id ?? null);

    switch (button.dataset.act) {
      case 'connect':
        if (person) connect(person);
        break;
      case 'accept':
        if (person) respond(person, true);
        break;
      case 'decline':
        if (person) respond(person, false);
        break;
      case 'message':
        if (person) {
          state.activeChat = person.id;
          markRead(person.id);
          show('messages', true);
        }
        break;
      case 'goVisible':
        setVisible(true);
        break;
      case 'clearFilters':
        $('#resetFilters').click();
        break;
      case 'tripmates': {
        const tag = button.dataset.tag;
        openFind({}, isOneOf(INTERESTS, tag) ? [tag] : []);
        break;
      }
      case 'cabmates':
        openFind({ why: 'cab' }, []);
        break;
      case 'bizmates':
        openFind({ type: 'Business' }, []);
        break;
      default:
        break;
    }
  });
}
