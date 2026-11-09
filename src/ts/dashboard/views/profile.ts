import { $ } from '../../shared/dom';
import { ApiError, api } from '../../shared/api';
import { TIERS, isOneOf } from '../options';
import { refreshAll } from '../router';
import { state } from '../state';
import { save } from '../sync';
import { ask, fmtDate, toast } from '../ui';

/** Saved frequent flyer details are deleted 3 months after the last flight. */
const RETENTION_MONTHS = 3;

function addMonths(ms: number, months: number): Date {
  const result = new Date(ms);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function renderProfile(): void {
  const { user, flyer, saveData } = state;
  // don't overwrite what the person is typing when a background refresh renders this page
  if (document.activeElement?.closest('#profile')) return;
  $<HTMLInputElement>('#pfFirst').value = user.first;
  $<HTMLInputElement>('#pfLast').value = user.last;
  $<HTMLInputElement>('#pfEmail').value = user.email;
  $<HTMLTextAreaElement>('#pfBio').value = user.bio;

  $<HTMLInputElement>('#saveData').checked = saveData;
  $<HTMLInputElement>('#ffNum').value = saveData && flyer ? flyer.num : '';
  $<HTMLSelectElement>('#ffTier').value = flyer?.tier ?? 'Green';
  $('#ffFields').style.opacity = saveData ? '1' : '0.5';
  $<HTMLInputElement>('#ffNum').disabled = !saveData;
  $<HTMLSelectElement>('#ffTier').disabled = !saveData;

  const deleteOn = addMonths(state.lastFlight, RETENTION_MONTHS);
  const days = Math.round((deleteOn.getTime() - Date.now()) / 864e5);
  $('#retention').innerHTML = saveData
    ? `<b>Automatic deletion.</b> Your last flight was on ${fmtDate(state.lastFlight)}. If you do not fly with us again, your saved frequent flyer details are deleted on <b>${fmtDate(deleteOn)}</b> (${days > 0 ? `in ${days} days` : 'today'}). Flying again resets this.`
    : `<b>Nothing is being saved.</b> Your frequent flyer details are not stored. Turn the switch on if you would like us to remember them.`;
}

export function initProfile(): void {
  $<HTMLInputElement>('#saveData').addEventListener('change', (event) => {
    state.saveData = (event.target as HTMLInputElement).checked;
    $('#ffFields').style.opacity = state.saveData ? '1' : '0.5';
    $<HTMLInputElement>('#ffNum').disabled = !state.saveData;
    $<HTMLSelectElement>('#ffTier').disabled = !state.saveData;
  });

  $('#pfSave').addEventListener('click', () => {
    const tier = $<HTMLSelectElement>('#ffTier').value;
    const body = {
      first: $<HTMLInputElement>('#pfFirst').value.trim() || state.user.first,
      last: $<HTMLInputElement>('#pfLast').value.trim(),
      bio: $<HTMLTextAreaElement>('#pfBio').value.trim(),
      saveData: state.saveData,
      flyer: state.saveData ? { num: $<HTMLInputElement>('#ffNum').value.trim(), tier: isOneOf(TIERS, tier) ? tier : 'Green' } : null,
    };
    void save(() => api('PUT', '/api/profile', body))
      .then(() => {
        state.user = { ...state.user, first: body.first, last: body.last, bio: body.bio };
        state.flyer = body.flyer;
        refreshAll();
        (document.activeElement as HTMLElement | null)?.blur();
        renderProfile();
        toast('Profile saved');
      })
      .catch((error: unknown) => toast(error instanceof ApiError ? error.message : 'Could not save. Try again.'));
  });

  $('#ffDelete').addEventListener('click', () => {
    ask({
      title: 'Delete your saved data?',
      text: 'Your saved frequent flyer details will be removed now. This cannot be undone.',
      okLabel: 'Delete',
      danger: true,
      onOk: () => {
        void save(() => api('DELETE', '/api/flyer')).then(() => {
          state.flyer = null;
          state.saveData = false;
          renderProfile();
          toast('Your saved data has been deleted');
        });
      },
    });
  });

  $('#logoutBtn').addEventListener('click', () => {
    void api('POST', '/api/logout').finally(() => location.replace('login.html'));
  });

  $('#acctDelete').addEventListener('click', () => {
    $('#acctBox').hidden = false;
    $<HTMLInputElement>('#acctPw').focus();
  });
  $('#acctConfirm').addEventListener('click', () => {
    void api('DELETE', '/api/account', { password: $<HTMLInputElement>('#acctPw').value })
      .then(() => location.replace('signup.html'))
      .catch((error: unknown) => {
        $('#acctErr').textContent = error instanceof ApiError ? error.message : 'Could not delete. Try again.';
      });
  });
}
