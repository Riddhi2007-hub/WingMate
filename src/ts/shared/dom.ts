/** Small, typed DOM helpers shared by every page. */

/** Like document.querySelector, but throws a clear error if the element is missing. */
export function $<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`WingMate: element not found: ${selector}`);
  return el;
}

/** Like querySelectorAll, but returns a real array. */
export function $$<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/** Closest ancestor (or the target itself) of an event's target that matches the selector. */
export function closest<T extends Element = HTMLElement>(event: Event, selector: string): T | null {
  const target = event.target;
  return target instanceof Element ? target.closest<T>(selector) : null;
}

/** Escape text before putting it into an HTML string. */
export function esc(value: unknown): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (c) => map[c] ?? c);
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
