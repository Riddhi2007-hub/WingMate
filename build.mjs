// Build script: TypeScript + CSS + images -> ONE self-contained HTML file per page in dist/.
//
//   npm run build                  build every brand into dist/<brand>/
//   npm run build -- --brand=airasia   build one brand only (airasia, airindia)
//   npm run build:min              same, minified
//   npm start                      build everything, then run the server (http://localhost:3000)
//   npm run dev                    rebuild on every save and restart the server
//
// Brands live in brands/<brand>/ (brand.json, brand.css, hero.html, flight.html, assets/).
// Adding a new airline = copying one of those folders and editing it.
//
// Each dist/*.html has its CSS, JavaScript and images built in, so it works wherever it is opened:
// double-clicked, copied on its own into any folder, emailed, or shown in a preview.
// (Links between pages, like Log in -> dashboard.html, only need the pages to sit in the same folder.)
// The scripts are classic (IIFE) scripts, not ES modules, so they also run from file:// URLs.

import { build } from 'esbuild';
import { mkdir, readFile, readdir, rm, writeFile, access } from 'node:fs/promises';
import { watch, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const args = new Set(process.argv.slice(2));
const minify = args.has('--minify');
const brandsDir = path.join(root, 'brands');
const only = [...args].find((a) => a.startsWith('--brand='))?.slice(8);

const entries = {
  login: 'src/ts/auth/login.ts',
  signup: 'src/ts/auth/signup.ts',
  verify: 'src/ts/auth/verify.ts',
  forgot: 'src/ts/auth/forgot.ts',
  reset: 'src/ts/auth/reset.ts',
  dashboard: 'src/ts/dashboard/main.ts',
};

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const exists = (file) => access(file).then(() => true, () => false);

async function dataUri(file) {
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`Unknown file type for inlining: ${file}`);
  return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
}

/** Replaces every match using an async function (and a function replacer, so "$&" in code is never special). */
async function replaceAsync(text, regex, fn) {
  const matches = [...text.matchAll(regex)];
  const parts = await Promise.all(matches.map((m) => fn(...m)));
  let out = '';
  let last = 0;
  matches.forEach((m, i) => {
    out += text.slice(last, m.index) + parts[i];
    last = m.index + m[0].length;
  });
  return out + text.slice(last);
}

/** Inlines images, and optional fonts when the files exist (a missing font is dropped so nothing 404s). */
async function inlineCss(css, brandDir = null) {
  const find = async (kind, rel) => {
    const candidates = [brandDir && path.join(brandDir, kind, rel), path.join(root, 'public', kind, rel)].filter(Boolean);
    for (const file of candidates) if (await exists(file)) return file;
    return null;
  };
  // url("../assets/..." or "../fonts/...") as an entry in a src: list, with its leading comma
  css = await replaceAsync(css, /,\s*url\(\s*["']?\.\.\/(assets|fonts)\/([^"')]+)["']?\s*\)(\s*format\([^)]*\))?/g, async (_all, kind, rel, format = '') => {
    const file = await find(kind, rel);
    return file ? `,url("${await dataUri(file)}")${format}` : '';
  });
  // any other url(../assets/...)
  return replaceAsync(css, /url\(\s*["']?\.\.\/(assets|fonts)\/([^"')]+)["']?\s*\)/g, async (_all, kind, rel) => {
    const file = await find(kind, rel);
    if (!file) throw new Error(`missing ${kind}/${rel}`);
    return `url("${await dataUri(file)}")`;
  });
}

async function bundleScripts(brand) {
  const result = await build({
    entryPoints: Object.fromEntries(Object.entries(entries).map(([name, file]) => [name, path.join(root, file)])),
    outdir: path.join(root, '.build'),
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    minify,
    define: { __BRAND__: JSON.stringify(brand) },
    logLevel: 'warning',
  });
  const scripts = {};
  for (const file of result.outputFiles) scripts[path.basename(file.path, '.js')] = file.text;
  return scripts;
}

async function readBrand(id) {
  const dir = path.join(brandsDir, id);
  const brand = JSON.parse(await readFile(path.join(dir, 'brand.json'), 'utf8'));
  if (brand.id !== id) throw new Error(`brands/${id}/brand.json has id "${brand.id}"`);
  return { dir, brand };
}

async function buildBrand(id, styles) {
  const { dir, brand } = await readBrand(id);
  const scripts = await bundleScripts(brand);
  const brandCss = await inlineCss(await readFile(path.join(dir, 'brand.css'), 'utf8'), dir);
  const fragment = async (name) => ((await exists(path.join(dir, name))) ? readFile(path.join(dir, name), 'utf8') : '');
  const tokens = {
    airline: brand.airline,
    themeColor: brand.themeColor,
    guests: brand.guests,
    Guests: brand.guests[0].toUpperCase() + brand.guests.slice(1),
    fromCode: brand.flight.fromCode,
    fromCity: brand.flight.fromCity,
    toCode: brand.flight.toCode,
    toCity: brand.flight.toCity,
    fonts: brand.fontsHref
      ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${brand.fontsHref}">`
      : '',
    hero: await fragment('hero.html'),
    flight: await fragment('flight.html'),
  };
  const out = path.join(dist, id);
  await mkdir(out, { recursive: true });

  const pages = (await readdir(path.join(root, 'src/pages'))).filter((f) => f.endsWith('.html') && f !== 'index.html');
  for (const page of pages) {
    let html = await readFile(path.join(root, 'src/pages', page), 'utf8');

    html = html.replace(/\{\{(\w+)\}\}/g, (_all, key) => {
      if (!(key in tokens)) throw new Error(`${page}: unknown placeholder {{${key}}}`);
      return tokens[key];
    });
    html = await replaceAsync(html, /<link rel="stylesheet" href="css\/([\w-]+)\.css">/g, async (_all, name) => {
      if (!(name in styles)) throw new Error(`${page}: no src/styles/${name}.css`);
      return `<style>\n${styles[name].trim()}\n</style>`;
    });
    // brand.css goes last so its overrides win over the shared styles
    html = html.replace('</head>', () => `<style>\n${brandCss.trim()}\n</style>\n</head>`);
    html = await replaceAsync(html, /<script src="js\/([\w-]+)\.js"><\/script>/g, async (_all, name) => {
      if (!(name in scripts)) throw new Error(`${page}: no script entry named "${name}"`);
      // "</script" inside the code would end the tag early
      return `<script>\n${scripts[name].trim().replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')}\n</script>`;
    });
    html = await replaceAsync(html, /(\ssrc=")assets\/([^"]+)(")/g, async (_all, a, rel, c) => {
      const file = [path.join(dir, 'assets', rel), path.join(root, 'public/assets', rel)].find((f) => existsSync(f));
      if (!file) throw new Error(`${page}: missing asset ${rel} for brand ${id}`);
      return `${a}${await dataUri(file)}${c}`;
    });

    const leftovers = [...html.matchAll(/(?:src|href)="((?:css|js|assets)\/[^"]*)"/g)].map((m) => m[1]);
    if (leftovers.length) throw new Error(`${page}: still depends on separate files: ${leftovers.join(', ')}`);

    await writeFile(path.join(out, page), html);
  }
  return { brand, pages: pages.length };
}

/** Bundles the server (server/main.ts) into one file: server-dist/server.mjs. It needs only Node 22.13+, no packages. */
async function buildServer() {
  await build({
    entryPoints: [path.join(root, 'server/main.ts')],
    outfile: path.join(root, 'server-dist/server.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    minify: false,
    sourcemap: false,
    external: ['node:*'],
    logLevel: 'warning',
  });
}

async function buildSite() {
  const started = Date.now();
  const styles = {};
  for (const file of await readdir(path.join(root, 'src/styles'))) {
    if (file.endsWith('.css')) styles[path.basename(file, '.css')] = await inlineCss(await readFile(path.join(root, 'src/styles', file), 'utf8'));
  }
  const ids = (await readdir(brandsDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const chosen = only ? ids.filter((id) => id === only) : ids;
  if (!chosen.length) throw new Error(`No brand "${only}". Available: ${ids.join(', ')}`);

  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  const built = [];
  for (const id of chosen) built.push(await buildBrand(id, styles));

  // Cloudflare: security headers for the static pages, a redirect from /<brand>/ to the login page, and the brand list the Worker uses
  const headers = JSON.parse(await readFile(path.join(root, 'server/security-headers.json'), 'utf8'));
  await writeFile(path.join(dist, '_headers'), '/*\n' + Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join('\n') + '\n');
  for (const id of chosen) {
    await writeFile(path.join(dist, id, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=login.html"><title>WingMate</title><a href="login.html">Log in</a>\n');
  }
  const airlines = Object.fromEntries(built.map(({ brand }) => [brand.id, brand.airline]));
  await mkdir(path.join(root, 'worker'), { recursive: true });
  await writeFile(path.join(root, 'worker/brands.generated.json'), JSON.stringify(airlines, null, 2) + '\n');
  await buildServer();
  await rm(path.join(root, '.build'), { recursive: true, force: true });

  const links = built.map(({ brand }) => `<li><a href="${brand.id}/login.html">${brand.airline}</a></li>`).join('');
  await writeFile(path.join(dist, 'index.html'), `<!doctype html><meta charset="utf-8"><title>WingMate</title><body style="font-family:system-ui,sans-serif;max-width:420px;margin:12vh auto;padding:0 20px"><h1>WingMate</h1><p>Open the version for:</p><ul style="line-height:2">${links}</ul></body>`);
  console.log(`Built ${built.map((b) => b.brand.id).join(', ')} (${built.reduce((n, b) => n + b.pages, 0)} pages) into dist/ in ${Date.now() - started}ms. Run npm start, then open http://localhost:3000`);
}

await buildSite();

if (args.has('--watch')) {
  let timer;
  let busy = false;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (busy) return rebuild();
      busy = true;
      try {
        await buildSite();
      } catch (err) {
        console.error(String(err.message ?? err));
      }
      busy = false;
    }, 150);
  };
  for (const dir of ['src', 'public', 'brands', 'server']) watch(path.join(root, dir), { recursive: true }, rebuild);

  // keep the server running; node --watch restarts it whenever server-dist/server.mjs is rebuilt
  const child = spawn(process.execPath, ['--watch', path.join(root, 'server-dist/server.mjs')], { stdio: 'inherit' });
  process.on('exit', () => child.kill());
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0));
}
