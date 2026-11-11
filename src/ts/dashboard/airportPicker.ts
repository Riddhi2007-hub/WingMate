/** Type-ahead for the airport fields: type "hong" or "HKG" and pick from a list that spells out the city. */
import { esc } from '../shared/dom';
import { airportByCode, searchAirports } from './airports';

export function attachAirportPicker(input: HTMLInputElement): void {
  const wrap = document.createElement('div');
  wrap.className = 'ac';
  input.parentNode?.insertBefore(wrap, input);
  wrap.appendChild(input);
  const list = document.createElement('ul');
  list.className = 'ac-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  const hint = document.createElement('div');
  hint.className = 'ac-hint';
  wrap.append(list, hint);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');

  let active = -1;
  let items: string[] = [];

  const close = (): void => {
    list.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
  };
  const showHint = (): void => {
    const t = input.value.trim();
    const a = /^[A-Za-z]{3}$/.test(t) ? airportByCode(t.toUpperCase()) : undefined;
    hint.textContent = a ? `${a.code} · ${a.city}, ${a.country}` : /^[A-Za-z]{3}$/.test(t) ? `${t.toUpperCase()} · not in our list, but you can still use it` : '';
  };
  const pick = (code: string): void => {
    input.value = code;
    close();
    showHint();
  };
  const paint = (): void => {
    list.querySelectorAll('li').forEach((li, i) => li.classList.toggle('on', i === active));
  };
  const open = (): void => {
    const found = searchAirports(input.value);
    items = found.map((a) => a.code);
    list.innerHTML = found.map((a) => `<li role="option" data-code="${esc(a.code)}"><b>${esc(a.code)}</b> ${esc(a.city)}<small>${esc(a.country)}</small></li>`).join('');
    list.hidden = found.length === 0;
    active = -1;
    input.setAttribute('aria-expanded', String(found.length > 0));
  };

  input.addEventListener('input', () => {
    open();
    showHint();
  });
  input.addEventListener('focus', () => {
    if (input.value) open();
    showHint();
  });
  input.addEventListener('blur', () => window.setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (list.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paint();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(items[active] ?? '');
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });
  list.addEventListener('mousedown', (e) => {
    e.preventDefault(); // keep the input focused
    const code = (e.target as HTMLElement).closest<HTMLElement>('[data-code]')?.dataset.code;
    if (code) pick(code);
  });
  // when the dialog fills the field in by code, the hint should follow
  input.addEventListener('change', showHint);
}
