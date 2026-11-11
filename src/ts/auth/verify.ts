import '../shared/theme';
import { ApiError, api } from '../shared/api';
import { $ } from '../shared/dom';

const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
history.replaceState(null, '', location.pathname); // keep the secret out of the address bar and history

function fail(message: string): void {
  $('#card h1').textContent = 'This link did not work';
  $('#sub').textContent = '';
  const banner = $('#banner');
  banner.textContent = message;
  banner.classList.add('show');
  $('#again').hidden = false;
}

if (!token) {
  fail('The link is incomplete. Open the link from your email again.');
} else {
  api('POST', '/api/verify', { token })
    .then(() => {
      $('#card h1').textContent = 'Email confirmed';
      $('#sub').textContent = 'Your account is ready. Log in to find the people on your flight.';
      $('#go').hidden = false;
    })
    .catch((error: unknown) => fail(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'));
}
