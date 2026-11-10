/**
 * Sends email from the Node server.
 *  - With SMTP_HOST set: sends through that mail server.
 *  - Without it: prints the message in the server console and saves it under data/outbox, so the app can be tried
 *    on a laptop without any email account.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Mail } from '../runtime';
import type { Settings } from '../settings';
import { deliver, withTimeout } from '../smtp';
import { openNodeSocket } from './socket';

function sendToConsole(mail: Mail, dataDir: string): void {
  const stamp = new Date().toISOString();
  const text = `To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`;
  console.log(`\n--- email (no SMTP_HOST set, so not actually sent) ${stamp} ---\n${text}---`);
  try {
    const dir = path.join(dataDir, 'outbox');
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, 'outbox.txt'), `=== ${stamp}\n${text}\n`);
  } catch {
    /* the console copy is enough */
  }
}

/** Sends in the background: a slow or broken mail server never delays or breaks the request. */
export function makeSendMail(settings: Settings, dataDir: string): (mail: Mail) => void {
  return (mail) => {
    const smtp = settings.smtp;
    if (!smtp.host) {
      sendToConsole(mail, dataDir);
      return;
    }
    withTimeout(deliver(() => openNodeSocket(smtp.host, smtp.port), smtp, mail, smtp.port === 465), 30_000).catch((error: unknown) => {
      console.error(`Could not send email to ${mail.to}: ${error instanceof Error ? error.message : String(error)}`);
    });
  };
}
