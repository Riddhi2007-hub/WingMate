/** WingMate on Cloudflare Workers: the same API code as the Node server, with D1 as the database. */
import { handleApi } from '../server/api';
import { runJobs } from '../server/jobs';
import type { Mail, Runtime } from '../server/runtime';
import { settingsFrom, type Settings } from '../server/settings';
import { deliver, withTimeout } from '../server/smtp';
import brands from './brands.generated.json';
import { d1, ensureSchema } from './d1';
import { hashPassword, verifyPassword } from './password';
import { openWorkerSocket } from './socket';

/** Settings you can change in the Cloudflare dashboard (Settings > Variables and secrets). All are optional except the DB binding. */
interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  [setting: string]: unknown;
}

const stringsOf = (env: Env): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === 'string')) as Record<string, string>;

const settingsFor = (env: Env, origin: string): Settings => settingsFrom(stringsOf(env), { publicUrl: origin, secureCookies: true });

function runtimeFor(env: Env, ctx: ExecutionContext, settings: Settings): Runtime {
  return {
    db: d1(env.DB),
    settings,
    hashPassword: (password) => hashPassword(password, settings.pbkdf2Iterations),
    verifyPassword: (password, stored) => verifyPassword(password, stored, settings.pbkdf2Iterations),
    sendMail(mail: Mail) {
      const smtp = settings.smtp;
      if (!smtp.host) {
        // nothing is logged about the message itself: it holds a one-time link
        console.warn(`Email to ${mail.to} was not sent: set SMTP_HOST, SMTP_USER and SMTP_PASS in the Cloudflare dashboard.`);
        return;
      }
      ctx.waitUntil(
        withTimeout(deliver(() => openWorkerSocket(smtp.host, smtp.port), smtp, mail, smtp.port === 465), 20_000).catch((error: unknown) => {
          console.error(`Could not send email to ${mail.to}: ${error instanceof Error ? error.message : String(error)}`);
        }),
      );
    },
    async brand(folder) {
      return (brands as Record<string, string>)[folder] ?? null;
    },
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // pages and images are served by Cloudflare directly; only /api/ reaches this code
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    await ensureSchema(env.DB);
    return handleApi(request, runtimeFor(env, ctx, settingsFor(env, url.origin)), request.headers.get('cf-connecting-ip') ?? 'unknown');
  },

  /** Hourly housekeeping (see the cron trigger in wrangler.toml). */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    await ensureSchema(env.DB);
    const settings = settingsFor(env, 'https://localhost');
    ctx.waitUntil(runJobs(d1(env.DB), settings).then(() => undefined));
  },
};
