/**
 * Sends email with a small built-in SMTP client (no dependencies).
 *  - With SMTP_HOST set: connects (port 465 = TLS from the start, otherwise STARTTLS when offered), logs in and sends.
 *  - Without it: prints the message in the server console and saves it under data/outbox, so the app can be tried
 *    on a laptop without any email account.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { config } from './config';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

const addressOf = (from: string): string => /<([^>]+)>/.exec(from)?.[1] ?? from;
const clean = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();

function build(mail: Mail): string {
  const body = Buffer.from(mail.text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  return [
    `From: ${clean(config.smtp.from)}`,
    `To: ${clean(mail.to)}`,
    `Subject: =?UTF-8?B?${Buffer.from(clean(mail.subject)).toString('base64')}?=`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
}

/** Reads SMTP replies line by line; a reply ends at the line whose 4th character is a space. */
class Conversation {
  private buffer = '';
  private waiting: ((reply: { code: number; text: string }) => void) | null = null;
  private lines: string[] = [];
  private failure: Error | null = null;

  constructor(private socket: net.Socket) {
    this.attach(socket);
  }

  attach(socket: net.Socket): void {
    this.socket = socket;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      let index: number;
      while ((index = this.buffer.indexOf('\r\n')) >= 0) {
        const line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 2);
        this.lines.push(line);
        if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
          const reply = { code: Number(line.slice(0, 3)), text: this.lines.join('\n') };
          this.lines = [];
          const resolve = this.waiting;
          this.waiting = null;
          resolve?.(reply);
        }
      }
    });
    socket.on('error', (error) => {
      this.failure = error;
      this.waiting?.({ code: 0, text: error.message });
    });
    socket.on('close', () => this.waiting?.({ code: 0, text: 'connection closed' }));
  }

  read(): Promise<{ code: number; text: string }> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }

  async send(line: string, expect: number[]): Promise<string> {
    this.socket.write(`${line}\r\n`);
    return this.expect(expect);
  }

  async expect(codes: number[]): Promise<string> {
    const reply = await this.read();
    if (!codes.includes(reply.code)) throw new Error(`SMTP: unexpected reply ${reply.text}`);
    return reply.text;
  }
}

function connect(): Promise<net.Socket> {
  const { host, port } = config.smtp;
  return new Promise((resolve, reject) => {
    const socket: net.Socket = port === 465 ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    socket.setTimeout(20_000, () => socket.destroy(new Error('SMTP: timed out')));
    socket.once('error', reject);
    socket.once(port === 465 ? 'secureConnect' : 'connect', () => resolve(socket));
  });
}

async function sendSmtp(mail: Mail): Promise<void> {
  const { host, user, pass, from } = config.smtp;
  let socket = await connect();
  const talk = new Conversation(socket);
  try {
    await talk.expect([220]);
    let features = await talk.send('EHLO wingmate', [250]);
    if (config.smtp.port !== 465 && /STARTTLS/i.test(features)) {
      await talk.send('STARTTLS', [220]);
      socket = tls.connect({ socket, servername: host });
      await new Promise<void>((resolve, reject) => {
        socket.once('secureConnect', resolve);
        socket.once('error', reject);
      });
      talk.attach(socket);
      features = await talk.send('EHLO wingmate', [250]);
    } else if (config.smtp.port !== 465 && user) {
      throw new Error('SMTP: the server does not offer STARTTLS, so the password would travel unencrypted');
    }
    if (user) await talk.send(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`).toString('base64')}`, [235]);
    await talk.send(`MAIL FROM:<${addressOf(from)}>`, [250]);
    await talk.send(`RCPT TO:<${clean(mail.to)}>`, [250, 251]);
    await talk.send('DATA', [354]);
    await talk.send(`${build(mail)}\r\n.`, [250]);
    await talk.send('QUIT', [221]).catch(() => undefined);
  } finally {
    socket.destroy();
  }
}

function sendToConsole(mail: Mail): void {
  const stamp = new Date().toISOString();
  const text = `To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`;
  console.log(`\n--- email (no SMTP_HOST set, so not actually sent) ${stamp} ---\n${text}---`);
  try {
    const dir = path.join(config.dataDir, 'outbox');
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, 'outbox.txt'), `=== ${stamp}\n${text}\n`);
  } catch {
    /* the console copy is enough */
  }
}

/** Sends in the background: a slow or broken mail server never delays or breaks the request. */
export function sendMail(mail: Mail): void {
  if (!config.smtp.host) {
    sendToConsole(mail);
    return;
  }
  sendSmtp(mail).catch((error: unknown) => {
    console.error(`Could not send email to ${mail.to}: ${error instanceof Error ? error.message : String(error)}`);
  });
}
