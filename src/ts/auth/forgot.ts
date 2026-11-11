import '../shared/theme';
import { ApiError, api, brandFolder } from '../shared/api';
import { $ } from '../shared/dom';
import { isEmail, showFieldState, wireLiveValidation } from '../shared/forms';

const form = $<HTMLFormElement>('#form');
const email = $<HTMLInputElement>('#email');
const banner = $('#banner');
const valid = (): boolean => isEmail(email.value);
wireLiveValidation(email, 'email', valid);

let busy = false;
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy || !showFieldState('email', valid())) return;
  busy = true;
  api('POST', '/api/forgot', { email: email.value.trim(), brand: brandFolder() })
    .then(() => $('#card').classList.add('success'))
    .catch((error: unknown) => {
      banner.textContent = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
      banner.classList.add('show');
    })
    .finally(() => {
      busy = false;
    });
});
