"use strict";
// Website Capture Engine: login once, crawl, capture, sign out when finished.
// Passwords live in memory for one request only: never logged, never stored.
const express = require("express");
const dns = require("dns").promises;
const net = require("net");
const crypto = require("crypto");
const { createRouteBook } = require("./routes");
const { chromium } = require("playwright-core");

const PORT = process.env.PORT || 5050;
const VERSION = require("./package.json").version;
const HOST = process.env.HOST || "127.0.0.1"; // 0.0.0.0 inside a container
const ALLOW_LOCAL = process.env.ALLOW_LOCAL === "1" || process.argv.includes("--local");
const IDLE_MS = parseInt(process.env.SESSION_IDLE_MS || "600000", 10); // sign out after 10 idle minutes
const META = [/^169\.254\./, /^fe80:/i, /^fd00:ec2:/i, /^100\.100\.100\.200$/, /^0\./];
const PRIV = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^::1$/, /^f[cd][0-9a-f]{2}:/i];
const META_HOSTS = ["metadata.google.internal", "metadata"];
const PER_ROUTE = parseInt(process.env.PER_ROUTE || "2", 10); // visits per kind of page (/media/:id counts once for all ids)
const SKIP_PATH = /(log-?out|sign-?out|log-?in|sign-?in|sign-?up|register|forgot|reset|verify|delete|remove|destroy|unsubscribe|revoke|privacy|terms|cookie|legal|imprint|disclaimer|sitemap|licen[sc]e|\btos\b)/i; // risky, or poor mockup material
const NGROK = /(^|\.)ngrok[\w-]*\.(dev|app|io)$/i; // free ngrok shows a warning page to browsers unless this header is sent
const SKIP_EXT = /\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|mkv|mp3|exe|dmg)$/i;
const LITE = !ALLOW_LOCAL; // hosted server: small memory budget, so smaller screenshots
const VIEWS = {
    desktop: { w: 1440, h: 900, dpr: LITE ? 1 : 1.5 },
    tablet: { w: 820, h: 1180, dpr: LITE ? 1.5 : 2 },
    mobile: { w: 390, h: 844, dpr: LITE ? 2 : 3, mobile: true },
};
const img = (b, t = "png") => `data:image/${t};base64,${b.toString("base64")}`;
const norm = (u) => { const x = new URL(u); return x.origin + (x.pathname.replace(/\/+$/, "") || "/"); };
class Fatal extends Error {} // stops the whole run; anything else only skips one page

async function guard(raw) {
    let u;
    try { u = new URL(raw); } catch { throw new Fatal("Invalid URL. Include http:// or https://"); }
    if (!/^https?:$/.test(u.protocol)) throw new Fatal("Only http and https URLs are allowed.");
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (META_HOSTS.includes(host)) throw new Fatal("Blocked: cloud metadata host.");
    const addrs = net.isIP(host)
        ? [{ address: host }]
        : await dns.lookup(host, { all: true }).catch(() => { throw new Fatal(`Cannot resolve "${host}".`); });
    let priv = false;
    for (const { address: a } of addrs) {
        if (META.some((r) => r.test(a))) throw new Fatal("Blocked: link-local or metadata address.");
        if (PRIV.some((r) => r.test(a))) {
            if (!ALLOW_LOCAL) throw new Fatal("This server cannot reach local or LAN addresses. Use This computer in the studio and run npm run dev in the server folder.");
            priv = true;
        }
    }
    return { href: u.toString(), priv };
}

async function launch() {
    const args = [...(process.getuid?.() === 0 ? ["--no-sandbox", "--disable-dev-shm-usage"] : []), ...(LITE ? ["--disable-gpu", "--disable-extensions"] : [])]; // containers run as root
    for (const channel of [process.env.BROWSER, "msedge", "chrome", "chromium"].filter(Boolean)) {
        try { return await chromium.launch(channel === "chromium" ? { args } : { channel, args }); } catch { /* try next */ }
    }
    throw new Fatal("No browser found. Install Microsoft Edge or Google Chrome, or set BROWSER=msedge|chrome|chromium.");
}

async function newCtx(browser, v, state, ok, sess) {
    const ctx = await browser.newContext({
        viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr,
        isMobile: !!v.mobile, hasTouch: !!v.mobile, acceptDownloads: false, storageState: state,
    });
    await ctx.route("**/*", async (r) => { // re-check every request, incl. redirects
        const u = r.request().url();
        if (/^(data|blob):/.test(u)) return r.continue();
        try { if (!ok.has(u)) { await guard(u); ok.set(u, 1); } if (NGROK.test(new URL(u).hostname)) return r.continue({ headers: { ...r.request().headers(), "ngrok-skip-browser-warning": "1" } }); r.continue(); } catch { try { ok.blocked?.add(new URL(u).host); } catch { /* ignore */ } r.abort(); }
    });
    if (sess && sess.data !== "{}") // sessionStorage is per-tab and not in storageState: replay it before the app boots
        await ctx.addInitScript(([o, d]) => {
            if (location.origin !== o) return;
            try { for (const [k, v] of Object.entries(JSON.parse(d))) if (sessionStorage.getItem(k) === null) sessionStorage.setItem(k, v); } catch { /* ignore */ }
        }, [sess.origin, sess.data]);
    return ctx;
}

// Free ngrok shows "You are about to visit ... [Visit Site]" to browsers. Click through it like a person would.
async function dismissNgrok(page) {
    try {
        if (!NGROK.test(new URL(page.url()).hostname)) return;
        const btn = page.getByRole("button", { name: /visit site/i }).or(page.getByRole("link", { name: /visit site/i })).or(page.getByText(/^\s*visit site\s*$/i)).first();
        if (!(await btn.count())) return;
        await btn.click({ timeout: 4000 });
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(600);
    } catch { /* isBad reports it if the warning page is still showing */ }
}

async function open(page, url) {
    let resp = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try { resp = await page.goto(url, { waitUntil: "networkidle" }); break; }
        catch (e) {
            if (/ERR_CONNECTION_REFUSED|ECONNREFUSED/.test(e.message)) throw new Fatal(`Connection refused at ${url}. Start the site, then retry.`);
            if (/Timeout/i.test(e.message)) break; // slow but loaded enough
            if (attempt === 1) throw e; // transient network error: retried once
            await page.waitForTimeout(800);
        }
    }
    await dismissNgrok(page);
    await page.waitForTimeout(700);
    return resp;
}

// error, "not found" and blank pages make bad mockups: detect and skip them
async function isBad(page, resp) {
    if (resp && resp.status() >= 400) return `HTTP ${resp.status()}${/ngrok/i.test(page.url()) ? " (is the ngrok tunnel and your site still running?)" : ""}`;
    await page.waitForFunction(() => (document.body?.innerText || "").trim().length > 20, null, { timeout: 4000 }).catch(() => {}); // let a slow single-page app render first
    const i = await page.evaluate(() => {
        const t = (document.body?.innerText || "").trim();
        return { len: t.length, head: t.slice(0, 300).toLowerCase(), title: document.title.toLowerCase(), media: document.querySelectorAll("img,svg,canvas,video").length, warn: /you are about to visit/i.test(t) && /ngrok/i.test(t) };
    });
    if (i.warn) return "ngrok warning page (could not click Visit Site)";
    const words = /(page not found|not found|something went wrong|server error|forbidden|access denied|unauthori[sz]ed|no such page|does not exist|oops)/;
    const codes = /\b(404|403|500|502|503)\b/;
    if (i.len < 400 && (words.test(i.head) || words.test(i.title) || codes.test(i.title) || codes.test(i.head.slice(0, 120)))) return "error page";
    if (i.len < 5 && i.media === 0) return "blank page";
    return null;
}

const hasPassword = (page) => page.locator('input[type="password"]:visible').count();

async function doLogin(page, loginUrl, email, password) {
    await open(page, loginUrl);
    const pw = page.locator('input[type="password"]:visible').first();
    if (!(await pw.count())) throw new Fatal("No password field on that page. Put the login page address in the Login section.");
    const em = page.locator('input[type="email"]:visible, input[autocomplete="username"]:visible, input[name*="email" i]:visible, input[name*="user" i]:visible, input[id*="email" i]:visible, input[type="text"]:visible').first();
    if (await em.count()) await em.fill(email);
    await pw.fill(password);
    const before = page.url();
    const btn = page.locator('button[type="submit"]:visible, input[type="submit"]:visible').first();
    const named = page.getByRole("button", { name: /sign in|log in|login|continue/i }).first();
    if (await btn.count()) await btn.click(); else if (await named.count()) await named.click(); else await pw.press("Enter");
    await Promise.race([
        page.waitForURL((u) => u.toString() !== before, { timeout: 12000 }),
        page.waitForSelector('input[type="password"]', { state: "detached", timeout: 12000 }),
    ]).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    if (await hasPassword(page)) throw new Fatal("Login failed. Check email and password, or the login page address.");
}

async function links(page, origin) {
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.href));
    const out = [];
    for (const h of hrefs) {
        let u; try { u = new URL(h); } catch { continue; }
        if (u.origin !== origin || !/^https?:$/.test(u.protocol)) continue;
        if (SKIP_PATH.test(u.pathname) || SKIP_EXT.test(u.pathname)) continue;
        out.push(norm(u.href));
    }
    return out;
}

// In-tab SPA navigation: keeps memory-only logins alive (a reload would lose them).
async function spaGo(page, target) {
    const u = new URL(target);
    await page.evaluate((p) => { history.pushState({}, "", p); window.dispatchEvent(new PopStateEvent("popstate")); }, u.pathname + u.search);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(900);
}

// Ends the session on the site itself (opens a profile menu first if the button hides in one).
async function signOut(page, startUrl, spa) {
    try {
        if (spa) await spaGo(page, startUrl); else await open(page, startUrl);
        const find = () => page.locator('button, a, [role="button"], [role="menuitem"]').filter({ hasText: /^\s*(log\s?out|sign\s?out|log\s?off)\s*$/i }).first();
        let el = find();
        if (!(await el.count())) {
            const menu = page.locator('[aria-label*="profile" i], [aria-label*="account" i], [aria-label*="user" i], [aria-label*="menu" i]').first();
            if (await menu.count()) { await menu.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); el = find(); }
        }
        if (!(await el.count())) return false;
        await el.click({ timeout: 4000 });
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(800);
        return true;
    } catch { return false; }
}

// What is on screen right now? Pictures and real content make a good mockup; a footer or empty space does not.
const MEASURE = () => {
    const vw = innerWidth, vh = innerHeight, area = vw * vh;
    const vis = (r) => { const w = Math.min(r.right, vw) - Math.max(r.left, 0), h = Math.min(r.bottom, vh) - Math.max(r.top, 0); return w > 0 && h > 0 ? w * h : 0; };
    let media = 0, blocks = 0, footer = 0;
    for (const el of document.querySelectorAll("img,video,canvas,svg,picture")) { const a = vis(el.getBoundingClientRect()); if (a > 3000) media += a; }
    for (const el of document.querySelectorAll("h1,h2,h3,h4,button,input,select,textarea,article,li,[class*='card' i]")) if (vis(el.getBoundingClientRect()) > 1500) blocks++;
    for (const el of document.querySelectorAll("footer,[role='contentinfo'],[class*='footer' i],[id*='footer' i]")) footer = Math.max(footer, vis(el.getBoundingClientRect()));
    return { media: Math.min(media / area, 1), blocks: Math.min(blocks / 14, 1), footer: Math.min(footer / area, 1) };
};
const valueOf = (m) => Math.max(0, 0.55 * m.media + 0.3 * m.blocks - 1.4 * m.footer - (m.media < 0.03 && m.blocks < 0.15 ? 0.2 : 0));
const MIN_VALUE = 0.1;

// Scrolls the page (or its inner scroll container, as in most web apps), scores each stop,
// skips footers and empty areas, and returns the best sections first.
async function extraShots(page, sections, fmt) {
    const info = await page.evaluate(() => {
        document.documentElement.style.scrollBehavior = "auto";
        const cands = [document.scrollingElement || document.documentElement, document.body, ...document.querySelectorAll("body *")];
        let best = null, area = 0;
        for (const el of cands) {
            if (el.scrollHeight - el.clientHeight < 40) continue;
            const root = el === document.scrollingElement || el === document.documentElement;
            if (!root && (el.clientHeight < 150 || el.clientWidth < 200)) continue;
            if (!root && !/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) continue;
            const a = root ? innerWidth * innerHeight : el.clientWidth * el.clientHeight;
            if (a > area) { best = el; area = a; }
        }
        if (!best) return null;
        document.querySelectorAll("[data-ms-scroller]").forEach((e) => e.removeAttribute("data-ms-scroller"));
        best.setAttribute("data-ms-scroller", "1");
        const r = best.getBoundingClientRect();
        return { max: best.scrollHeight - best.clientHeight, vh: best.clientHeight, cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + Math.min(r.height, innerHeight) / 2) };
    }).catch(() => null);
    if (!info || info.max < 40) return [];
    const setTop = (y) => page.evaluate((yy) => { const el = document.querySelector("[data-ms-scroller]") || document.scrollingElement; el.scrollTo({ top: yy, behavior: "instant" }); return el.scrollTop; }, y).catch(() => 0);
    const goTo = async (y) => {
        const got = await setTop(y);
        if (got < y - 8) { await page.mouse.move(info.cx, info.cy); await page.mouse.wheel(0, y - got); await page.waitForTimeout(600); } // smooth-scroll library: real wheel
        await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(350); // lazy images, reveal animations
    };
    const stops = Math.min(8, Math.ceil(info.max / (info.vh * 0.7)) + 1), cands = [];
    for (let k = 1; k < stops; k++) {
        const y = Math.round((info.max * k) / (stops - 1));
        await goTo(y);
        const m = await page.evaluate(MEASURE).catch(() => null);
        if (m) cands.push({ y, m, score: valueOf(m) });
    }
    const pool = cands.filter((c) => c.m.footer < 0.3 && c.score > 0.06).sort((a, b) => b.score - a.score); // never a footer, never empty
    const chosen = [];
    for (const c of pool) {
        if (chosen.length >= sections - 1) break;
        if (chosen.every((o) => Math.abs(o.y - c.y) >= info.vh * 0.6)) chosen.push(c); // distinct sections, not near-duplicates
    }
    const out = [];
    for (const c of chosen) { await goTo(c.y); out.push({ buf: await page.screenshot(fmt), score: c.score }); }
    await setTop(0);
    return out;
}

// One sign-in is kept open between captures (sites with a session limit hate repeated logins).
const sessions = new Map();
async function endSession(id) {
    const s = sessions.get(id);
    if (!s) return false;
    sessions.delete(id); clearTimeout(s.timer);
    let out = false;
    try { if (!s.dead && !s.live.isClosed()) out = await signOut(s.live, s.seeds[0], s.memOnly); } catch { /* ignore */ }
    await s.browser.close().catch(() => {});
    return out;
}
const endAll = () => Promise.all([...sessions.keys()].map(endSession));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await endAll(); process.exit(0); });

// a hosted server has no password, so each address gets a fair share (local mode is unlimited)
const hits = new Map();
const limited = (ip) => {
    const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < 3600000);
    arr.push(now); hits.set(ip, arr);
    if (hits.size > 1000) for (const [k, v] of hits) if (!v.some((t) => now - t < 3600000)) hits.delete(k);
    return arr.length > 40;
};

let busy = 0;
const app = express();
app.set("trust proxy", 1); // behind Render's proxy: real client address
// Only listed origins may call this server from a browser (the Vercel site + local dev). Set ALLOWED_ORIGINS=https://your-app.vercel.app
const ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
// an entry may contain * for one label, e.g. https://mockup-studio-*-your-team.vercel.app (never use https://*.vercel.app)
const originOk = (o) => ORIGINS.some((p) => (p.includes("*") ? new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+") + "$", "i").test(o) : p === o));
app.use((req, res, next) => {
    const o = req.headers.origin;
    if (o) {
        if (!originOk(o)) { console.warn(`[cors] blocked origin ${o}. Add it to ALLOWED_ORIGINS.`); return res.status(403).json({ error: "Origin not allowed" }); }
        res.setHeader("Access-Control-Allow-Origin", o); res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Allow-Private-Network", "true"); // https site -> localhost server
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});
app.use(express.json({ limit: "20kb" }));

app.get("/health", (req, res) => res.json({ ok: true, version: VERSION })); // platform health check

app.post("/api/session/end", async (req, res) => {
    res.json({ signedOut: await endSession(String(req.body?.sessionId || "")) });
});

app.post("/api/capture", async (req, res) => {
    res.setHeader("Content-Type", "application/x-ndjson");
    const send = (o) => res.write(JSON.stringify(o) + "\n");
    if (busy >= 2) { send({ error: "Server busy. Try again in a moment." }); return res.end(); }
    if (!ALLOW_LOCAL && limited(req.ip)) { send({ error: "Too many captures from your address this hour. Try again later." }); return res.end(); }
    busy++;
    let aborted = false; // client pressed Stop or closed the tab
    res.on("close", () => { aborted = true; });

    let browser = null, ctxs = {}, session = null, created = false, failed = true, signedOut = false;
    let seeds = null, state, sess, live = null, liveCtx = null, mode = "fresh", ok = Object.assign(new Map(), { blocked: new Set() }); // blocked: hosts the page tried to load but this server may not reach
    try {
        const { url: rawUrl, login, crawl, maxPages, sessionId, keep, sections } = req.body || {};
        const secBase = Math.min(Math.max(parseInt(sections, 10) || 3, 1), 5);
        const start = await guard(rawUrl);
        console.log(`[capture] ${start.href} crawl=${!!crawl} max=${maxPages} sections=${sections}`);
        const origin = new URL(start.href).origin;
        seeds = [start.href];

        // 1) reuse an open sign-in
        if (sessionId) {
            const s = sessions.get(sessionId);
            if (s && !s.live.isClosed() && new URL(s.seeds[0]).origin === origin) {
                session = s; clearTimeout(s.timer);
                ({ browser, state, sess, live, liveCtx, ok } = s);
                seeds = [norm(start.href), ...s.seeds];
                send({ status: "Using your existing sign-in" });
            } else {
                if (s) await endSession(sessionId);
                send({ session: null });
                if (!login?.password) throw new Fatal("Your sign-in expired. Enter the password again.");
            }
        }

        // 2) otherwise sign in once
        if (!session && login && typeof login.password === "string" && login.password) {
            const email = String(login.email || "").slice(0, 256), password = login.password.slice(0, 256);
            const lu = await guard(login.url || rawUrl);
            if (new URL(lu.href).protocol === "http:" && !lu.priv) throw new Fatal("Refusing to send a password over plain http to a public host.");
            const key = `${new URL(lu.href).origin}|${email}`;
            for (const [id, s] of sessions) if (s.key === key) await endSession(id); // one sign-in per account
            browser ??= await launch();
            send({ status: "Signing in…" });
            const ctx = await newCtx(browser, VIEWS.desktop, undefined, ok);
            const page = await ctx.newPage(); page.setDefaultNavigationTimeout(20000);
            live = page; liveCtx = ctx; // set first so a failed login still gets cleaned up
            await doLogin(page, lu.href, email, password);
            seeds = [norm(page.url()), norm(start.href)];
            state = await ctx.storageState({ indexedDB: true }).catch(() => ctx.storageState()); // cookies + localStorage + IndexedDB
            sess = { origin: new URL(page.url()).origin, data: await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(sessionStorage)))).catch(() => "{}") };
            if (keep) {
                const id = crypto.randomUUID();
                session = { id, key, browser, state, sess, live, liveCtx, seeds, ok, memOnly: false, dead: false, timer: null };
                sessions.set(id, session); created = true;
                send({ session: { id, as: email } });
            }
        }

        browser ??= await launch();
        const ctxOf = async (k) => (ctxs[k] ??= await newCtx(browser, VIEWS[k], state, ok, sess)); // created on first use: saves memory
        const want = crawl ? Math.min(Math.max(parseInt(maxPages, 10) || 50, 1), 100) : 1;
        const book = createRouteBook(PER_ROUTE); seeds.forEach((s) => book.add(s));
        const deadline = Date.now() + Math.min(60000 + want * 40000, 3600000);
        let idx = 0, cdp = null, withScroll = 0, flat = 0;
        const skipped = [];
        let lowValue = 0; // "fresh": new tabs with copied storage | "live": the signed-in tab itself
        const emulate = (v) => cdp.send("Emulation.setDeviceMetricsOverride", { width: v.w, height: v.h, deviceScaleFactor: v.dpr, mobile: !!v.mobile });

        while (idx < want && !aborted && Date.now() < deadline) {
            const target = book.next(); // least-visited kind of page first
            if (!target) break; // only repeats of pages already visited are left
            const path = new URL(target).pathname || "/";
            const fmt = !LITE && idx < 6 ? { type: "png" } : { type: "jpeg", quality: 86 }; // keep memory sane on big crawls
            send({ status: `Capturing ${path}`, progress: { done: idx, total: want } });

            let dp = null, resp = null, own = true;
            try { // one bad page never kills the run
                const openFresh = async () => { dp = await (await ctxOf("desktop")).newPage(); dp.setDefaultNavigationTimeout(20000); resp = await open(dp, target); own = true; };
                const openLive = async () => { cdp ??= await liveCtx.newCDPSession(live); await emulate(VIEWS.desktop); await spaGo(live, target); dp = live; resp = null; own = false; };
                if (mode === "fresh") await openFresh(); else await openLive();

                if (state && (await hasPassword(dp))) {
                    if (mode === "fresh" && idx === 0 && live) { // login not carried over: browse inside the signed-in tab instead
                        await dp.close(); mode = "live";
                        send({ status: "Login is held in page memory. Browsing inside the signed-in tab…" });
                        await openLive();
                    }
                    if (await hasPassword(dp)) {
                        if (idx === 0) { if (session) session.dead = true; throw new Fatal("Signed in, but the site asked for the password again. Its login could not be carried to a new page. Enter the password again."); }
                        send({ status: `Skipped ${path} (asks for sign-in)` }); skipped.push(`${path}: asks for sign-in`);
                        if (own) await dp.close();
                        continue;
                    }
                }
                const bad = await isBad(dp, resp);
                if (bad) { send({ status: `Skipped ${path} (${bad})` }); skipped.push(`${path}: ${bad}`); if (own) await dp.close(); continue; }
                const v0 = valueOf(await dp.evaluate(MEASURE).catch(() => ({ media: 0.3, blocks: 0.5, footer: 0 })));
                if (crawl) for (const l of await links(dp, origin)) book.add(l);
                if (idx > 0 && crawl && v0 < MIN_VALUE) { // mostly text or empty: a poor mockup, but its links were still collected
                    send({ status: `Skipped ${path} (little to show, poor mockup)` }); skipped.push(`${path}: little to show`); lowValue++;
                    if (own) await dp.close();
                    continue;
                }
                const title = (await dp.title().catch(() => "")).trim().slice(0, 80);
                const secN = idx < 12 ? secBase : Math.min(secBase, 2); // keep memory sane on big crawls
                send({ shot: { view: "desktop", page: idx, path, title, section: 0, score: v0, src: img(await dp.screenshot(fmt), fmt.type) } });
                const ex = secN > 1 ? await extraShots(dp, secN, fmt) : [];
                ex.forEach((e, k) => send({ shot: { view: "desktop", page: idx, path, title, section: k + 1, score: e.score, src: img(e.buf, fmt.type) } }));
                if (secN > 1) { if (ex.length) withScroll++; else flat++; }
                if (idx < 3) {
                    const full = Math.min(await dp.evaluate(() => document.documentElement.scrollHeight), 8000);
                    const buf = await dp.screenshot({ ...fmt, fullPage: true, clip: { x: 0, y: 0, width: VIEWS.desktop.w, height: Math.max(full, VIEWS.desktop.h) } });
                    send({ shot: { view: "full", page: idx, path, src: img(buf, fmt.type) } });
                }
                if (own) await dp.close();

                for (const view of idx < 3 ? ["tablet", "mobile"] : ["mobile"]) {
                    const bufs = [];
                    const take = async (pg) => { bufs.push({ buf: await pg.screenshot(fmt) }); if (view === "mobile" && secN > 1) bufs.push(...(await extraShots(pg, secN, fmt))); };
                    if (mode === "live") { await emulate(VIEWS[view]); await live.waitForTimeout(700); await take(live); }
                    else { const p = await (await ctxOf(view)).newPage(); p.setDefaultNavigationTimeout(20000); try { await open(p, target); await take(p); } finally { await p.close().catch(() => {}); } }
                    bufs.forEach((b, k) => send({ shot: { view, page: idx, path, title, section: k, score: b.score, src: img(b.buf, fmt.type) } }));
                }
                if (mode === "live") await emulate(VIEWS.desktop);
                idx++;
            } catch (e) {
                if (e instanceof Fatal) throw e;
                send({ status: `Skipped ${path} (${String(e.message).split("\n")[0].slice(0, 80)})` }); skipped.push(`${path}: ${String(e.message).split("\n")[0].slice(0, 80)}`);
                if (own && dp) await dp.close().catch(() => {});
                if (mode === "live" && cdp) await emulate(VIEWS.desktop).catch(() => {});
            }
        }
        if (idx === 0) { // say exactly why, not just "nothing worked"
            const blk = [...(ok.blocked || [])].slice(0, 3).join(", ");
            throw new Fatal(`No usable pages found. ${skipped.slice(0, 3).join("; ") || "Nothing could be opened."}${blk ? ` The site tried to load data from ${blk}, which this server cannot reach (a local or LAN address). Use a server on your own network, or put that service online.` : ""}`);
        }
        send({ progress: { done: idx, total: idx } });
        send({ note: `${secBase > 1 ? `Scroll sections: ${withScroll} page${withScroll === 1 ? "" : "s"} scrolled, ${flat} fit on one screen. ` : ""}Skipped ${book.repeated()} repeated routes (same page, different id) and ${lowValue} low-value pages.` });

        if (session) { session.memOnly = mode === "live"; send({ keptOpen: true }); } // signed in for the next capture
        else if (live) { // login without "stay signed in": log out once the run is finished
            send({ status: "Signing out…" });
            let out;
            if (mode === "live") out = await signOut(live, seeds[0], true);
            else { const sp = await (await ctxOf("desktop")).newPage(); sp.setDefaultNavigationTimeout(15000); out = await signOut(sp, seeds[0], false); await sp.close().catch(() => {}); }
            signedOut = true; send({ signedOut: out });
        }
        failed = false;
        console.log(`[capture] finished: ${idx} pages`);
        send({ done: true });
    } catch (e) {
        send({ error: String(e.message || e).split("\n")[0] });
    } finally {
        busy--;
        for (const c of Object.values(ctxs)) await c.close().catch(() => {});
        if (session) {
            if (session.dead || (failed && created)) await endSession(session.id); // never leave a half-started sign-in open
            else if (sessions.has(session.id)) session.timer = setTimeout(() => endSession(session.id), IDLE_MS);
        } else if (browser) {
            if (live && state && !signedOut && !live.isClosed()) { try { await signOut(live, seeds[0], mode === "live"); } catch { /* ignore */ } } // failed login run
            await browser.close().catch(() => {});
        }
        res.end();
    }
});

process.on("unhandledRejection", (e) => console.error("[unhandled]", e)); // one bad request must not take the server down
process.on("uncaughtException", (e) => console.error("[uncaught]", e));

app.listen(PORT, HOST, () =>
    console.log(`Capture server :${PORT}  local-dev mode: ${ALLOW_LOCAL ? "ON" : "off"}`));
