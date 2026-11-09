import { ApiError, api } from '../shared/api';
import { $ } from '../shared/dom';
import { showFieldError, showFieldState, wirePasswordToggles } from '../shared/forms';

const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
history.replaceState(null, '', location.pathname);

const form = $<HTMLFormElement>('#form');
const pw = $<HTMLInputElement>('#pw');
const pw2 = $<HTMLInputElement>('#pw2');
const banner = $('#banner');
wirePasswordToggles();

const show = (message: string): void => {
  banner.textContent = message;
  banner.classList.add('show');
};
if (!token) show('The link is incomplete. Open the link from your email again, or ask for a new one.');

let busy = false;
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy) return;
  const okLength = showFieldState('pw', pw.value.length >= 8);
  const okMatch = showFieldState('pw2', pw.value === pw2.value);
  if (!okLength || !okMatch || !token) return;
  busy = true;
  api('POST', '/api/reset', { token, password: pw.value })
    .then(() => $('#card').classList.add('success'))
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.field === 'pw') showFieldError('pw', error.message);
      else show(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');
    })
    .finally(() => {
      busy = false;
    });
});
