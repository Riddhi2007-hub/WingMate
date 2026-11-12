/** The "Show prices in" drop-downs (meal menu, trips & agents): they all share one choice, remembered on this device. */
import { $$ } from '../shared/dom';
import { currencyOptions, getCurrency, loadCurrency, setCurrency } from '../shared/currency';
import { renderMarket } from './views/market';
import { redrawMeals } from './views/meals';

export function initCurrency(): void {
  loadCurrency();
  const selects = $$<HTMLSelectElement>('select[data-currency]');
  for (const select of selects) {
    select.innerHTML = currencyOptions();
    select.addEventListener('change', () => {
      setCurrency(select.value);
      for (const other of selects) other.value = getCurrency();
      redrawMeals();
      renderMarket();
    });
  }
}
