/**
 * Dashboard entry point. Wires the tabs together and starts the app.
 *
 *   data.ts      sample passengers, trips, game words
 *   options.ts   every choice (interests, seats ...) and the types derived from them
 *   state.ts     in-memory copy of what the server knows
 *   sync.ts      talks to the server and polls for changes
 *   matching.ts  match percentage and ranking
 *   router.ts    in-page tab switching
 *   views/*      one file per tab
 */
import '../shared/theme';
import { initActions } from './actions';
import { attachGlobe, initFlight, stageUI } from './flight';
import { initGlobe } from './globe';
import { initPlan } from './views/plan';
import { initGroups } from './views/groups';
import { initSeats } from './views/seats';
import { initMeals } from './views/meals';
import { initMarket, loadMarket } from './views/market';
import { initCurrency } from './currencyUi';
import { initPhotoFallback } from './scenes';
import { state } from './state';
import { registerRefresh, registerView, initRouter, show, startView } from './router';
import { hasLoaded, configureSync, startPolling, sync } from './sync';
import { initDialog, syncVisibleToggles, updateNavDot } from './ui';
import { initFind, renderFind } from './views/find';
import { initGames, renderPlayWith } from './views/games';
import { renderHome } from './views/home';
import { initMessages, onIncoming, onShowMessages, renderMessages } from './views/messages';
import { initPrefs, renderPrefs } from './views/prefs';
import { initProfile, renderProfile } from './views/profile';

/** Re-render everything that more than one tab depends on. */
function renderAll(): void {
  if (!hasLoaded()) return;
  renderHome();
  renderFind();
  if (state.currentView === 'messages' || !document.activeElement?.matches('#msgInput')) renderMessages();
  syncVisibleToggles();
  updateNavDot();
  stageUI();
}

async function main(): Promise<void> {
  // what to run when each tab opens
  registerView('home', renderHome);
  registerView('find', renderFind);
  registerView('market', () => void loadMarket());
  registerView('messages', onShowMessages);
  registerView('games', renderPlayWith);
  registerView('prefs', renderPrefs);
  registerView('profile', renderProfile);
  registerRefresh(renderAll);

  initDialog();
  initRouter();
  initActions();
  initFind();
  initPrefs();
  initMessages();
  initGames();
  initProfile();
  const globeHost = document.getElementById('globeWrap');
  if (globeHost) attachGlobe(initGlobe(globeHost));
  const top = document.querySelector('header.top');
  const menuBtn = document.getElementById('menuBtn');
  const setMenu = (open: boolean): void => {
    top?.classList.toggle('open', open);
    menuBtn?.setAttribute('aria-expanded', String(open));
  };
  menuBtn?.addEventListener('click', () => setMenu(!top?.classList.contains('open')));
  document.getElementById('mainNav')?.addEventListener('click', () => setMenu(false));
  document.addEventListener('click', (e) => {
    if (top && !top.contains(e.target as Node)) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1000) setMenu(false);
  });
  initFlight();
  initPlan();
  initGroups(() => renderAll());
  initSeats();
  initMeals();
  initMarket();
  initCurrency();
  initPhotoFallback();

  configureSync({ changed: renderAll, newMessage: onIncoming });
  await sync();
  renderAll();
  renderProfile();
  renderPrefs();
  show(startView(), false);
  startPolling();
}

void main();
