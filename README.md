# Mockup Studio

Capture any website, even one behind a login, and generate hundreds of professional device mockups automatically.

Paste a URL, press **Capture**, and every page becomes a set of mockups across 25 templates. Review them in a gallery, tick the ones you want, and download them as a ZIP.

## Features

- **Scroll sections.** Each page is scrolled, including inner scroll containers, and captured at the top, middle and bottom, so mockups show more than the first screen.
- **Real captures.** A headless Edge/Chrome (Playwright) opens your site and takes desktop, tablet, mobile and full-page screenshots.
- **Sign-in support.** Enter an email and password once. The studio signs in, explores your pages, and signs out when you are done.
- **Page crawler.** Follows same-site links up to a limit you choose (1 to 100). Skips logout and delete links, error pages and blank pages.
- **Auto mockups.** Every page is placed in every template: laptop, browser window, tablet, phone, flat panel, and multi-device scenes. Colors come from the site itself.
- **Gallery.** Filter by page or template, select the mockups you like, and download only those.
- **Editor.** Move, scale and rotate devices. Change frames, shadows, textures and backdrops.
- **Export.** PNG or JPEG at 1x, 2x, 3x, 1080p, 2K or 4K. Export all streams everything into one ZIP.

## How it works

```
web/      React + Vite studio (UI, templates, canvas renderer)   -> Vercel or local
server/   Node + Express + Playwright capture server            -> your computer
```

The browser draws every mockup on a canvas, and the preview and the export use the same renderer, so exported pixels match what you see.
The capture server must run on your own machine: it needs Edge or Chrome, it reaches your localhost and LAN sites, and it keeps one sign-in open between captures. Vercel serverless functions cannot do that, so Vercel hosts only the UI.

## Quick start

Requires Node.js 18+ and Microsoft Edge or Google Chrome.

```bash
# terminal 1: capture server
cd server
npm install
npm run dev          # local and LAN capture enabled

# terminal 2: studio
cd web
npm install
npm run dev
```

Open the address Vite prints, enter a site address, and press **Capture website**.

## Deploy the UI to Vercel

1. Push this repository to GitHub.
2. In Vercel choose **Add New, Project**, and import the repository.
3. Under **Root Directory** click Edit and pick `web`. (Leaving it empty also works: the root `vercel.json` builds `web` for you.)
4. Framework Preset should read **Vite**. Leave the build settings as they are.
5. Open **Environment Variables** and add `VITE_CAPTURE_URL` = `http://localhost:5050`.
6. Click **Deploy**.
7. On your computer, start the capture server and allow your exact Vercel address:

```powershell
cd server
$env:ALLOWED_ORIGINS="https://your-app.vercel.app"
npm run dev
```

Use Edge or Chrome. The first time, the browser may ask to allow access to devices on your local network. Allow it.

Do not use wildcard origins such as `*.vercel.app`: any site on that domain could then drive your capture server and reach your local network.
After you change an environment variable in Vercel, redeploy so it takes effect.

## Host the capture server (optional, auto-deploys from GitHub)

A hosted server captures **public** websites only. It cannot reach your localhost or home network, so keep running the server on your PC for those.
The studio picks the right server for you.

On Render:
1. In Render choose **New, then Blueprint**, connect this GitHub repository, and pick it. Render reads `render.yaml`.
2. When asked, set `ALLOWED_ORIGINS` to your exact Vercel address.
3. Deploy. Render now rebuilds the server on every push to GitHub, just as Vercel does for the UI.
4. In Vercel add the environment variable `VITE_CAPTURE_URL` with the Render address and redeploy. In the studio's Capture tab choose **Hosted server**. Local and LAN addresses always use your computer automatically.

The hosted server has no password. It captures public websites only, accepts calls only from your `ALLOWED_ORIGINS`, runs two captures at a time, and allows 40 captures per address per hour.

The container installs Chromium. Free plans sleep when idle and have little memory, so crawls can be slow or run out of memory. A paid instance is more reliable.

## Troubleshooting

**"No usable pages found"**
- The message lists why each page was skipped (error page, blank page, asks for sign-in).
- If it names an address like `192.168.0.159:5000`, the site loads its data from your home network. A hosted server cannot reach that, so the page renders blank. Capture it with the server on your computer.
- A hosted server can only open sites that are reachable from the internet. Your own `localhost` and LAN sites need the server on your computer.

**"Failed to fetch" or the server shows a red dot**
- The Capture tab shows what is wrong. If it says the server answered but blocks this website, set `ALLOWED_ORIGINS` on the server to exactly the address in your browser bar, for example `https://mockup-studio.vercel.app`, with no slash at the end. Render redeploys after you save.
- Vercel gives each project several addresses, and each deployment has its own. For preview addresses, add a pattern that includes your team name, such as `https://mockup-studio-*-your-team.vercel.app`. Never use `https://*.vercel.app`.
- A free Render server sleeps when idle and needs about a minute to wake.
- For the server on your own computer, start it with `npm run dev` in `server`. Allow the local network prompt if your browser shows one.
- The server logs `[cors] blocked origin …` when it refuses a website. Read it in the Render Logs tab or your terminal.

## Configuration

| Variable | Where | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_CAPTURE_URL` | web | empty | Address of the capture server. Empty uses the Vite dev proxy. |
| `ALLOWED_ORIGINS` | server | localhost 5173 and 5174 | Comma-separated origins allowed to call the server. |
| `PORT` | server | `5050` | Server port. |
| `HOST` | server | `127.0.0.1` | Bind address. The Docker image uses `0.0.0.0`. |
| `--local` flag or `ALLOW_LOCAL=1` | server | on with `npm run dev` | Allow capturing localhost and LAN addresses. |
| `BROWSER` | server | `msedge`, `chrome`, `chromium` | Browser to launch. The Docker image uses `chromium`. |
| `SESSION_IDLE_MS` | server | `600000` | Sign out after this many idle milliseconds. |

## Security

- **SSRF guard.** Only http(s) URLs. Cloud metadata addresses are always blocked. Private and LAN addresses are blocked unless local mode is enabled. Every sub-request and redirect is re-checked.
- **Credentials.** The password is sent only to your capture server, held in memory for the run, never logged or stored, and cleared in the UI after capture. The email is remembered in your browser.
- **Plain http.** The server refuses to send a password over http to a public host.
- **Origin allowlist.** Only listed origins can use the server from a browser.
- **Sessions.** One sign-in is kept per account. It ends when you press Sign out, close the tab, stay idle for 10 minutes, or stop the server. If a run fails after sign-in, it signs out.

Use a demo account where you can. A crawl loads every page the account can see.

## Limitations

- Logins with two-factor authentication, captcha, or an interactive single sign-on step are not supported.
- Only normal links are followed. Hash routes (`/#/page`) and menus that need a click are not discovered.
- Sign-out finds a button labelled Logout, Log out, Sign out or Log off.
- Classic ZIP files stop at 4 GB. Use JPEG or a lower resolution for very large exports.

## Project structure

```
server/index.js          capture, login, crawl, sessions
web/src/App.jsx          studio UI, gallery, export
web/src/render.js        canvas renderer: devices, shadows, backdrops
web/src/auto.js          templates, palettes, layout fitting
web/src/zip.js           dependency-free ZIP writer
```

## License

MIT
