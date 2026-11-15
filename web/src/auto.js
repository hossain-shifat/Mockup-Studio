// Auto-art-director: palette from the site's own screenshot + hand-built layout
// recipes + bounding-box fitting. No manual placement needed.
import { DEVICES } from "./render";

let n = 100000;
const hsl = (h, s, l) => {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l), f = (x) => { const k = (x + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return "#" + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
};
const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

async function palette(src) {
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

// layer: [device, shotView, x, y, scale, rotZ, rotX, rotY] authored on a 1600×1000 plane.
// m = margin (negative = deliberate bleed), dy = vertical shift as fraction of height.
const LIGHT = "#f4f3f1", SILVER = "#cfcdc8", TITAN = "#9a968e", WIDE = [1600, 1000];
const R = [
    { name: "Cropped hero", cap: "tl", size: WIDE, bgs: ["ink", "deep", "slate"], m: -0.04, dy: 0.12, max: 1.7, shadow: 0.6, layers: [["laptop", "desktop", 800, 500, 1, 0, 6, -10]] },
    { name: "Straight on", cap: "tl", size: WIDE, bgs: ["bone", "stone", "ink"], m: 0.12, shadow: 0.3, frame: LIGHT, layers: [["browser", "desktop", 800, 500, 1]] },
    { name: "Laptop + phone", cap: "tl", align: "bottom", size: WIDE, bgs: ["slate", "clay", "ink"], m: 0.1, layers: [["laptop", "desktop", 700, 500, 1], ["phone", "mobile", 1190, 590, 0.9]] },
    { name: "Phone trio", size: WIDE, bgs: ["clay", "ink", "stone"], m: 0.1, layers: [["phone", "mobile", 480, 560, 0.95], ["phone", "mobile+1", 800, 470, 0.95], ["phone", "mobile+2", 1120, 560, 0.95]] },
    { name: "Window + phone", align: "bottom", size: WIDE, bgs: ["deep", "bone", "slate"], m: 0.02, frame: LIGHT, layers: [["browser", "desktop", 620, 430, 1], ["phone", "mobile", 1180, 640, 0.95]] },
    { name: "Tablet + phone", align: "bottom", size: WIDE, bgs: ["stone", "ink", "deep"], m: 0.1, layers: [["tablet", "tablet", 640, 520, 1], ["phone", "mobile", 1050, 610, 0.9]] },
    { name: "Cascade", size: WIDE, bgs: ["ink", "bone", "slate"], m: 0.09, layers: [["browser", "full", 600, 400, 0.82, 0, 0, 0, 1.4], ["browser", "desktop+1", 860, 570, 0.92]] },
    { name: "Social square", cap: "tl", size: [1080, 1080], bgs: ["bone", "deep", "clay"], m: 0.04, layers: [["browser", "desktop", 430, 400, 0.85], ["phone", "mobile", 700, 640, 1]] },
    { name: "Tilted laptop", cap: "bc", size: WIDE, bgs: ["slate", "bone", "deep"], m: 0.1, dy: -0.02, frame: SILVER, layers: [["laptop", "desktop", 800, 500, 1, -5, 4, 14]] },
    { name: "Phone hero", cap: "tl", size: WIDE, bgs: ["ink", "clay", "deep"], m: -0.1, dy: 0.18, max: 1.7, frame: TITAN, layers: [["phone", "mobile", 800, 500, 1.2, 0, 0, 0]] },
    { name: "Phone duo", size: WIDE, bgs: ["bone", "stone", "slate"], m: 0.1, shadow: 0.4, layers: [["phone", "mobile", 700, 520, 1, -5], ["phone", "mobile+1", 960, 500, 1, 5]] },
    { name: "Desktop + tablet", cap: "tl", align: "bottom", size: WIDE, bgs: ["stone", "ink", "deep"], m: 0.09, frame: SILVER, layers: [["browser", "desktop", 560, 500, 1], ["tablet", "tablet", 1180, 540, 0.9, 4]] },
    { name: "Light cascade", cap: "tl", size: WIDE, bgs: ["bone", "stone", "clay"], m: 0.09, shadow: 0.35, frame: LIGHT, layers: [["browser", "desktop", 700, 430, 0.9], ["browser", "desktop+1", 900, 570, 0.9]] },
    { name: "Four phones", size: WIDE, bgs: ["clay", "ink", "stone"], m: 0.08, layers: [["phone", "mobile", 360, 540, 0.85], ["phone", "mobile+1", 640, 470, 0.85], ["phone", "mobile+2", 920, 540, 0.85], ["phone", "mobile+3", 1200, 470, 0.85]] },
    { name: "Tablet hero", size: WIDE, bgs: ["deep", "bone", "ink"], m: 0.1, frame: TITAN, layers: [["tablet", "tablet", 800, 500, 1.2, -4, 0, -8]] },
    { name: "Perspective stack", cap: "tl", size: WIDE, bgs: ["ink", "deep", "slate"], m: 0.08, frame: LIGHT, layers: [["browser", "desktop+2", 520, 360, 0.72, 0, 8, -20, 1.8], ["browser", "desktop+1", 760, 470, 0.82, 0, 8, -20, 0.9], ["browser", "desktop", 1020, 600, 0.92, 0, 8, -20]] },
    { name: "Mirror laptops", size: WIDE, bgs: ["slate", "clay", "bone"], m: 0.08, frame: SILVER, layers: [["laptop", "desktop", 520, 520, 0.85, 0, 0, 18], ["laptop", "desktop+1", 1080, 520, 0.85, 0, 0, -18]] },
    { name: "Phone fan", size: WIDE, bgs: ["clay", "ink", "stone"], m: 0.1, layers: [["phone", "mobile+1", 560, 580, 0.9, -12, 0, 0, 1.2], ["phone", "mobile+2", 1040, 580, 0.9, 12, 0, 0, 1.2], ["phone", "mobile", 800, 520, 1]] },
    { name: "Gallery wall", cap: "tl", size: WIDE, bgs: ["bone", "stone", "ink"], m: 0.06, shadow: 0.35, layers: [["panel", "desktop", 400, 360, 0.5], ["panel", "desktop+1", 880, 360, 0.5], ["panel", "desktop+2", 1360, 360, 0.5], ["panel", "desktop+3", 400, 660, 0.5], ["panel", "desktop+4", 880, 660, 0.5], ["panel", "desktop+5", 1360, 660, 0.5]] },
    { name: "Panel + phone", cap: "tl", size: WIDE, bgs: ["deep", "bone", "slate"], m: 0.08, align: "bottom", layers: [["panel", "desktop", 640, 500, 1.05], ["phone", "mobile", 1230, 560, 0.95]] },
    { name: "Floating cards", size: WIDE, bgs: ["ink", "slate", "bone"], m: 0.06, layers: [["laptop", "desktop", 800, 520, 1], ["panel", "desktop+1", 330, 320, 0.55, -6, 0, 0, 1.4], ["panel", "desktop+2", 1290, 700, 0.55, 5, 0, 0, 1.4]] },
    { name: "Phone staircase", size: WIDE, bgs: ["clay", "ink", "stone"], m: 0.08, layers: [["phone", "mobile", 400, 700, 0.8, 0, 0, 0, 1.6], ["phone", "mobile+1", 670, 610, 0.8, 0, 0, 0, 0.8], ["phone", "mobile+2", 940, 520, 0.8], ["phone", "mobile+3", 1210, 430, 0.8]] },
    { name: "Split screen", size: WIDE, bgs: ["bone", "deep", "stone"], m: -0.04, align: "bottom", layers: [["panel", "desktop", 560, 520, 1.3], ["phone", "mobile", 1260, 540, 1]] },
    { name: "Laptop + tablet", size: WIDE, bgs: ["stone", "slate", "deep"], m: 0.09, align: "bottom", frame: SILVER, layers: [["laptop", "desktop", 700, 500, 1], ["tablet", "tablet", 1250, 560, 0.9, 5]] },
    { name: "Hero panel", cap: "bc", size: WIDE, bgs: ["ink", "deep", "clay"], m: 0.08, shadow: 0.6, layers: [["panel", "desktop", 800, 500, 1, 0, 6, -8]] },
];
const STYLES = ["plain", "mesh", "stage", "grid", "beam"];
// designer-picked colour pairs: a bold flat base + one contrasting block colour
const CURATED = [
    { a: "#2b4bd6", b: "#2646c8", c2: "#f1d3da" }, { a: "#d4673f", b: "#c95f38", c2: "#f3e6d6" },
    { a: "#c9d8c5", b: "#bccdb7", c2: "#23352a" }, { a: "#efe2b8", b: "#e6d6a6", c2: "#26241f" },
    { a: "#cfc4e3", b: "#c2b5da", c2: "#312a4a" }, { a: "#1d1e22", b: "#16171a", c2: "#e8dcc8" },
    { a: "#c5d9ea", b: "#b6cde2", c2: "#162a4a" }, { a: "#eccdc6", b: "#e4bfb7", c2: "#5a2230" },
    { a: "#59603a", b: "#4f5634", c2: "#e9e4cf" }, { a: "#14213d", b: "#101a31", c2: "#e5a13a" },
    { a: "#efe9dd", b: "#e6dfd0", c2: "#1a1a1a" },
];
const FRAMES_ON_DARK = ["#d9d7d2", "#8f8a82", "#c8b8a2", "#26272c", "#2c3a52"], FRAMES_ON_LIGHT = ["#26272c", "#2c3a52", "#8f8a82", "#d9d7d2"]; // device finishes: silver, natural, desert, graphite, blue
const BOLD = ["circle", "split", "band", "arch", "plain"];
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

export async function generate(shots, seed = 0) {
    // every captured page x every template; each template shows a different scroll section
    const pages = new Map();
    for (const s of shots) {
        const k = s.page ?? s.key;
        if (!pages.has(k)) pages.set(k, { views: {}, label: s.label.split(" \u00b7 ")[0], title: "", host: "" });
        const p = pages.get(k);
        (p.views[s.view] ??= [])[s.sec ?? 0] = s.key;
        if (s.title && !p.title) p.title = s.title;
        if (s.host) p.host = s.host;
    }
    const entries = [...pages.entries()], sets = entries.map(([, v]) => v.views), any = shots[shots.length - 1]?.key;
    const sameTitle = entries.length > 1 && new Set(entries.map(([, v]) => v.title)).size <= 1;
    const pick = (si, token, sec) => {
        const [v, o] = token.split("+"), off = +o || 0, set = sets[(si + off) % sets.length];
        const arr = off && sets.length === 1 ? set.full ?? set[v] : set[v] ?? set.desktop ?? Object.values(set)[0];
        const list = (arr || []).filter(Boolean);
        return list.length ? list[sec % list.length] : any;
    };
    const first = (v) => (v.desktop ?? Object.values(v)[0] ?? [])[0];
    const pals = await Promise.all(sets.map((v) => palette(shots.find((s) => s.key === first(v))?.src)));
    const out = [];
    entries.forEach(([pk, info], si) => {
        const pal = palettes(pals[si]), h = pals[si].h;
        R.forEach((r, ri) => {
            let c, c2, style;
            if ((seed + si + ri) % 3 !== 0) { // two thirds: bold flat colour blocking
                const cu = CURATED[(seed + si * 2 + ri) % CURATED.length];
                c = cu; c2 = cu.c2; style = BOLD[(seed + si + ri * 2) % BOLD.length];
            } else { // one third: studio tones drawn from the site itself
                const dark = lum(pal[r.bgs[0]].a) < 0.5, keys = [...r.bgs, ...(dark ? ["navy", "forest", "plum"] : ["sand", "mist"])];
                c = pal[keys[(seed + si + ri) % keys.length]]; style = STYLES[(seed + si * 3 + ri) % STYLES.length];
                c2 = lum(c.a) < 0.5 ? hsl(h + 20, 38, 32) : hsl(h + 20, 40, 74);
            }
            const shape = ["circle", "split", "band", "arch"].includes(style);
            const pool = lum(c.a) < 0.5 ? FRAMES_ON_DARK : FRAMES_ON_LIGHT, frame = r.frame ?? pool[(seed + si + ri) % pool.length];
            const layers = r.layers.map(([device, view, x, y, scale, rotZ = 0, rotX = 0, rotY = 0, blur = 0], j) => ({
                id: n++, device, shot: pick(si, view, ri + j), x, y, scale, rotX, rotY, rotZ, blur, depth: 0.18, radius: 1, frame, shadow: r.shadow ?? 0.5, url: info.host ? info.host + (info.label === "/" ? "" : info.label) : "",
            }));
            if (r.align === "bottom") { // shared baseline: devices sit on the same line
                const bot = Math.max(...layers.map((l) => l.y + (DEVICES[l.device].h * l.scale) / 2));
                layers.forEach((l) => { l.y = bot - (DEVICES[l.device].h * l.scale) / 2; });
            }
            fitGroup(layers, r.size[0], r.size[1], r.m, r.max ?? 1.6, (r.dy ?? 0) + (r.cap === "tl" ? 0.06 : r.cap === "bc" ? -0.06 : 0), r.cap ? 0.88 : 1);
            const name = pretty(info.label), title = sameTitle || !info.title ? name : info.title.split(/\s[|\u2013\u2014-]\s/)[0].trim();
            out.push({
                id: `${pk}|${r.name}`, pageIndex: si, pageLabel: info.label, name: r.name,
                file: `p${String(si + 1).padStart(2, "0")}-${slug(info.label === "/" ? "home" : info.label)}-${slug(r.name)}`,
                doc: {
                    size: { w: r.size[0], h: r.size[1] },
                    bg: { type: "gradient", a: c.a, b: c.b, angle: 165, glow: false, spot: !shape, vig: !shape, grain: true, style, c2, hl: hsl(h, 50, lum(c.a) < 0.5 ? 45 : 75) },
                    layers,
                    caption: r.cap ? { pos: r.cap, eyebrow: `NO. ${String(si + 1).padStart(2, "0")} / ${String(entries.length).padStart(2, "0")}`, title, meta: info.host || "" } : null,
                },
            });
        });
    });
    return out;
}
