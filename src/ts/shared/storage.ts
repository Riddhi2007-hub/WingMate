/** The browser only remembers the email for "Remember me". Everything else is stored by the server. */
export const KEYS = {
  rememberedEmail: 'wingmate_email',
} as const;

/**
 * Safe localStorage wrapper. Browsers can block storage (private windows, previews),
 * so every call is wrapped and the page keeps working without it.
 */
export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: ignore */
    }
  },
  getText(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setText(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: ignore */
    }
  },
  del(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable: ignore */
    }
  },
};
