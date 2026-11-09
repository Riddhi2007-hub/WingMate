// Checks that this computer can run WingMate and says exactly what to fix.  Run:  npm run check:setup  (or check-setup.bat on Windows)
// Plain JavaScript with no imports from the project, so it works even when the Node version is too old for the server.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN = [22, 13];
let failed = 0;
const pass = (m) => console.log(`  [ok]    ${m}`);
const warn = (m) => console.log(`  [note]  ${m}`);
const fail = (m, fix) => { failed++; console.log(`  [FIX]   ${m}\n          -> ${fix}`); };

console.log('\nWingMate setup check\n');

// 1. Node version (the server uses Node's built-in SQLite, added in 22.13)
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major > MIN[0] || (major === MIN[0] && minor >= MIN[1])) pass(`Node.js ${process.versions.node} (needs ${MIN.join('.')} or newer)`);
else fail(`Node.js ${process.versions.node} is too old (needs ${MIN.join('.')} or newer)`, 'Install the current LTS from https://nodejs.org (Windows: run  winget install OpenJS.NodeJS.LTS ), then open a NEW terminal.');

// 2. built-in SQLite really loads
try { await import('node:sqlite'); pass('Built-in SQLite is available'); }
catch { fail('Built-in SQLite (node:sqlite) is not available in this Node', 'Update Node.js to the current LTS (see above).'); }

// 3. npm
const npm = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['-v'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (npm.status === 0) pass(`npm ${npm.stdout.trim()}`);
else fail('npm was not found', 'It comes with Node.js: reinstall Node from https://nodejs.org and open a NEW terminal.');

// 4. project tools installed
if (existsSync(path.join(root, 'node_modules', 'esbuild'))) pass('Project tools are installed (node_modules)');
else fail('Project tools are not installed yet', 'In this folder run:  npm install   (needs an internet connection, once).');

// 5. the data folder can be written
try {
  const dir = path.resolve(process.env.WINGMATE_DATA_DIR ?? path.join(root, 'data'));
  mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, '.write-test');
  writeFileSync(probe, 'ok'); rmSync(probe);
  pass(`Can save data in ${dir}`);
} catch (e) { fail(`Cannot write to the data folder (${e.code ?? e.message})`, 'Move the project to a normal folder such as Documents, not a protected or read-only place.'); }

// 6. the port is free
const port = Number(process.env.PORT ?? 3000);
await new Promise((resolve) => {
  const probe = net.createServer();
  probe.once('error', (e) => { e.code === 'EADDRINUSE' ? fail(`Port ${port} is already in use`, `Close the other program, or use another port:  set PORT=3001  then start again.`) : warn(`Could not test port ${port}: ${e.code}`); resolve(); });
  probe.once('listening', () => { probe.close(() => { pass(`Port ${port} is free`); resolve(); }); });
  probe.listen(port, '127.0.0.1');
});

// 7. optional: email
if (process.env.SMTP_HOST) pass(`Email will be sent through ${process.env.SMTP_HOST}`);
else warn('No SMTP_HOST set: confirmation and reset emails are NOT sent. They are printed in the server window and saved in data\\outbox\\outbox.txt, so you can still test by copying the link.');

console.log(failed ? `\n${failed} thing(s) to fix before it will run.\n` : '\nAll good. Start it with:  npm start   (or double-click start-windows.bat), then open http://localhost:' + port + '\n');
process.exit(failed ? 1 : 0);
