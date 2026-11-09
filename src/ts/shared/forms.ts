import { $, $$ } from './dom';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Wires every "Show / Hide" button next to a password field. */
export function wirePasswordToggles(): void {
  for (const button of $$<HTMLButtonElement>('.toggle')) {
    button.addEventListener('click', () => {
      const targetId = button.dataset.target;
      if (!targetId) return;
      const input = $<HTMLInputElement>(`#${targetId}`);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }
}

/** Toggles the red error state on a `.field[data-f="<key>"]` wrapper and returns whether it is valid. */
export function showFieldState(key: string, ok: boolean): boolean {
  $(`[data-f="${key}"]`).classList.toggle('error', !ok);
  return ok;
}

/** Shows an error on a field with a message from the server (for example "email already used"). */
export function showFieldError(key: string, message: string): void {
  const field = $(`[data-f="${key}"]`);
  const msg = field.querySelector('.msg');
  if (msg) msg.textContent = message;
  field.classList.add('error');
}

export function fieldHasError(key: string): boolean {
  return $(`[data-f="${key}"]`).classList.contains('error');
}

/**
 * Live validation that never moves the page while someone is clicking.
 *  - When the field loses focus it can only SHOW an error (it has a value, but the value is invalid).
 *  - Once an error is showing, it clears as the person types or ticks the box, never on blur.
 * Clearing on blur made everything below jump up between mouse-down and mouse-up,
 * so a click on the next checkbox or button could miss.
 */
export function wireLiveValidation(el: HTMLInputElement, key: string, validate: () => boolean): void {
  el.addEventListener('blur', () => {
    if (el.value && !validate()) showFieldState(key, false);
  });
  el.addEventListener('input', () => {
    if (fieldHasError(key)) showFieldState(key, validate());
  });
}
