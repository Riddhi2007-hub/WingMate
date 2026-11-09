import { ApiError, api, brandFolder } from '../shared/api';
import { $ } from '../shared/dom';
import { isEmail, showFieldState, wireLiveValidation, wirePasswordToggles } from '../shared/forms';
import { KEYS, store } from '../shared/storage';

type FieldKey = 'email' | 'pw';

function main(): void {
  const form = $<HTMLFormElement>('#form');
  const input = (id: string) => $<HTMLInputElement>(`#${id}`);
  const banner = $('#banner');

  wirePasswordToggles();

  // "Remember me" keeps the email address only, never the password.
  const savedEmail = store.getText(KEYS.rememberedEmail);
  if (savedEmail) {
    input('email').value = savedEmail;
    input('remember').checked = true;
  }

  const rules: Record<FieldKey, () => boolean> = {
    email: () => isEmail(input('email').value),
    pw: () => input('pw').value.length > 0,
  };
  const keys = Object.keys(rules) as FieldKey[];
  const check = (key: FieldKey): boolean => showFieldState(key, rules[key]());

  for (const key of keys) {
    const el = input(key);
    wireLiveValidation(el, key, rules[key]);
    el.addEventListener('input', () => banner.classList.remove('show'));
  }

  $('#resend').addEventListener('click', (event) => {
    event.preventDefault();
    const link = $('#resend');
    api('POST', '/api/verify/resend', { email: input('email').value.trim(), brand: brandFolder() })
      .then(() => {
        link.textContent = 'Sent. Check your inbox';
      })
      .catch(() => {
        link.textContent = 'Could not send. Try again later';
      });
  });

  let busy = false;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    const allValid = keys.map(check).every(Boolean);
    if (!allValid) {
      document.querySelector<HTMLElement>('.field.error input')?.focus();
      return;
    }
    const email = input('email').value.trim();
    if (input('remember').checked) store.setText(KEYS.rememberedEmail, email);
    else store.del(KEYS.rememberedEmail);

    busy = true;
    api('POST', '/api/login', { email, password: input('pw').value, remember: input('remember').checked })
      .then(() => {
        $('#card').classList.add('success');
        window.setTimeout(() => location.assign('dashboard.html'), 700);
      })
      .catch((error: unknown) => {
        banner.textContent = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
        banner.classList.add('show');
        $('#resendRow').hidden = !(error instanceof ApiError && error.code === 'email_not_verified');
      })
      .finally(() => {
        busy = false;
      });
  });
}

main();
