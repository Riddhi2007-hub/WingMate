import '../shared/theme';
import { ApiError, api, brandFolder } from '../shared/api';
import { $ } from '../shared/dom';
import { isEmail, showFieldError, showFieldState, wireLiveValidation, wirePasswordToggles } from '../shared/forms';

type FieldKey = 'first' | 'last' | 'email' | 'phone' | 'dob' | 'pw' | 'pw2' | 'terms';
type AgeCheck = { ok: true } | { ok: false; msg: string };

const MIN_AGE = 16;

/** 0 (empty) to 4 (strong). */
function passwordStrength(password: string): number {
  let points = 0;
  if (password.length >= 8) points++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points++;
  if (/\d/.test(password)) points++;
  if (/[^A-Za-z0-9]/.test(password)) points++;
  return password ? Math.max(1, points) : 0;
}

function checkAge(value: string): AgeCheck {
  if (!value) return { ok: false, msg: 'Enter your date of birth.' };
  const born = new Date(value);
  const today = new Date();
  if (Number.isNaN(born.getTime()) || born > today) return { ok: false, msg: 'Enter a valid date of birth.' };
  let age = today.getFullYear() - born.getFullYear();
  const monthGap = today.getMonth() - born.getMonth();
  if (monthGap < 0 || (monthGap === 0 && today.getDate() < born.getDate())) age--;
  return age >= MIN_AGE ? { ok: true } : { ok: false, msg: `You must be ${MIN_AGE} or older to sign up.` };
}

function main(): void {
  const form = $<HTMLFormElement>('#form');
  const input = (id: string) => $<HTMLInputElement>(`#${id}`);

  wirePasswordToggles();

  input('pw').addEventListener('input', () => {
    $('#meter').dataset.s = String(passwordStrength(input('pw').value));
  });
  input('dob').max = new Date().toISOString().slice(0, 10);

  const rules: Record<FieldKey, () => boolean> = {
    first: () => input('first').value.trim().length > 0,
    last: () => input('last').value.trim().length > 0,
    email: () => isEmail(input('email').value),
    phone: () => /^\d{7,12}$/.test(input('phone').value.replace(/[\s\-()]/g, '')),
    dob: () => {
      const result = checkAge(input('dob').value);
      $('#dobMsg').textContent = result.ok ? '' : result.msg;
      return result.ok;
    },
    pw: () => input('pw').value.length >= 8,
    pw2: () => input('pw2').value === input('pw').value && input('pw2').value.length > 0,
    terms: () => input('terms').checked,
  };
  const keys = Object.keys(rules) as FieldKey[];
  const check = (key: FieldKey): boolean => showFieldState(key, rules[key]());

  for (const key of keys) wireLiveValidation(input(key), key, rules[key]);

  const submit = $<HTMLButtonElement>('#form button[type=submit]');
  let busy = false;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    const allValid = keys.map(check).every(Boolean);
    if (!allValid) {
      document.querySelector<HTMLElement>('.field.error input, .field.error select')?.focus();
      return;
    }
    const first = input('first').value.trim();
    busy = true;
    submit.disabled = true;
    api('POST', '/api/signup', {
      first,
      last: input('last').value.trim(),
      email: input('email').value.trim(),
      countryCode: $<HTMLSelectElement>('#cc').value,
      phone: input('phone').value,
      dob: input('dob').value,
      password: input('pw').value,
      terms: input('terms').checked,
      brand: brandFolder(),
    })
      .then(() => {
        $('#name').textContent = first;
        $('#sentTo').textContent = input('email').value.trim();
        $('#card').classList.add('success');
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
        const field = error instanceof ApiError ? error.field : undefined;
        if (field === 'dob') $('#dobMsg').textContent = message;
        showFieldError(field && field in rules ? field : 'terms', message);
        document.querySelector<HTMLElement>('.field.error input, .field.error select')?.focus();
      })
      .finally(() => {
        busy = false;
        submit.disabled = false;
      });
  });
}

function wireResend(): void {
  $('#resend').addEventListener('click', (event) => {
    event.preventDefault();
    const link = $('#resend');
    api('POST', '/api/verify/resend', { email: $<HTMLInputElement>('#email').value.trim(), brand: brandFolder() })
      .then(() => {
        link.textContent = 'sent. Check your inbox';
      })
      .catch(() => {
        link.textContent = 'could not send, try again later';
      });
  });
}

wireResend();
main();
