/**
 * Light / dark mode. The choice is remembered in this browser only. Light is the default,
 * and the page applies a saved "dark" before it paints (a tiny script in each page's head), so there is no flash.
 */
const KEY = 'wingmate_theme';

const isDark = (): boolean => document.documentElement.dataset.theme === 'dark';

function save(value: 'dark' | 'light'): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* storage unavailable: the choice just lasts until the page is closed */
  }
}

function apply(dark: boolean): void {
  if (dark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
}

function label(button: HTMLButtonElement): void {
  const dark = isDark();
  button.setAttribute('aria-pressed', String(dark));
  button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  button.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}

function init(): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-toggle';
  button.innerHTML =
    '<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>' +
    '<svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>';
  label(button);
  button.addEventListener('click', () => {
    const next = !isDark();
    apply(next);
    save(next ? 'dark' : 'light');
    label(button);
  });
  const user = document.querySelector('.user');
  if (user) user.insertBefore(button, user.firstChild);
  else {
    button.classList.add('float');
    document.body.appendChild(button);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
