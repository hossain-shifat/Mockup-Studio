// Auto-art-director. Rule one: a mockup shows ONE page at ONE moment, and every device in it shows that
// same moment (the desktop, tablet and phone view of the same section), exactly as a real responsive site would.
// Palette from the site's own screenshot + hand-built layout recipes + bounding-box fitting.
import { DEVICES } from "./render";

let n = 100000;
const hsl = (h, s, l) => {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l), f = (x) => { const k = (x + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return "#" + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
};
const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

const palCache = new Map();
async function palette(src, key) {
    if (key && palCache.has(key)) return palCache.get(key);
    const r = await palette0(src); if (key) palCache.set(key, r); return r;
}
async function palette0(src) {
    const img = src && (await loadImg(src));
    if (!img) return { h: 225, light: false, colorful: false };
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, img.naturalWidth, Math.min(img.naturalHeight, img.naturalWidth * 0.62), 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data;
    let L = 0, x = 0, y = 0, ws = 0;
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, dl = mx - mn;
        L += l;
        if (dl < 0.12 || l < 0.15 || l > 0.9) continue; // ignore greys, near-black, near-white
        const h = ((mx === r ? ((gg - b) / dl) % 6 : mx === gg ? (b - r) / dl + 2 : (r - gg) / dl + 4) * Math.PI) / 3;
        x += Math.cos(h) * dl; y += Math.sin(h) * dl; ws += dl;
    }
    return { h: ws > 2 ? ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 : 225, light: L / 1024 > 0.62, colorful: ws > 8 };
}

const palettes = (p) => ({
    ink: { a: hsl(p.h, 16, 13), b: hsl(p.h, 18, 9) },
    slate: { a: hsl(p.h, 16, 24), b: hsl(p.h, 18, 18) },
    deep: { a: hsl(p.h, 32, 27), b: hsl(p.h, 34, 20) },
    clay: { a: hsl(p.h, p.colorful ? 30 : 10, 54), b: hsl(p.h, p.colorful ? 32 : 10, 46) },
    bone: { a: hsl(p.h, 18, 91), b: hsl(p.h, 16, 85) },
    stone: { a: hsl(p.h, 10, 79), b: hsl(p.h, 10, 72) },
    navy: { a: hsl(222, 34, 16), b: hsl(224, 38, 10) },
    forest: { a: hsl(155, 22, 16), b: hsl(158, 26, 10) },
    plum: { a: hsl(285, 18, 17), b: hsl(288, 22, 11) },
    sand: { a: hsl(36, 28, 86), b: hsl(34, 26, 79) },
    mist: { a: hsl(210, 22, 92), b: hsl(212, 20, 85) },
});


// layer: [device, x, y, scale, rotZ, rotX, rotY] authored on a 1600×1000 plane. The screenshot view comes from the device itself.
// m = margin (negative = deliberate bleed), dy = vertical shift as fraction of height.
// kind: "single" (one device), "responsive" (different devices, same page, same moment) or
//       "flow" (several screens of the SAME device: shows different moments of one page, off unless asked for).
const LIGHT = "#f4f3f1", SILVER = "#cfcdc8", TITAN = "#9a968e", WIDE = [1600, 1000];
const R = [
    // ── one device
    { name: "Cropped hero", size: WIDE, bgs: ["ink", "deep", "slate"], m: -0.04, dy: 0.12, max: 1.7, shadow: 0.6, layers: [["laptop", 800, 500, 1, 0, 6, -10]] },
    { name: "Straight on", cap: "tl", size: WIDE, bgs: ["bone", "stone", "ink"], m: 0.12, shadow: 0.3, frame: LIGHT, layers: [["browser", 800, 500, 1]] },
    { name: "Tilted laptop", cap: "bc", size: WIDE, bgs: ["slate", "bone", "deep"], m: 0.1, frame: SILVER, layers: [["laptop", 800, 500, 1, -5, 4, 14]] },
    { name: "Phone hero", size: WIDE, bgs: ["ink", "clay", "deep"], m: -0.1, dy: 0.18, max: 1.7, frame: TITAN, layers: [["phone", 800, 500, 1.2]] },
    { name: "Tablet hero", size: WIDE, bgs: ["deep", "bone", "ink"], m: 0.1, frame: TITAN, layers: [["tablet", 800, 500, 1.2, -4, 0, -8]] },
    { name: "Hero panel", cap: "bc", size: WIDE, bgs: ["ink", "deep", "clay"], m: 0.08, shadow: 0.6, layers: [["panel", 800, 500, 1, 0, 6, -8]] },
    // ── responsive: the same page on different devices
    { name: "Laptop + phone", cap: "tl", align: "bottom", size: WIDE, bgs: ["slate", "clay", "ink"], m: 0.1, layers: [["laptop", 700, 500, 1], ["phone", 1190, 590, 0.9]] },
    { name: "Window + phone", align: "bottom", size: WIDE, bgs: ["deep", "bone", "slate"], m: 0.02, frame: LIGHT, layers: [["browser", 620, 430, 1], ["phone", 1180, 640, 0.95]] },
    { name: "Tablet + phone", align: "bottom", size: WIDE, bgs: ["stone", "ink", "deep"], m: 0.1, layers: [["tablet", 640, 520, 1], ["phone", 1050, 610, 0.9]] },
    { name: "Desktop + tablet", cap: "tl", align: "bottom", size: WIDE, bgs: ["stone", "ink", "deep"], m: 0.09, frame: SILVER, layers: [["browser", 560, 500, 1], ["tablet", 1180, 540, 0.9, 4]] },
    { name: "Laptop + tablet", align: "bottom", size: WIDE, bgs: ["stone", "slate", "deep"], m: 0.09, frame: SILVER, layers: [["laptop", 700, 500, 1], ["tablet", 1250, 560, 0.9, 5]] },
    { name: "Panel + phone", cap: "tl", align: "bottom", size: WIDE, bgs: ["deep", "bone", "slate"], m: 0.08, layers: [["panel", 640, 500, 1.05], ["phone", 1230, 560, 0.95]] },
    { name: "Split screen", align: "bottom", size: WIDE, bgs: ["bone", "deep", "stone"], m: -0.04, layers: [["panel", 560, 520, 1.3], ["phone", 1260, 540, 1]] },
    { name: "Every screen", cap: "tl", align: "bottom", size: WIDE, bgs: ["slate", "ink", "deep"], m: 0.08, frame: SILVER, layers: [["laptop", 640, 500, 1], ["tablet", 1090, 560, 0.85], ["phone", 1360, 600, 0.8]] },
    { name: "Social square", cap: "tl", size: [1080, 1080], bgs: ["bone", "deep", "clay"], m: 0.04, layers: [["browser", 430, 400, 0.85], ["phone", 700, 640, 1]] },
    // ── flow: several screens of one device (different moments of the same page)
    { kind: "flow", name: "Phone duo", size: WIDE, bgs: ["bone", "stone", "slate"], m: 0.1, shadow: 0.4, layers: [["phone", 700, 520, 1, -5], ["phone", 960, 500, 1, 5]] },
    { kind: "flow", name: "Phone trio", size: WIDE, bgs: ["clay", "ink", "stone"], m: 0.1, layers: [["phone", 480, 560, 0.95], ["phone", 800, 470, 0.95], ["phone", 1120, 560, 0.95]] },
    { kind: "flow", name: "Four phones", size: WIDE, bgs: ["clay", "ink", "stone"], m: 0.08, layers: [["phone", 360, 540, 0.85], ["phone", 640, 470, 0.85], ["phone", 920, 540, 0.85], ["phone", 1200, 470, 0.85]] },
    { kind: "flow", name: "Phone staircase", size: WIDE, bgs: ["clay", "ink", "stone"], m: 0.08, layers: [["phone", 400, 700, 0.8], ["phone", 670, 610, 0.8], ["phone", 940, 520, 0.8], ["phone", 1210, 430, 0.8]] },
    { kind: "flow", name: "Browser cascade", size: WIDE, bgs: ["ink", "bone", "slate"], m: 0.09, layers: [["browser", 600, 400, 0.82], ["browser", 860, 570, 0.92]] },
    { kind: "flow", name: "Mirror laptops", size: WIDE, bgs: ["slate", "clay", "bone"], m: 0.08, frame: SILVER, layers: [["laptop", 520, 520, 0.85, 0, 0, 18], ["laptop", 1080, 520, 0.85, 0, 0, -18]] },
    { kind: "flow", name: "Gallery wall", cap: "tl", size: WIDE, bgs: ["bone", "stone", "ink"], m: 0.06, shadow: 0.35, layers: [["panel", 400, 360, 0.5], ["panel", 880, 360, 0.5], ["panel", 1360, 360, 0.5], ["panel", 400, 660, 0.5], ["panel", 880, 660, 0.5], ["panel", 1360, 660, 0.5]] },
].map((t) => ({ ...t, kind: t.kind || (t.layers.length === 1 ? "single" : "responsive") }));
export const TEMPLATE_KINDS = R.reduce((a, t) => ((a[t.kind] = (a[t.kind] || 0) + 1), a), {});

// one calm, professional backdrop family: soft studio tones from the site, plus a few curated pairs. No loud random blocks.
const STYLES = ["plain", "mesh", "stage"];
const CURATED = [
    { a: "#2b4bd6", b: "#2646c8", c2: "#e9edfb" }, { a: "#d9d4ca", b: "#cdc7bb", c2: "#f4f1ea" },
    { a: "#1d1e22", b: "#16171a", c2: "#e8dcc8" }, { a: "#14213d", b: "#101a31", c2: "#e8edf6" },
    { a: "#c5d9ea", b: "#b6cde2", c2: "#f1f6fb" }, { a: "#e9e2d4", b: "#ddd5c4", c2: "#faf7f1" },
];
const FRAMES_ON_DARK = ["#d9d7d2", "#8f8a82", "#c8b8a2", "#26272c"], FRAMES_ON_LIGHT = ["#26272c", "#2c3a52", "#8f8a82", "#d9d7d2"];
const SHAPES = ["circle", "arch"];
const pretty = (p) => { const t = p === "/" ? "Home" : p.split("/").filter(Boolean).pop().replace(/[-_]+/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const lum = (h) => { const v = parseInt(h.slice(1), 16); return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; };
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";

// centre the group, keep a safe margin, never clip, cap upscaling
function fitGroup(L, W, H, m, max, dy = 0, avail = 1) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const l of L) {
        const { w, h } = DEVICES[l.device], a = (l.rotZ * Math.PI) / 180;
        const bw = ((Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) * l.scale) / 2;
        const bh = ((Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) * l.scale) / 2;
        x0 = Math.min(x0, l.x - bw); x1 = Math.max(x1, l.x + bw); y0 = Math.min(y0, l.y - bh); y1 = Math.max(y1, l.y + bh);
    }
    const s = Math.min(((1 - 2 * m) * W) / (x1 - x0), ((1 - 2 * m) * H * avail) / (y1 - y0), max), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (const l of L) { l.x = Math.round(W / 2 + (l.x - cx) * s); l.y = Math.round(H * (0.5 + dy) + (l.y - cy) * s); l.scale = +(l.scale * s).toFixed(3); }
}

// ── honest, designed copy: the site's own name and a short headline by page role, never an address
const COPY = {
    home: ["Everything in one place", "Your world, beautifully organised", "Start here, go anywhere"],
    live: ["Live, without the wait", "Every channel, one tap away", "Always on, always ready"],
    player: ["Press play. Everything else fades.", "Made for watching", "Distraction-free playback"],
    detail: ["Every story, up close", "Details that draw you in", "Know before you press play"],
    browse: ["A library worth browsing", "Find your next favourite", "Browse at the speed of thought"],
    series: ["Binge, beautifully", "Season after season", "Every episode within reach"],
    search: ["Find anything, fast", "Search that keeps up", "Ask once, find it"],
    data: ["Numbers that make sense", "Insight at a glance", "Clarity in every chart"],
    account: ["Yours to customise", "Settings that stay out of the way", "Make it yours"],
    other: ["Crafted with care", "Simple by design", "Built for focus", "Clarity in every detail"],
};
const ROLE_NAME = { player: "Now playing", detail: "Details", live: "Live", series: "Series", home: "Home" };
const roleOf = (label) => {
    const p = label.toLowerCase(), segs = p.split("/").filter(Boolean);
    if (!segs.length || /^(home|index)$/.test(segs[0])) return "home";
    if (/player|watch|stream|video|playback/.test(p)) return "player";
    if (/live|channel|\btv\b/.test(p)) return "live";
    if (/series|show|episode|season/.test(p)) return "series";
    if (/search|find/.test(p)) return "search";
    if (/dashboard|analytics|stats|report|chart|overview|insight/.test(p)) return "data";
    if (/setting|profile|account|preference|privacy|folders|services/.test(p)) return "account";
    if (/^(media|movie|film|title|item|product|post|article|detail)/.test(segs[0]) && segs.length > 1) return "detail";
    if (/movie|film|library|browse|category|genre|explore|discover|catalog|shop|collection|watchlist|favou?rite/.test(p)) return "browse";
    return "other";
};
const idLike = (t) => /^\d+$/.test(t) || (/[A-Z]/.test(t) && /[a-z]/.test(t) && t.length >= 12) || /^[0-9a-f-]{12,}$/i.test(t) || (t.length >= 8 && /\d/.test(t) && /[a-z]/i.test(t));
const okBrand = (b) => !!b && b.length <= 28 && !/localhost|ngrok|\.local\b|^\d{1,3}(\.\d{1,3}){3}/i.test(b);
const cleanTitle = (t) => (t || "").split(/\s[|\u2013\u2014-]\s/)[0].trim();
const lastTitlePart = (t) => { const parts = (t || "").split(/\s[|\u2013\u2014-]\s/); return parts[parts.length - 1].trim(); };
const realHost = (h) => !!h && !/localhost|ngrok|\.local$|^\d{1,3}(\.\d{1,3}){3}$/i.test(h) && h.includes(".");
const momentName = (pos) => (pos < 0.06 ? "Top of page" : `${Math.round(pos * 100)}% down the page`);

const TOL = 0.2; // two screenshots show "the same moment" when they sit within 20% of the page height of each other

// Group screenshots into pages. Each view keeps a list of { key, pos } sorted top to bottom. Flawed shots (broken pictures,
// half-loaded, empty states) never enter a mockup.
function collect(shots) {
    const pages = new Map(), dropped = [];
    for (const s of shots) {
        if (s.flaw) { dropped.push(`${s.label.split(" \u00b7 ")[0]} (${s.view}): ${s.flaw}`); continue; }
        const k = s.page ?? s.key;
        if (!pages.has(k)) pages.set(k, { views: {}, label: s.label.split(" \u00b7 ")[0], title: "", brand: "", h1: "", host: "" });
        const p = pages.get(k);
        (p.views[s.view] ??= []).push({ key: s.key, pos: s.pos ?? 0 });
        if (s.title && !p.title) p.title = s.title;
        if (s.brand && !p.brand) p.brand = s.brand;
        if (s.h1 && !p.h1) p.h1 = s.h1;
        if (s.host && !p.host) p.host = s.host;
    }
    for (const p of pages.values()) for (const v of Object.values(p.views)) v.sort((a, b) => a.pos - b.pos);
    return { pages: [...pages.entries()], dropped };
}
// nearest screenshot of a view to a moment, or null when that device has nothing close enough
const near = (list, pos) => { let best = null; for (const e of list || []) if (Math.abs(e.pos - pos) <= TOL && (!best || Math.abs(e.pos - pos) < Math.abs(best.pos - pos))) best = e; return best; };

// How many routes (pages) feed each template. 1 = every template gets its own route, so the set has variety;
// 2 = two routes per template; 0 = every route in every template (can be hundreds).
export async function generate(shots, seed = 0, opts = {}) {
    const flow = !!opts.flow, per = opts.per ?? 1, skipped = [];
    const { pages: entries, dropped } = collect(shots);
    if (dropped.length) skipped.push(`${dropped.length} screenshot${dropped.length === 1 ? "" : "s"} left out as not mockup-ready: ${[...new Set(dropped)].slice(0, 4).join("; ")}${dropped.length > 4 ? "…" : ""}`);
    const sameTitle = entries.length > 1 && new Set(entries.map(([, v]) => v.title)).size <= 1;
    const siteBrand = entries.map(([, v]) => (okBrand(v.brand) ? v.brand : okBrand(lastTitlePart(v.title)) ? lastTitlePart(v.title) : "")).find(Boolean) || "";

    const first = (v) => (v.desktop ?? Object.values(v)[0] ?? [])[0];
    const byKey = new Map(shots.map((s) => [s.key, s]));
    const pals = await Promise.all(entries.map(([, p]) => { const f = first(p.views); return palette(byKey.get(f?.key)?.src, f?.key); }));

    // facts about each route, computed once
    const P = entries.map(([pk, info], si) => {
        const role = roleOf(info.label), last = info.label.split("/").filter(Boolean).pop() || "";
        const pageName = info.h1 || (!sameTitle && info.title ? cleanTitle(info.title) : idLike(last) ? ROLE_NAME[role] || "Details" : pretty(info.label));
        const base = info.views.desktop || Object.values(info.views).find((v) => v.length) || [];
        const path = info.label.startsWith("/") ? info.label : "";
        const sc = Object.values(info.views).flat().map((e) => byKey.get(e.key)?.score).filter((x) => x != null);
        return {
            pk, info, si, pal: palettes(pals[si]), h: pals[si].h, role, pageName, upload: !!info.views.upload, moments: [...new Set(base.map((e) => e.pos))],
            addr: realHost(info.host) ? `${info.host}${path && path !== "/" ? path : ""}` : siteBrand || pageName, score: sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : 0,
        };
    }).filter((p) => p.moments.length);
    const use = P.map(() => 0), momUse = P.map(() => new Map());
    const out = []; let ti = 0;

    const build = (r, ri, e) => {
        const { p, ok } = e, { info, si, pal, h, role, pageName, upload, addr, pk } = p;
        // pick the moment of this page that has been used least so far (so one route does not always show its top screen)
        let picks;
        if (r.kind === "flow") { // same device several times: needs that many different clean moments, no repeats
            const rot = (ri + seed) % ok.length, seq = [...ok.slice(rot), ...ok.slice(0, rot)].slice(0, r.layers.length).sort((a, b) => a - b);
            picks = r.layers.map((_, j) => seq[j]);
        } else {
            const mu = momUse[e.i], pool = [...ok].sort((a, b) => (mu.get(a) || 0) - (mu.get(b) || 0) || a - b), m = pool[(seed > 0 ? seed : 0) % Math.max(1, pool.filter((x) => (mu.get(x) || 0) === (mu.get(pool[0]) || 0)).length)];
            picks = r.layers.map(() => m);
        }
        picks.forEach((m) => momUse[e.i].set(m, (momUse[e.i].get(m) || 0) + 1));
        const keyOf = (v, pos) => (upload ? info.views.upload[0].key : near(info.views[v], pos).key);
        const pick0 = picks[0];

        let c, c2, style;
        const roll = (seed + si + ri) % 3, compact = r.layers.length <= 2 && r.kind !== "flow";
        if (roll !== 0) { // designed pair, calm and consistent
            const cu = CURATED[(seed + si + ri) % CURATED.length];
            c = cu; c2 = cu.c2; style = compact && r.size[0] > r.size[1] && roll === 1 ? SHAPES[(seed + si + ri) % SHAPES.length] : STYLES[(seed + si + ri) % STYLES.length];
        } else { // studio tones drawn from the site itself
            const dark = lum(pal[r.bgs[0]].a) < 0.5, keys = [...r.bgs, ...(dark ? ["navy", "forest", "plum"] : ["sand", "mist"])];
            c = pal[keys[(seed + si + ri) % keys.length]]; style = STYLES[(seed + si * 3 + ri) % STYLES.length];
            c2 = lum(c.a) < 0.5 ? hsl(h + 20, 38, 32) : hsl(h + 20, 40, 74);
        }
        const shape = SHAPES.includes(style);
        const pool = lum(c.a) < 0.5 ? FRAMES_ON_DARK : FRAMES_ON_LIGHT, frame = r.frame ?? pool[(seed + si + ri) % pool.length];
        const layers = r.layers.map(([device, x, y, scale, rotZ = 0, rotX = 0, rotY = 0], j) => ({
            id: n++, device, shot: keyOf(DEVICES[device].view, picks[j]), x, y, scale, rotX, rotY, rotZ, blur: 0, depth: 0.18, radius: 1, frame, shadow: r.shadow ?? 0.5, url: addr,
        }));
        if (r.align === "bottom") { // shared baseline: devices sit on the same line
            const bot = Math.max(...layers.map((l) => l.y + (DEVICES[l.device].h * l.scale) / 2));
            layers.forEach((l) => { l.y = bot - (DEVICES[l.device].h * l.scale) / 2; });
        }
        // captions get their own band: devices are fitted into the rest, so text never sits on a device
        const dy = (r.dy ?? 0) + (r.cap === "tl" ? 0.095 : r.cap === "bc" ? -0.075 : 0), avail = r.cap === "tl" ? 0.75 : r.cap === "bc" ? 0.79 : 1;
        fitGroup(layers, r.size[0], r.size[1], r.m, r.max ?? 1.6, dy, avail);
        const eyebrow = siteBrand || "Interface design", lines = COPY[role];
        out.push({
            id: `${pk}|${r.name}|${pick0}`, pageIndex: si, pageLabel: info.label, name: r.name, kind: r.kind, moment: momentName(pick0), pageKey: pk,
            file: `p${String(si + 1).padStart(2, "0")}-${slug(info.label === "/" ? "home" : info.label)}-${slug(r.name)}${pick0 ? `-${Math.round(pick0 * 100)}` : ""}`,
            doc: {
                size: { w: r.size[0], h: r.size[1] },
                bg: { type: "gradient", a: c.a, b: c.b, angle: 165, glow: false, spot: !shape, vig: !shape, grain: true, style, c2, hl: hsl(h, 50, lum(c.a) < 0.5 ? 45 : 75) },
                layers,
                caption: r.cap ? { pos: r.cap, eyebrow, title: lines[(si + ri) % lines.length], meta: pageName.toLowerCase() === eyebrow.toLowerCase() ? "" : pageName } : null,
            },
        });
    };

    for (const r of R) {
        if (r.kind === "flow" && !flow) continue;
        const ri = ti++; // stable per template, so a seed change reshuffles routes and colours, not the template list
        const views = r.layers.map(([d]) => DEVICES[d].view);
        // routes that can fill this template: EVERY device in it needs a matching screenshot of that same route
        const elig = P.map((p, i) => ({ p, i, ok: p.upload ? p.moments : p.moments.filter((m) => views.every((v) => near(p.info.views[v], m))) }))
            .filter((e) => (r.kind === "flow" ? e.ok.length >= r.layers.length : e.ok.length > 0));
        if (!elig.length) continue; // e.g. a phone template when no route has a phone view: skipped, never faked with a desktop shot
        const rot = (e) => (((e.i - ri - seed) % P.length) + P.length) % P.length;
        // each template takes the least-used routes first, so routes are spread across templates instead of every route filling every template.
        // Single-device hero shots prefer the richest routes.
        elig.sort((a, b) => use[a.i] - use[b.i] || (r.kind === "single" && seed === 0 ? b.p.score - a.p.score : 0) || rot(a) - rot(b));
        const chosen = per === 0 ? elig : elig.slice(0, per);
        for (const e of chosen) { use[e.i]++; build(r, ri, e); }
    }
    return { items: out, skipped };
}
