// A fake mail server for tests: offers STARTTLS (self-signed certificate), requires AUTH PLAIN, and writes each received
// email to <dataDir>/outbox/outbox.txt in the same format the Node server uses without SMTP.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';

export function startFakeSmtp({ port, dataDir, user, pass }) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'wm-cert-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-days', '1', '-keyout', path.join(tmp, 'k.pem'), '-out', path.join(tmp, 'c.pem')], { stdio: 'ignore' });
  const key = readFileSync(path.join(tmp, 'k.pem'));
  const cert = readFileSync(path.join(tmp, 'c.pem'));
  const log = [];
  const server = net.createServer((raw) => {
    let socket = raw;
    let secure = false;
    let authed = false;
    let inData = false;
    let data = '';
    let buffer = '';
    const say = (text) => socket.write(text + '\r\n');
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      let i;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            const head = data.split('\r\n\r\n')[0];
            const body = Buffer.from(data.split('\r\n\r\n').slice(1).join('').replace(/\s+/g, ''), 'base64').toString('utf8');
            const to = /^To: (.*)$/m.exec(head)[1];
            const subject = Buffer.from(/=\?UTF-8\?B\?(.*)\?=/.exec(head)[1], 'base64').toString('utf8');
            mkdirSync(path.join(dataDir, 'outbox'), { recursive: true });
            appendFileSync(path.join(dataDir, 'outbox', 'outbox.txt'), `=== ${new Date().toISOString()}\nTo: ${to}\nSubject: ${subject}\n\n${body}\n\n`);
            log.push({ to, subject, secure, authed });
            data = '';
            say('250 queued');
          } else data += line + '\r\n';
          continue;
        }
        if (/^EHLO/.test(line)) { socket.write('250-fake\r\n' + (secure ? '' : '250-STARTTLS\r\n') + '250 AUTH PLAIN\r\n'); }
        else if (line === 'STARTTLS') {
          say('220 go ahead');
          socket.removeListener('data', onData);
          const wrapped = new tls.TLSSocket(raw, { isServer: true, key, cert });
          socket = wrapped; secure = true; wrapped.on('data', onData); wrapped.on('error', () => {});
        }
        else if (line.startsWith('AUTH PLAIN ')) {
          const [, u, p] = Buffer.from(line.slice(11), 'base64').toString('utf8').split('\0');
          authed = secure && u === user && p === pass;
          say(authed ? '235 ok' : '535 bad credentials');
        }
        else if (/^MAIL FROM:|^RCPT TO:/.test(line)) say(authed ? '250 ok' : '530 auth first');
        else if (line === 'DATA') { inData = true; say('354 go'); }
        else if (line === 'QUIT') { say('221 bye'); socket.end(); }
        else say('500 what');
      }
    };
    raw.on('data', onData);
    raw.on('error', () => {});
    say('220 fake ESMTP');
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, log })));
}
