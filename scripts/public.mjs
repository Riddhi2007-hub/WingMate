// Runs WingMate on this computer and shares it at a public https link using a free Cloudflare quick tunnel.
//   npm run public      (or double-click start-public.bat on Windows)
// The site is only reachable while this window stays open. Your data stays in the data folder on this computer.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const PORT = process.env.PORT ?? '3000';

// settings in a file named .env (see .env.example), so the email password is never typed into a command
const settings = {};
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) settings[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}

console.log('\nChecking this computer...');
if (spawnSync(process.execPath, ['scripts/preflight.mjs'], { stdio: 'inherit', env: { ...process.env, PORT } }).status !== 0) process.exit(1);

const tunnelCmd = process.env.WINGMATE_TUNNEL_CMD ?? 'cloudflared';
const probe = process.env.WINGMATE_TUNNEL_CMD ? { status: 0 } : spawnSync(tunnelCmd, ['--version'], { shell: process.platform === 'win32' });
if (probe.error || probe.status !== 0) {
  console.log(`\nThe free tunnel program (cloudflared) is not installed.\n  Windows:  winget install Cloudflare.cloudflared   (then open a NEW window and run this again)\n  Other:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n`);
  process.exit(1);
}

console.log('Building...');
if (spawnSync(process.execPath, ['build.mjs'], { stdio: 'inherit' }).status !== 0) process.exit(1);

console.log('Opening the tunnel...');
const args = process.env.WINGMATE_TUNNEL_CMD ? [] : ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'];
const tunnel = spawn(tunnelCmd, args, { shell: process.platform === 'win32' });
let server = null;
let buffer = '';
const stop = () => { server?.kill(); tunnel.kill(); };
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('exit', stop);

const onOutput = (chunk) => {
  buffer += chunk.toString();
  if (server) return;
  const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buffer);
  if (!match) return;
  const url = match[0];
  // the address is known now, so the server can put it in the links of its emails
  server = spawn(process.execPath, ['server-dist/server.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, ...settings, PORT, HOST: '127.0.0.1', WINGMATE_SECURE_COOKIES: '1', WINGMATE_TRUST_PROXY: '1', WINGMATE_PUBLIC_URL: url },
  });
  server.on('exit', (code) => { console.log(`Server stopped (${code}).`); tunnel.kill(); process.exit(code ?? 0); });
  const emailOn = Boolean(settings.SMTP_HOST ?? process.env.SMTP_HOST);
  setTimeout(() => {
    console.log(`\n==================================================================\n  WingMate is online. Share this link:\n\n     ${url}/airasia/login.html\n\n  Keep this window open. Closing it (or sleeping the laptop) takes the site offline,\n  and the link changes next time you start it.\n  ${emailOn ? 'Emails are sent through ' + (settings.SMTP_HOST ?? process.env.SMTP_HOST) + '.' : 'Email is NOT set up: confirmation/reset links are printed in this window (and data/outbox/outbox.txt).\n  Copy the link from there. See .env.example to send real emails.'}\n==================================================================\n`);
  }, 800);
};
tunnel.stdout.on('data', onOutput);
tunnel.stderr.on('data', onOutput);
tunnel.on('exit', (code) => { if (!server) console.log(`The tunnel stopped before it got a link (code ${code}). Check your internet connection and try again.`); process.exit(1); });
