/**
 * A small SMTP client that talks over any socket providing the SmtpSocket interface. The Node server gives it a net/tls
 * socket and the Cloudflare Worker gives it a cloudflare:sockets one, so the protocol code is written (and tested) once.
 */
import type { Mail } from './runtime';

export interface SmtpSocket {
  /** The next chunk of text from the server, or null when the connection ended. */
  read(): Promise<string | null>;
  write(data: string): Promise<void>;
  /** Upgrades this connection to TLS (STARTTLS). The returned socket replaces this one. */
  startTls(): Promise<SmtpSocket>;
  close(): void;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

const clean = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();
const addressOf = (from: string): string => /<([^>]+)>/.exec(from)?.[1] ?? from.trim();

function base64Utf8(text: string): string {
  let binary = '';
  for (const b of new TextEncoder().encode(text)) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildMessage(from: string, mail: Mail): string {
  return [
    `From: ${clean(from)}`,
    `To: ${clean(mail.to)}`,
    `Subject: =?UTF-8?B?${base64Utf8(clean(mail.subject))}?=`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Utf8(mail.text).replace(/(.{76})/g, '$1\r\n'),
  ].join('\r\n');
}

class Replies {
  private buffer = '';
  constructor(private socket: SmtpSocket) {}

  /** A reply ends at the first line whose 4th character is a space (earlier lines of a multi-line reply have a dash). */
  private take(): { code: number; text: string } | null {
    const lines = this.buffer.split('\r\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3}( |$)/.test(lines[i] ?? '')) {
        this.buffer = lines.slice(i + 1).join('\r\n');
        return { code: Number((lines[i] ?? '').slice(0, 3)), text: lines.slice(0, i + 1).join('\n') };
      }
    }
    return null;
  }

  async next(): Promise<{ code: number; text: string }> {
    for (;;) {
      const reply = this.take();
      if (reply) return reply;
      const chunk = await this.socket.read();
      if (chunk === null) throw new Error('SMTP: the mail server closed the connection');
      this.buffer += chunk;
    }
  }
}

export async function deliver(open: () => Promise<SmtpSocket>, cfg: SmtpConfig, mail: Mail, implicitTls: boolean): Promise<void> {
  let socket = await open();
  try {
    let replies = new Replies(socket);
    const expect = async (codes: number[]): Promise<string> => {
      const reply = await replies.next();
      if (!codes.includes(reply.code)) throw new Error(`SMTP: unexpected reply "${reply.text}"`);
      return reply.text;
    };
    const command = async (line: string, codes: number[]): Promise<string> => {
      await socket.write(`${line}\r\n`);
      return expect(codes);
    };

    await expect([220]);
    let features = await command('EHLO wingmate', [250]);
    if (!implicitTls && /STARTTLS/i.test(features)) {
      await command('STARTTLS', [220]);
      socket = await socket.startTls();
      replies = new Replies(socket);
      features = await command('EHLO wingmate', [250]);
    } else if (!implicitTls && cfg.user) {
      throw new Error('SMTP: the server does not offer STARTTLS, so the password would travel unencrypted');
    }
    if (cfg.user) await command(`AUTH PLAIN ${base64Utf8(`\0${cfg.user}\0${cfg.pass}`)}`, [235]);
    await command(`MAIL FROM:<${addressOf(cfg.from)}>`, [250]);
    await command(`RCPT TO:<${clean(mail.to)}>`, [250, 251]);
    await command('DATA', [354]);
    await command(`${buildMessage(cfg.from, mail)}\r\n.`, [250]);
    await command('QUIT', [221]).catch(() => undefined);
  } finally {
    socket.close();
  }
}

/** Gives up after `ms` so a stuck mail server cannot hold a request open. */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SMTP: timed out')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
