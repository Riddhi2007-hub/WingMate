/**
 * In-page tab switching. It never relies on the browser jumping to #anchors, so it also works
 * inside sandboxed previews. The tabs register what to render with registerView(), and the
 * router never imports the tabs, which keeps the modules free of circular imports.
 */
import { $, $$, closest } from '../shared/dom';
import { VIEWS, VIEW_TITLE, isOneOf, type ViewName } from './options';
import { state } from './state';

const onShow: Partial<Record<ViewName, () => void>> = {};
let refresh: () => void = () => undefined;

/** Say what should run each time a tab is opened. */
export function registerView(view: ViewName, handler: () => void): void {
  onShow[view] = handler;
}

/** Say what "re-render everything that is on screen or cached" means. */
export function registerRefresh(handler: () => void): void {
  refresh = handler;
}

/** Re-render everything after a change that affects more than one tab. */
export function refreshAll(): void {
  refresh();
}

/** The tab named in the URL (#find, #prefs ...), or home. */
export function startView(): ViewName {
  let hash = '';
  try {
    hash = location.hash.slice(1);
  } catch {
    /* location unavailable: fall through to home */
  }
  return isOneOf(VIEWS, hash) ? hash : 'home';
}

export function show(view: ViewName, push: boolean): void {
  state.currentView = view;
  for (const section of $$('[data-view]')) section.classList.toggle('is-active', section.dataset.view === view);
  for (const link of $$('[data-nav]')) {
    const active = link.dataset.nav === view;
    link.classList.toggle('active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  }
  $('#userLink').classList.toggle('active', view === 'profile');
  onShow[view]?.();
  window.scrollTo(0, 0);
  document.title = `WingMate – ${VIEW_TITLE[view]}`;
  if (push) {
    try {
      history.pushState({ view }, '', `#${view}`);
    } catch {
      /* history unavailable: ignore */
    }
  }
}

export function initRouter(): void {
  // Every in-page link: nav tabs, "See all", "Edit", the avatar, buttons that look like links.
  document.addEventListener('click', (event) => {
    const link = closest<HTMLAnchorElement>(event, 'a[href^="#"]');
    if (!link) return;
    event.preventDefault();
    const name = (link.getAttribute('href') ?? '').slice(1);
    show(isOneOf(VIEWS, name) ? name : 'home', true);
  });
  window.addEventListener('popstate', () => show(startView(), false));
}
