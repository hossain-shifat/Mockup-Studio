// Mockup Composition Engine. One renderer powers the live canvas AND export.
export const DEVICES = {
    // screen aspect ratios match real captures: 16:10 desktop, 0.695 tablet, 0.462 phone
    laptop: { w: 900, h: 550, label: "Laptop", view: "desktop" },
    browser: { w: 900, h: 602, label: "Browser", view: "desktop" },
    panel: { w: 900, h: 562, label: "Panel", view: "desktop" },
    tablet: { w: 520, h: 735, label: "Tablet", view: "tablet" },
    phone: { w: 300, h: 626, label: "Phone", view: "mobile" },
};

const cache = new Map();
export function getImg(src, onLoad) {
    if (!src) return null;
    let i = cache.get(src);
    if (!i) { i = new Image(); i.src = src; cache.set(src, i); }
    const ready = i.complete && i.naturalWidth > 0;
    if (!ready && onLoad) { i._cb ??= new Set(); if (!i._cb.has(onLoad)) { i._cb.add(onLoad); i.addEventListener("load", onLoad, { once: true }); } }
    return ready ? i : null;
}
export function preload(src) {
    if (!src) return Promise.resolve();
    let i = cache.get(src);
    if (!i) { i = new Image(); i.src = src; cache.set(src, i); }
    if (i.complete && i.naturalWidth > 0) return Promise.resolve();
    return new Promise((ok) => { i.addEventListener("load", ok, { once: true }); i.addEventListener("error", ok, { once: true }); });
}

const hex = (h) => parseInt(h.slice(1), 16);
const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const lum = (h) => { const n = hex(h); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
function shade(h, a) { const n = hex(h), f = (v) => Math.max(0, Math.min(255, v + a)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
const noShadow = (c) => { c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetY = 0; c.shadowOffsetX = 0; };
// brushed-metal frame: light from the top left
const metal = (c, f, x0, y0, x1, y1) => { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, shade(f, 30)); g.addColorStop(0.45, f); g.addColorStop(1, shade(f, -18)); return g; };
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };

// layered cast shadow: wide ambient + mid + tight contact, like a studio shot
function cast(c, l, k, path) {
    for (const [b, o, a] of [[100, 56, 0.36], [30, 16, 0.38], [6, 3, 0.45]]) {
        c.shadowColor = `rgba(0,0,0,${Math.min(1, a * l.shadow * 1.6)})`; c.shadowBlur = b * k; c.shadowOffsetY = o * k; c.shadowOffsetX = o * 0.28 * k; // one light source: shadows fall down and to the right
        path(); c.fill();
    }
    noShadow(c);
}

// Fit a screenshot into a screen without distorting it:
// tall -> fit width, show the top | slightly wide -> fit height, centre crop | mismatched -> contain on the dark screen
function drawFit(c, img, x, y, w, h) {
    const iw = img.naturalWidth, ih = img.naturalHeight, ia = iw / ih, sa = w / h;
    if (ia < sa) {
        if (sa < 1.1 || ia > sa * 0.62) { const s = w / iw; c.drawImage(img, 0, 0, iw, Math.min(ih, h / s), x, y, w, Math.min(ih * s, h)); return; }
    } else if (ia <= sa * 1.45) { const s = h / ih, sw = w / s; c.drawImage(img, (iw - sw) / 2, 0, sw, ih, x, y, w, h); return; }
    const s = Math.min(w / iw, h / ih); c.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
}

// colour of the top edge of a screenshot, so the phone status bar blends into the app instead of covering it
const edge = new WeakMap();
function topColor(img) {
    let v = edge.get(img); if (v) return v;
    const t = document.createElement("canvas"); t.width = 8; t.height = 1;
    const g = t.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, img.naturalWidth, Math.min(6, img.naturalHeight), 0, 0, 8, 1);
    const d = g.getImageData(0, 0, 8, 1).data; let r = 0, gr = 0, b = 0;
    for (let i = 0; i < 32; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
    v = { r: Math.round(r / 8), g: Math.round(gr / 8), b: Math.round(b / 8) }; v.light = (0.299 * v.r + 0.587 * v.g + 0.114 * v.b) / 255 > 0.6;
    edge.set(img, v); return v;
}

// inset > 0 (phones): the page starts below the status bar / Dynamic Island, like a real device. The bar shows time and battery.
function screen(c, img, x, y, w, h, r, inset = 0) {
    c.save(); rr(c, x, y, w, h, r); c.clip();
    c.fillStyle = "#0a0a0c"; c.fillRect(x, y, w, h);
    if (img) {
        if (inset) {
            const t = topColor(img), ink = t.light ? "#14151a" : "#f4f3f1";
            c.fillStyle = `rgb(${t.r},${t.g},${t.b})`; c.fillRect(x, y, w, inset);
            drawFit(c, img, x, y + inset, w, h - inset);
            c.fillStyle = ink; c.textBaseline = "middle"; c.font = '600 14px "Instrument Sans", system-ui, sans-serif';
            c.textAlign = "left"; c.fillText("9:41", x + 30, y + 26);
            c.textAlign = "right"; // signal bars + battery
            for (let i = 0; i < 4; i++) { rr(c, x + w - 78 + i * 5, y + 29 - (i + 1) * 3, 3, (i + 1) * 3, 1); c.fill(); }
            c.globalAlpha = 0.5; rr(c, x + w - 50, y + 20, 22, 11, 3.5); c.stroke ? (c.strokeStyle = ink, c.lineWidth = 1, c.stroke()) : 0; c.globalAlpha = 1;
            rr(c, x + w - 48, y + 22, 16, 7, 2); c.fill();
            c.globalAlpha = 0.55; rr(c, x + w / 2 - 50, y + h - 9, 100, 4, 2); c.fill(); c.globalAlpha = 1; // home indicator
        } else drawFit(c, img, x, y, w, h);
    }
    const g = c.createLinearGradient(x, y, x + w * 0.9, y + h * 0.9); // glass sheen
    g.addColorStop(0, "rgba(255,255,255,0.07)"); g.addColorStop(0.42, "rgba(255,255,255,0)");
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.restore();
}

function body(c, l, img, k) {
    const { w, h } = DEVICES[l.device], r = l.radius, f = l.frame, x = -w / 2, y = -h / 2, rim = shade(f, 38);
    c.fillStyle = f;
    if (l.device === "phone" || l.device === "tablet") {
        const ph = l.device === "phone", p = ph ? 10 : 15, R = (ph ? 52 : 30) * r;
        if (ph) { // hardware buttons
            c.fillStyle = shade(f, 18);
            [[x - 4, y + 118, 4, 30], [x - 4, y + 168, 4, 58], [x - 4, y + 238, 4, 58], [x + w, y + 190, 4, 92]].forEach(([a, b, bw, bh]) => { rr(c, a, b, bw, bh, 2); c.fill(); });
            c.fillStyle = f;
        }
        c.fillStyle = metal(c, f, x, y, x + w, y + h);
        cast(c, l, k, () => rr(c, x, y, w, h, R)); rr(c, x, y, w, h, R); c.fill();
        c.strokeStyle = rim; c.lineWidth = 2.4; rr(c, x + 1, y + 1, w - 2, h - 2, R - 1); c.stroke();
        c.strokeStyle = "#050506"; c.lineWidth = 7; rr(c, x + p - 3, y + p - 3, w - 2 * p + 6, h - 2 * p + 6, Math.max(R - p + 3, 6)); c.stroke();
        screen(c, img, x + p, y + p, w - 2 * p, h - 2 * p, Math.max(R - p, 5), ph ? 46 : 0);
        c.fillStyle = "#000";
        if (ph) { rr(c, -48, y + p + 12, 96, 28, 14); c.fill(); } else { c.beginPath(); c.arc(0, y + p / 2, 3, 0, 7); c.fill(); }
    } else if (l.device === "browser") {
        const R = 12 * r, bar = 40, light = lum(f) > 0.6;
        cast(c, l, k, () => rr(c, x, y, w, h, R)); rr(c, x, y, w, h, R); c.fill();
        c.fillStyle = light ? "#eceae7" : "#2b2d34"; rr(c, x, y, w, bar, [R, R, 0, 0]); c.fill();
        c.fillStyle = light ? "#d4d1cc" : "#3b3e47"; c.fillRect(x, y + bar - 1, w, 1);
        ["#ff5f57", "#febc2e", "#28c840"].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(x + 20 + i * 18, y + bar / 2, 5.5, 0, 7); c.fill(); });
        c.fillStyle = light ? "#dedbd6" : "#3b3e47"; rr(c, -w * 0.2, y + 10, w * 0.4, 20, 10); c.fill();
        if (l.url) { // the page address, like a real window
            c.save(); c.font = '500 13px "Instrument Sans", sans-serif'; c.fillStyle = light ? "#6b6a66" : "#9a9ca6"; c.textAlign = "center"; c.textBaseline = "middle";
            let t = l.url; while (c.measureText(t).width > w * 0.36 && t.length > 6) t = t.slice(0, -2);
            c.fillText(t === l.url ? t : t.trimEnd() + "…", 0, y + 20.5); c.restore();
        }
        screen(c, img, x, y + bar, w, h - bar, [0, 0, R, R]);
        c.strokeStyle = light ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.10)"; c.lineWidth = 1.5; rr(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, R); c.stroke();
    } else if (l.device === "panel") {
        const R = 18 * l.radius;
        c.fillStyle = "#0a0a0c"; cast(c, l, k, () => rr(c, x, y, w, h, R)); rr(c, x, y, w, h, R); c.fill();
        screen(c, img, x, y, w, h, R);
        c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 1.5; rr(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, R); c.stroke();
    } else {
        const lid = h - 26, lx = x + 36, lw = w - 72, R = 20 * r;
        cast(c, l, k, () => rr(c, x, y + lid, w, 16, [2, 2, 16, 16]));
        c.fillStyle = metal(c, f, lx, y, lx + lw, y + lid); rr(c, lx, y, lw, lid, [R, R, 3, 3]); c.fill();
        c.strokeStyle = rim; c.lineWidth = 2; rr(c, lx + 1, y + 1, lw - 2, lid - 2, [R, R, 3, 3]); c.stroke();
        screen(c, img, lx + 10, y + 10, lw - 20, lid - 18, 6 * r);
        c.fillStyle = "#000"; rr(c, -46, y + 10, 92, 15, [0, 0, 9, 9]); c.fill();
        const g = c.createLinearGradient(0, y + lid, 0, y + lid + 16);
        g.addColorStop(0, shade(f, 50)); g.addColorStop(1, shade(f, 16));
        c.fillStyle = g; rr(c, x, y + lid, w, 16, [2, 2, 16, 16]); c.fill();
        c.fillStyle = shade(f, 70); c.fillRect(x + 2, y + lid, w - 4, 1.5);
        c.fillStyle = shade(f, -16); rr(c, -66, y + lid, 132, 6, [0, 0, 8, 8]); c.fill();
    }
}

let tile = null;
const grainTile = () => {
    if (tile) return tile;
    const t = document.createElement("canvas"); t.width = t.height = 180;
    const g = t.getContext("2d"), d = g.createImageData(180, 180);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); return (tile = t);
};

function bgFill(c, bg, W, H, k) {
    if (bg.type === "transparent") return;
    if (bg.type === "image" && bg.img) {
        const i = getImg(bg.img);
        if (i) { const s = Math.max(W / i.naturalWidth, H / i.naturalHeight); c.drawImage(i, (W - i.naturalWidth * s) / 2, (H - i.naturalHeight * s) / 2, i.naturalWidth * s, i.naturalHeight * s); return; }
    }
    if (bg.type === "gradient") {
        const a = (bg.angle * Math.PI) / 180, dx = (Math.sin(a) * W) / 2, dy = (-Math.cos(a) * H) / 2;
        const g = c.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
        g.addColorStop(0, bg.a); g.addColorStop(1, bg.b); c.fillStyle = g;
    } else c.fillStyle = bg.a;
    c.fillRect(0, 0, W, H);
    const dark = lum(bg.a) < 0.5;
    const rad = (cx, cy, r0, r1, c0, c1) => { const g = c.createRadialGradient(cx, cy, r0, cx, cy, r1); g.addColorStop(0, c0); g.addColorStop(1, c1); c.fillStyle = g; c.fillRect(0, 0, W, H); };
    const c2 = bg.c2 || "#ffffff"; // designed colour blocking
    if (bg.style === "circle") { c.fillStyle = c2; c.beginPath(); c.arc(W * 0.64, H * 0.52, H * 0.58, 0, 7); c.fill(); }
    if (bg.style === "split") { c.fillStyle = c2; c.beginPath(); c.moveTo(W * 0.56, 0); c.lineTo(W, 0); c.lineTo(W, H); c.lineTo(W * 0.44, H); c.closePath(); c.fill(); }
    if (bg.style === "band") { c.fillStyle = c2; c.fillRect(0, H * 0.3, W, H * 0.46); }
    if (bg.style === "arch") { c.fillStyle = c2; c.beginPath(); c.roundRect(W * 0.27, H * 0.1, W * 0.46, H * 1.1, [W * 0.23, W * 0.23, 0, 0]); c.fill(); }
    const hl = bg.hl || "#ffffff";
    if (bg.style === "mesh") [[0.15, 0.2, 0.55, 0.22], [0.9, 0.15, 0.5, 0.15], [0.65, 1.0, 0.6, 0.18]].forEach(([fx, fy, fr, a]) => rad(W * fx, H * fy, 0, W * fr, rgba(hl, a), rgba(hl, 0)));
    if (bg.style === "stage") { // studio floor with a horizon line
        const hy = H * 0.72, g = c.createLinearGradient(0, hy, 0, H);
        g.addColorStop(0, dark ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0.08)"); g.addColorStop(1, dark ? "rgba(0,0,0,0.05)" : "rgba(0,0,0,0)");
        c.fillStyle = g; c.fillRect(0, hy, W, H - hy);
        c.fillStyle = dark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.7)"; c.fillRect(0, hy, W, 1.5);
    }
    if (bg.style === "grid") { c.fillStyle = dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"; for (let gx = 28; gx < W; gx += 36) for (let gy = 28; gy < H; gy += 36) { c.beginPath(); c.arc(gx, gy, 1.2, 0, 7); c.fill(); } }
    if (bg.style === "beam") {
        c.save(); c.translate(W * 0.55, H * 0.5); c.rotate(-0.38);
        const g = c.createLinearGradient(-W * 0.3, 0, W * 0.3, 0);
        g.addColorStop(0, rgba(hl, 0)); g.addColorStop(0.5, rgba(hl, dark ? 0.10 : 0.35)); g.addColorStop(1, rgba(hl, 0));
        c.fillStyle = g; c.fillRect(-W * 0.3, -H, W * 0.6, H * 2); c.restore();
    }
    if (bg.spot) rad(W / 2, H * 0.3, 0, W * 0.8, dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.6)", "rgba(255,255,255,0)"); // soft key light
    if (bg.vig) rad(W / 2, H / 2, W * 0.32, W * 0.82, "rgba(0,0,0,0)", dark ? "rgba(0,0,0,0.38)" : "rgba(70,50,30,0.14)");
    if (bg.glow) rad(W / 2, H * 0.45, 0, W * 0.55, "rgba(220,60,78,0.28)", "rgba(220,60,78,0)");
    if (bg.grain) { // paper grain, kept at constant pixel size across export scales
        const p = c.createPattern(grainTile(), "repeat"); p.setTransform(new DOMMatrix().scale(1 / k));
        c.save(); c.globalAlpha = dark ? 0.06 : 0.045; c.fillStyle = p; c.fillRect(0, 0, W, H); c.restore();
    }
}

// editorial caption: eyebrow, headline (wrapped, never cut with "..."), page name. Ink colour is picked from the pixels actually behind it.
function wrap(c, text, maxW, maxLines) {
    const words = text.split(/\s+/), lines = []; let cur = "";
    for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (c.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length <= maxLines ? lines : null;
}
function caption(c, doc, k) {
    const cp = doc.caption; if (!cp) return;
    const { w: W, h: H } = doc.size, u = H / 1000, left = cp.pos === "tl";
    const x = left ? W * 0.05 : W / 2, y = left ? H * 0.075 : H * 0.86;
    const px = c.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
    const dark = (0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]) / 255 < 0.55;
    const ink = dark ? "#f4f3f1" : "#14151a", dim = dark ? "rgba(244,243,241,0.62)" : "rgba(20,21,26,0.58)";
    c.save(); c.textAlign = left ? "left" : "center"; c.textBaseline = "alphabetic";
    c.font = `500 ${15 * u}px "Instrument Sans", sans-serif`; c.letterSpacing = `${2 * u}px`; c.fillStyle = dim; c.fillText(cp.eyebrow.toUpperCase(), x, y);
    // headline: shrink first, then wrap onto at most two lines. Nothing is ever truncated.
    const maxW = W * (left ? 0.5 : 0.7); let size = 40 * u, lines = null;
    c.letterSpacing = "0px";
    for (; size >= 26 * u && !lines; size -= 2 * u) { c.font = `600 ${size}px "Bricolage Grotesque", "Instrument Sans", sans-serif`; lines = wrap(c, cp.title, maxW, 1); }
    if (!lines) { size = 34 * u; c.font = `600 ${size}px "Bricolage Grotesque", "Instrument Sans", sans-serif`; lines = wrap(c, cp.title, maxW, 2) || [cp.title]; }
    c.fillStyle = ink; lines.forEach((t, i) => c.fillText(t, x, y + 46 * u + i * size * 1.12));
    if (cp.meta) { c.font = `400 ${16 * u}px "Instrument Sans", sans-serif`; c.fillStyle = dim; c.fillText(cp.meta, x, y + 46 * u + (lines.length - 1) * size * 1.12 + 30 * u); }
    c.restore();
}

function place(c, l) {
    const ry = (l.rotY * Math.PI) / 180, rx = (l.rotX * Math.PI) / 180, s = l.scale, d = l.depth ?? 0.18;
    c.translate(l.x, l.y); c.rotate((l.rotZ * Math.PI) / 180);
    c.transform(Math.cos(ry) * s, Math.sin(ry) * d * s, -Math.sin(rx) * d * s, Math.cos(rx) * s, 0, 0);
}

export function drawScene(c, doc, k, { sel, onLoad, shotFor }) {
    const { w: W, h: H } = doc.size;
    c.save(); c.scale(k, k);
    bgFill(c, doc.bg, W, H, k);
    caption(c, doc, k);
    for (const l of doc.layers) {
        c.save(); place(c, l);
        if (l.blur) c.filter = `blur(${l.blur * k}px)`; // depth of field on background devices
        body(c, l, getImg(shotFor(l), onLoad), k);
        if (l.id === sel) {
            const { w, h } = DEVICES[l.device];
            noShadow(c); c.strokeStyle = "#dc3c4e"; c.lineWidth = 2.5 / l.scale; c.setLineDash([10, 7]);
            c.strokeRect(-w / 2 - 10, -h / 2 - 10, w + 20, h + 20);
        }
        c.restore();
    }
    c.restore();
}

export function hitTest(layers, px, py) {
    for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i], { w, h } = DEVICES[l.device], z = (-l.rotZ * Math.PI) / 180;
        const dx = px - l.x, dy = py - l.y;
        const x = (dx * Math.cos(z) - dy * Math.sin(z)) / l.scale, y = (dx * Math.sin(z) + dy * Math.cos(z)) / l.scale;
        if (Math.abs(x) <= w / 2 && Math.abs(y) <= h / 2) return l.id;
    }
    return null;
}
