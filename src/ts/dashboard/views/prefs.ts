import { $, $$, clone, closest, esc } from '../../shared/dom';
import { api } from '../../shared/api';
import { save } from '../sync';
import {
  GOALS,
  GOAL_LABEL,
  INTERESTS,
  PERSONALITIES,
  PURPOSES,
  SEATING,
  isOneOf,
  type Interest,
  type PrefKey,
} from '../options';
import { refreshAll } from '../router';
import { state } from '../state';
import { ask, toast } from '../ui';

/** Radio buttons (single choice) or checkboxes (interests) for one preference. */
function optionsHTML(key: PrefKey, values: readonly string[], label: (v: string) => string = (v) => v): string {
  const multiple = key === 'interests';
  return values
    .map((value) => {
      const draft = state.draft;
      const checked = multiple ? (draft.interests as readonly string[]).includes(value) : draft[key] === value;
      return `<label class="opt"><input type="${multiple ? 'checkbox' : 'radio'}" name="pref-${key}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${esc(label(value))}</span></label>`;
    })
    .join('');
}

function updateSaveBar(): void {
  const dirty = JSON.stringify(state.draft) !== JSON.stringify(state.prefs);
  const status = $('#saveState');
  status.textContent = dirty ? 'You have unsaved changes' : 'All changes saved';
  status.classList.toggle('dirty', dirty);
  $<HTMLButtonElement>('#prefSave').disabled = !dirty;
  $<HTMLButtonElement>('#prefReset').disabled = !dirty;
}

export function renderPrefs(): void {
  $('#optType').innerHTML = optionsHTML('type', PURPOSES);
  $('#optWhy').innerHTML = optionsHTML('why', GOALS, (v) => (isOneOf(GOALS, v) ? GOAL_LABEL[v] : v));
  $('#optPers').innerHTML = optionsHTML('pers', PERSONALITIES);
  $('#optInt').innerHTML = optionsHTML('interests', INTERESTS);
  $('#optSeat').innerHTML = optionsHTML('seat', SEATING);
  updateSaveBar();
}

function savePrefs(): void {
  state.prefs = clone(state.draft);
  void save(() => api('PUT', '/api/prefs', { prefs: state.prefs })).then(() => toast('Preferences saved'));
  refreshAll();
  renderPrefs();
}

/** Writes one clicked option into the draft. Each branch is checked against the allowed values. */
function applyChoice(key: string, value: string): void {
  const draft = state.draft;
  switch (key) {
    case 'type':
      if (isOneOf(PURPOSES, value)) draft.type = value;
      break;
    case 'why':
      if (isOneOf(GOALS, value)) draft.why = value;
      break;
    case 'pers':
      if (isOneOf(PERSONALITIES, value)) draft.pers = value;
      break;
    case 'seat':
      if (isOneOf(SEATING, value)) draft.seat = value;
      break;
    default:
      break;
  }
}

export function initPrefs(): void {
  // Native radios / checkboxes: no re-render needed, the browser already shows the choice.
  document.addEventListener('change', (event) => {
    const input = closest<HTMLInputElement>(event, '.opts input');
    if (!input) return;
    const key = input.name.replace('pref-', '');
    if (key === 'interests') {
      state.draft.interests = $$<HTMLInputElement>('#optInt input:checked')
        .map((i) => i.value)
        .filter((v): v is Interest => isOneOf(INTERESTS, v));
    } else {
      applyChoice(key, input.value);
    }
    updateSaveBar();
  });

  $('#prefSave').addEventListener('click', () => {
    if (!state.draft.interests.length) {
      ask({
        title: 'Save without interests?',
        text: 'You have not picked any interests, so matches will rely on your other preferences.',
        okLabel: 'Save anyway',
        onOk: savePrefs,
      });
      return;
    }
    savePrefs();
  });

  $('#prefReset').addEventListener('click', () => {
    state.draft = clone(state.prefs);
    renderPrefs();
  });
}
