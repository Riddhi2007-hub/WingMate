/** Settings that do not depend on where the server runs. Both the Node server and the Cloudflare Worker build this from their environment. */
export interface Settings {
  /** Session cookie gets the Secure flag (always on in production, which is https). */
  secureCookies: boolean;
  /** Use X-Forwarded-For for the client address (Node behind a proxy). */
  trustProxy: boolean;
  chatRetentionDays: number;
  flyerRetentionMonths: number;
  /** The address people open the site at; goes into the links in emails. */
  publicUrl: string;
  smtp: { host: string; port: number; user: string; pass: string; from: string };
  verifyHours: number;
  resetMinutes: number;
  sessionDays: number;
  /** Password hashing cost on Cloudflare (higher is safer but needs more CPU time per login). */
  pbkdf2Iterations: number;
}

type Env = Record<string, string | undefined>;
const flag = (value: string | undefined, fallback: boolean): boolean => (value === undefined || value === '' ? fallback : /^(1|true|yes|on)$/i.test(value));
const num = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) ? n : fallback;
};

export function settingsFrom(env: Env, defaults: { publicUrl: string; secureCookies: boolean }): Settings {
  return {
    secureCookies: flag(env.WINGMATE_SECURE_COOKIES, defaults.secureCookies),
    trustProxy: flag(env.WINGMATE_TRUST_PROXY, false),
    chatRetentionDays: num(env.WINGMATE_CHAT_RETENTION_DAYS, 30),
    flyerRetentionMonths: num(env.WINGMATE_FLYER_RETENTION_MONTHS, 3),
    publicUrl: (env.WINGMATE_PUBLIC_URL || defaults.publicUrl).replace(/\/+$/, ''),
    smtp: {
      host: env.SMTP_HOST ?? '',
      port: num(env.SMTP_PORT, 587),
      user: env.SMTP_USER ?? '',
      pass: env.SMTP_PASS ?? '',
      from: env.SMTP_FROM || env.SMTP_USER || 'WingMate <no-reply@localhost>',
    },
    verifyHours: 24,
    resetMinutes: 60,
    sessionDays: num(env.WINGMATE_SESSION_DAYS, 30),
    pbkdf2Iterations: num(env.PBKDF2_ITERATIONS, 10_000),
  };
}
