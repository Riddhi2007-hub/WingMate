import path from 'node:path';

const env = process.env;
const flag = (value: string | undefined, fallback: boolean): boolean => (value === undefined ? fallback : /^(1|true|yes|on)$/i.test(value));
const num = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return value !== undefined && Number.isFinite(n) ? n : fallback;
};

/** All settings come from environment variables, so nothing is edited in code to deploy. */
export const config = {
  port: num(env.PORT, 3000),
  host: env.HOST ?? '127.0.0.1',
  /** Where the SQLite file lives. */
  dataDir: path.resolve(env.WINGMATE_DATA_DIR ?? 'data'),
  /** The built front end (npm run build). */
  publicDir: path.resolve(env.WINGMATE_PUBLIC_DIR ?? 'dist'),
  /** Set to 1 when serving over HTTPS so the session cookie is Secure. */
  secureCookies: flag(env.WINGMATE_SECURE_COOKIES, false),
  /** Set to 1 only behind a reverse proxy you control, so X-Forwarded-For is used for rate limits. */
  trustProxy: flag(env.WINGMATE_TRUST_PROXY, false),
  /** Closed chats are deleted this many days after they close. */
  chatRetentionDays: num(env.WINGMATE_CHAT_RETENTION_DAYS, 30),
  /** Frequent flyer details are deleted after this many months without a flight. */
  flyerRetentionMonths: num(env.WINGMATE_FLYER_RETENTION_MONTHS, 3),
  /** The address people use to reach the site; it goes into the links in emails. */
  publicUrl: (env.WINGMATE_PUBLIC_URL ?? `http://localhost:${num(env.PORT, 3000)}`).replace(/\/+$/, ''),
  /** Outgoing email. Without SMTP_HOST the emails are printed in the server console and saved in data/outbox instead. */
  smtp: {
    host: env.SMTP_HOST ?? '',
    port: num(env.SMTP_PORT, 587),
    user: env.SMTP_USER ?? '',
    pass: env.SMTP_PASS ?? '',
    from: env.SMTP_FROM ?? env.SMTP_USER ?? 'WingMate <no-reply@localhost>',
  },
  verifyHours: 24,
  resetMinutes: 60,
  sessionDays: num(env.WINGMATE_SESSION_DAYS, 30),
  minAge: 16,
} as const;
