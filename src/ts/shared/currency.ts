/**
 * Display currency. Prices in WingMate (meals, trips) are set in Malaysian ringgit; a guest can choose to see them in
 * another currency. Other currencies are APPROXIMATE (indicative reference rates, see RATES_DATE), for guidance only:
 * in the live version the airline's own rates apply and the guest pays in the currency shown at checkout.
 * The choice is remembered on this device.
 */
export const BASE = 'MYR';
export const RATES_DATE = '11 Nov 2026';

/** How much of each currency 1 MYR buys (indicative). */
export const RATES: Record<string, number> = {
  MYR: 1,
  USD: 0.24549,
  HKD: 1.926,
  SGD: 0.31485,
  THB: 8.2705,
  INR: 23.001,
  IDR: 4461.7,
  JPY: 39.09,
  AUD: 0.3579,
  EUR: 0.22062,
  GBP: 0.18448,
  PHP: 15.527,
  CNY: 1.6376,
  KRW: 328.19,
};

export const CURRENCY_NAME: Record<string, string> = {
  MYR: 'Malaysian ringgit',
  USD: 'US dollar',
  HKD: 'Hong Kong dollar',
  SGD: 'Singapore dollar',
  THB: 'Thai baht',
  INR: 'Indian rupee',
  IDR: 'Indonesian rupiah',
  JPY: 'Japanese yen',
  AUD: 'Australian dollar',
  EUR: 'Euro',
  GBP: 'British pound',
  PHP: 'Philippine peso',
  CNY: 'Chinese yuan',
  KRW: 'South Korean won',
};

const KEY = 'wingmate-currency';
let current = BASE;

export function loadCurrency(): void {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && saved in RATES) current = saved;
  } catch {
    /* storage unavailable: keep ringgit */
  }
}

export const getCurrency = (): string => current;

export function setCurrency(code: string): void {
  if (!(code in RATES)) return;
  current = code;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* not saved on this device: still applies for now */
  }
}

/** A price set in ringgit, shown in the chosen currency ("≈" when it is converted). */
export function money(myr: number): string {
  if (current === BASE) return `${BASE} ${myr.toLocaleString('en-GB')}`;
  const value = myr * (RATES[current] ?? 1);
  const big = value >= 1000;
  const text = new Intl.NumberFormat('en-GB', { style: 'currency', currency: current, currencyDisplay: 'code', maximumFractionDigits: big ? 0 : undefined }).format(value);
  return `≈ ${text}`;
}

export const currencyNote = (): string =>
  current === BASE ? `Prices are in ${CURRENCY_NAME[BASE]}.` : `Prices are set in ${CURRENCY_NAME[BASE]} (${BASE}). ${current} amounts are approximate, using reference rates from ${RATES_DATE}.`;

export const currencyOptions = (): string =>
  Object.keys(RATES).map((c) => `<option value="${c}" ${c === current ? 'selected' : ''}>${c} · ${CURRENCY_NAME[c]}</option>`).join('');
