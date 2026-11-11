# WingMate (working website)

Meet the people on your flight. Sign up, add your flight, see everyone else on it, connect, chat, play. Themed per airline
(AirAsia, built from its brand guide).

## Run it

**Windows:** double-click **`check-setup.bat`** to see whether your computer is ready (it tells you exactly what to install), then **`start-windows.bat`** (installs the tools on first run, starts the server, opens the browser).

**Anywhere else / by hand** (needs **Node 22.13 or newer**; the server uses Node's built-in SQLite, nothing else to install):

```bash
npm install            # once; only dev tools (TypeScript, esbuild)
npm run check:setup    # optional: checks Node version, port, data folder
npm start              # builds the pages + server, then serves http://localhost:3000
```

Open http://localhost:3000, pick a brand, sign up. To try it with two people use two different browsers (or one normal and one private window),
add the **same flight number and date** in both, then connect and chat. Data is stored in `data/wingmate.db`.
There are **no sample guests**: you only see real people who added the same flight.

### Email (confirmation and password reset)

Sign-up sends a confirmation link; nobody can log in until they click it. "Forgot password?" sends a reset link (valid 1 hour, single use,
logs out every other device). Both links go to the same airline theme the person was on.

- **Without email settings** (the default on your laptop) nothing is really sent: each email is **printed in the server window** and saved in
  `data/outbox/outbox.txt`. Copy the link from there into the browser.
- **To send real email**, set SMTP details before starting (any provider works, e.g. Gmail with an app password, SendGrid, Mailgun, the airline's own server):

```
SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_USER=you@gmail.com  SMTP_PASS=<app password>
SMTP_FROM="WingMate <you@gmail.com>"  WINGMATE_PUBLIC_URL=https://your-site.example
```
  Windows (one line each, in the same window, before `npm start`): `set SMTP_HOST=smtp.gmail.com` and so on.
  `WINGMATE_PUBLIC_URL` is the address people open the site at; it goes into the links.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` / `HOST` | 3000 / 127.0.0.1 | where to listen (use `HOST=0.0.0.0` in a container) |
| `WINGMATE_PUBLIC_URL` | http://localhost:PORT | site address used in email links |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | none / 587 | outgoing email (see above) |
| `WINGMATE_DATA_DIR` | `data` | where the database lives |
| `WINGMATE_SECURE_COOKIES` | off | set to `1` when served over HTTPS |
| `WINGMATE_TRUST_PROXY` | off | set to `1` behind a reverse proxy so rate limits use the real client IP |
| `WINGMATE_SESSION_DAYS` | 30 | login length ("remember me") |
| `WINGMATE_FLYER_RETENTION_MONTHS` | 3 | saved frequent-flyer details are deleted this long after the last flight |
| `WINGMATE_CHAT_RETENTION_DAYS` | 30 | closed chats are deleted this long after they close (**our assumption, confirm with legal**) |

## Where the data is stored

Everything (accounts, flights, connections, messages, reports) is in one SQLite file, `data/wingmate.db`, on the server's disk. Passwords are
stored only as scrypt hashes. **A hosting plan with a persistent disk is required**, otherwise the file is erased on every restart.
Make a safe copy any time with `npm run backup` (saved in `backups/`, works while the server runs); copy that folder somewhere off the server.

## Share it for free from your own computer (no hosting cost)

For a demo or a call: double-click **`start-public.bat`** (or `npm run public`). It builds the site, opens a free Cloudflare quick tunnel,
starts the server and prints a public `https://...trycloudflare.com/airasia/login.html` link to share.
First time only: install the tunnel program with `winget install Cloudflare.cloudflared` and open a new window.
The site is online only while that window is open and the computer is awake; the link changes every start; your data stays in `data/` on your computer.
For real confirmation emails copy `.env.example` to `.env` and fill in the Gmail app password (see the file).

## Put it online for free with Cloudflare (always on, deploys from GitHub)

The same API code also runs as a **Cloudflare Worker** with the data in a **D1** database, all on Cloudflare's free plan (no card).
You get a permanent address like `https://wingmate.<your-name>.workers.dev`, and every push to GitHub redeploys it.

1. Make a free account at https://dash.cloudflare.com.
2. **Create the database:** *Storage & databases > D1 SQL database > Create database*, name it `wingmate`. Copy its **Database ID**.
3. **Paste the ID:** on GitHub open `wrangler.toml`, replace `PASTE-YOUR-D1-DATABASE-ID-HERE` with that ID, and commit. (The tables are created automatically on the first request.)
4. **Connect the repo:** *Workers & Pages > Create > Import a repository*, choose `WingMate`. Build command `npm run build`, deploy command `npx wrangler deploy` (the defaults it suggests). Deploy.
5. **Email (needed, otherwise nobody can confirm their account):** in the Worker's *Settings > Variables and secrets* add `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=you@gmail.com`, `SMTP_FROM=WingMate <you@gmail.com>` as text, and `SMTP_PASS` (a Gmail **app password**) as a **Secret**.
6. Open `https://<your-worker>.workers.dev/airasia/login.html`, sign up, and check your inbox.

**Free plan limits to know about**
- **Password hashing is lighter than the Node server's.** A free Worker gets about 10 ms of processor time per request, so passwords use PBKDF2 with **10,000 rounds** (`PBKDF2_ITERATIONS`). That is weaker than the 600,000 usually recommended; fine for a pilot, not for a public launch. On the **$5/month Workers Paid plan** set `PBKDF2_ITERATIONS=600000` (each hash stores its own cost, so existing passwords keep working). If sign-in ever fails with "Error 1102", lower it (try 5000).
- **100,000 API requests a day.** The dashboard asks the server every 8 seconds (2.5 s while a chat is open), so a handful of people online all day is fine, hundreds is not.
- D1 free tier: 5 GB, 100,000 row writes and 5 million row reads per day.
- Cloudflare cannot send mail on port 25; Gmail on 587 (or 465) is fine.

**Testing without Cloudflare:** `npm test` runs the whole API test suite twice, against the Node server and against the Worker code running in a local harness
(`scripts/worker-harness/`: a fake D1, fake sockets and a fake mail server with STARTTLS). Run it locally with Cloudflare's own tooling using `npm run cf:dev`.
What the harness cannot prove: that Cloudflare's real D1 and TCP sockets behave the same, and that your mail provider accepts the connection from Cloudflare.

## Put it online on a server instead (Docker, Render, Fly.io)

The repo includes a `Dockerfile`, `render.yaml` (Render) and `fly.toml` (Fly.io). Either way: connect the GitHub repo, attach a 1 GB disk at `/data`,
set `WINGMATE_PUBLIC_URL` to the site address and the `SMTP_*` variables (otherwise confirmation and reset emails are never delivered),
and open `https://your-site/airasia/login.html`. HTTPS is provided by the host. Before real users: add Terms and Privacy pages and decide
the data-retention periods with legal.

## What it does

Accounts (email confirmation, password reset, scrypt-hashed passwords, cookie sessions, 16+ age check; sign-ups never confirmed within 7 days are removed), flights, matching by preferences, connection requests
(send / accept / decline), one-to-one chat that closes 48 hours after landing, block and report, profile and frequent-flyer data
with automatic deletion, account deletion. New messages and requests appear within a few seconds (the page polls; there are no websockets).
Safety: same-origin checks, rate limits, security headers, input validation on every route. The server tests (89 checks) and a
two-browser test pass.

## What it does NOT do yet (be honest about this in the pitch)

- **Flights are self-declared.** Anyone can enter any flight number; nothing checks a booking or the airline's schedule. For production, verify against the airline's booking/check-in system.
- Email sending is built in but **only tested against a local test mail server**; try it with your real provider before relying on it. Emails are plain text.
- Games are single-player practice, not multiplayer.
- No admin screen for reports (they are stored in the `reports` table).
- No HTTPS/deployment setup, and no Terms or Privacy pages.
- Chat is plain text between two people; no moderation or message encryption beyond HTTPS in transit.

## Layout

```
server/        the API (api.ts, auth.ts, validate.ts, jobs.ts, schema.ts, smtp.ts) shared by both backends, plus node/ (SQLite, scrypt, mail) and main.ts (Node server)
worker/        Cloudflare Worker: index.ts, d1.ts, password.ts, socket.ts (wrangler.toml is in the project root)
src/ts/        browser code (strict TypeScript)   src/pages/ HTML templates   src/styles/ CSS
brands/        per-airline theme (colours, logo, artwork)
build.mjs      builds dist/ (pages) and server-dist/ (server)
```

## Change the code

```bash
npm install            # once
npm run dev            # rebuilds on every save and restarts the server on :3000
npm run build          # build every brand into dist/<brand>/
npm run build:airasia
npm run check          # strict type-check + build
```

## Brands

```
brands/<brand>/
  brand.json    airline name, what it calls customers ("guests" / "passengers"), demo flight, drawing-pad colours
  brand.css     colour tokens, typeface, logo sizing, brand-specific touches (loaded last so it wins)
  hero.html     artwork on the log in / sign up panel
  flight.html   artwork on the dashboard flight card
  assets/       logo.png (+ anything the CSS/HTML refers to)
```

- **AirAsia** (`brands/airasia`): AirAsia Red (logo red `#EE2722`), black and white; plum, coral and magenta as secondary colours.
  The red-background version of the circle logo from the style guide. "Arc" artwork (red/black/white only, smile never a frown).
  Uses the word "guests", as the guide asks. Gotham Rounded is proprietary, so the stack falls back to Nunito (loaded from Google Fonts when online).

To add an airline: copy a brand folder, replace `assets/logo.png`, edit the files, run `npm run build`.

Logos come from the brand guides supplied. They are used as-is (not recoloured, cropped or redrawn); the AirAsia guide
says its logo must never be recreated. Check each airline's current guide before anything customer-facing.

## Where things live

```
src/
  pages/            HTML templates: login, signup, dashboard ({{placeholders}} filled from brand.json)
  styles/           CSS using brand tokens: base, auth (login + signup), login, dashboard
  ts/
    shared/         dom helpers, typed localStorage, form validation, brand (build-time settings)
    auth/           login.ts, signup.ts
    dashboard/      main, types, data (sample guests, trips <- swap for your backend), state, matching, router,
                    actions, ui, options, flight, views/ (home, find, messages, games, prefs, profile)
brands/             one folder per airline (above)
build.mjs           builds src/ + brands/ -> dist/<brand>/
```

## Notes

