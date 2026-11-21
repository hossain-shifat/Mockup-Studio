import { useEffect, useRef, useState } from "react";
import { Undo2, Redo2, Download, Camera, Layers, Palette, Copy, Trash2, ArrowUp, ArrowDown, Upload, RotateCcw, Loader2, Plus, Minus, Maximize, Mail, Lock, Link2, Eye, EyeOff, Square, Globe, LayoutGrid, Monitor, Smartphone, Tablet as TabletIcon, AlertTriangle, Shuffle, ScreenShare, Link as LinkIcon } from "lucide-react";
import { DEVICES, drawScene, hitTest, preload } from "./render";
import { makeZip, zipStream } from "./zip";
import { generate } from "./auto";

// ── model ────────────────────────────────────────────────────────────────────
const HOSTED = import.meta.env.VITE_CAPTURE_URL || ""; // hosted capture server, set in Vercel (never shown in the UI)
const LOCAL = import.meta.env.DEV ? "" : "http://localhost:5050"; // the server on this computer
const VERSION = typeof __APP_VERSION__ === "undefined" ? "dev" : __APP_VERSION__;
const SHA = typeof __BUILD_SHA__ === "undefined" ? "dev" : __BUILD_SHA__;
// localhost, LAN and single-word hosts can only be reached by the server on this computer
const isLocalAddr = (u) => { try { const t = u.trim(), h = new URL(/^https?:\/\//i.test(t) ? t : `http://${t}`).hostname; return !h.includes(".") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\])|\.local$/i.test(h); } catch { return false; } };
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
let uid = 1;
const mk = (device, o = {}) => ({ id: uid++, device, shot: null, x: 800, y: 500, scale: 1, rotX: 0, rotY: 0, rotZ: 0, depth: 0.18, radius: 1, frame: "#26272c", shadow: 0.55, ...o });
const F = { spot: true, vig: true, grain: true, glow: false };
const BG = {
    ink: { type: "gradient", a: "#1b1d23", b: "#121318", angle: 165, ...F, style: "plain" },
    slate: { type: "gradient", a: "#2c3340", b: "#222833", angle: 165, ...F, style: "mesh", hl: "#7d92b8" },
    navy: { type: "gradient", a: "#1a2036", b: "#10131f", angle: 165, ...F, style: "mesh", hl: "#5b7bd6" },
    forest: { type: "gradient", a: "#16241f", b: "#0e1713", angle: 165, ...F, style: "mesh", hl: "#4aa57f" },
    clay: { type: "gradient", a: "#b4694f", b: "#a45c44", angle: 165, ...F, style: "stage" },
    bone: { type: "gradient", a: "#ebe8e1", b: "#e0dcd3", angle: 165, ...F, style: "plain" },
    stone: { type: "gradient", a: "#d6d2c9", b: "#cbc6bb", angle: 165, ...F, style: "plain" },
    mist: { type: "gradient", a: "#e6ecf2", b: "#d6dfe9", angle: 165, ...F, style: "plain" },
};
const SIZES = [["1600×1000", 1600, 1000], ["1920×1080", 1920, 1080], ["1080×1080", 1080, 1080], ["1200×1500", 1200, 1500]];
const RES = [["1x", () => 1], ["2x", () => 2], ["3x", () => 3], ["1080p", (W) => 1920 / W], ["2K", (W) => 2560 / W], ["4K", (W) => 3840 / W]];
const fresh = () => ({ size: { w: 1600, h: 1000 }, bg: BG.ink, layers: [mk("laptop", { rotX: 14, rotY: -16, rotZ: -3, scale: 1.2 })] });
const readFile = (f) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });
const KIND = { single: "One device", responsive: "Same page, many devices", flow: "Multi-screen flow" };

// ── small ui ─────────────────────────────────────────────────────────────────
const Slider = ({ label, value, min, max, step = 1, onChange, onStart }) => (
    <label className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-xs text-base-content/65">
        <span>{label}</span>
        <input type="range" min={min} max={max} step={step} value={value} onPointerDown={onStart} onChange={(e) => onChange(+e.target.value)} />
        <span className="text-right tabular-nums text-base-content/45">{Math.round(value * 100) / 100}</span>
    </label>
);
const Field = ({ icon: I, label, right, ...p }) => (
    <label className="block">
        {label && <span className="text-xs text-base-content/60">{label}</span>}
        <span className={`${label ? "mt-1 " : ""}flex items-center gap-2 rounded-md bg-base-300/60 ring-1 ring-inset ring-base-content/10 px-3 h-10 transition focus-within:ring-primary/70 focus-within:bg-base-300`}>
            <I size={15} className="text-base-content/40 shrink-0" />
            <input {...p} className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-base-content/30" />
            {right}
        </span>
    </label>
);
const Toggle = ({ checked, onChange }) => (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange({ target: { checked: !checked } })}
        className={`relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors ${checked ? "bg-primary" : "bg-base-content/20"}`}>
        <span className={`absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-base-100 shadow transition-transform ${checked ? "translate-x-[14px]" : "translate-x-0"}`} />
    </button>
);
const Row = ({ title, hint, checked, onChange }) => (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
        <span><span className="block text-[13px]">{title}</span>{hint && <span className="block text-xs text-base-content/45 leading-relaxed mt-0.5">{hint}</span>}</span>
        <span className="pt-0.5"><Toggle checked={checked} onChange={onChange} /></span>
    </label>
);
const Section = ({ title, children }) => (
    <div className="space-y-2.5"><h4 className="text-[13px] font-medium text-base-content">{title}</h4>{children}</div>
);
const Btn = ({ icon: I, children, ...p }) => (
    <button {...p} className={`btn btn-sm ${p.className ?? "btn-ghost"}`}>{I && <I size={15} />}{children}</button>
);
// segmented control: switches between a few views without scrolling
const Seg = ({ value, onChange, options, className = "" }) => (
    <div role="tablist" className={`grid gap-0.5 rounded-md bg-base-300/70 p-0.5 ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(([v, l]) => <button key={String(v)} role="tab" aria-selected={value === v} onClick={() => onChange(v)} className={`h-7 rounded text-xs transition-colors ${value === v ? "bg-base-100 text-base-content shadow-sm" : "text-base-content/55 hover:text-base-content"}`}>{l}</button>)}
    </div>
);

// brand mark: two device frames overlapping, the second one in safelight amber
const Mark = () => (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="1.5" y="3.5" width="13" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" opacity=".55" />
        <rect x="8" y="8" width="12.5" height="10.5" rx="2.2" fill="var(--color-primary)" />
        <rect x="9.6" y="9.6" width="9.3" height="7.3" rx="1" fill="var(--color-base-100)" opacity=".28" />
    </svg>
);
const VIEW_BOX = { desktop: "w-44 aspect-[16/10]", upload: "w-44 aspect-[16/10]", tablet: "w-24 aspect-[3/4]", mobile: "w-[4.25rem] aspect-[9/19]", full: "w-20 aspect-[1/2]" };
const DEV_ICON = { desktop: Monitor, tablet: TabletIcon, mobile: Smartphone };
// one captured screenshot with a thin ruler: the tick shows how far down the page it was taken, so you can see which shots belong to the same moment
const ShotThumb = ({ s }) => {
    const pos = s.pos ?? 0;
    return (
        <figure className="shrink-0" title={s.flaw ? `Not used: ${s.flaw}` : s.label}>
            <div className={`relative overflow-hidden rounded-[5px] bg-base-300 ring-1 ring-inset ${s.flaw ? "ring-warning/60" : "ring-base-content/10"} ${VIEW_BOX[s.view] || VIEW_BOX.desktop}`}>
                <img src={s.src} alt={s.label} loading="lazy" decoding="async" className={`absolute inset-0 w-full h-full object-cover object-top ${s.flaw ? "opacity-35 grayscale" : ""}`} />
                <span className="absolute left-0 inset-y-0 w-[3px] bg-black/45" />
                <span className="absolute left-0 h-[3px] w-[9px] bg-primary" style={{ top: `calc(${pos * 100}% - ${pos * 3}px)` }} />
                {s.flaw && <span className="absolute inset-x-0 bottom-0 bg-warning text-warning-content text-[10px] leading-4 px-1.5 truncate">{s.flaw}</span>}
            </div>
            <figcaption className="mt-1 text-[11px] tabular-nums text-base-content/45">{pos < 0.06 ? "Top" : `${Math.round(pos * 100)}% down`}</figcaption>
        </figure>
    );
};

function Thumb({ item, shotsRef, onPick }) {
    const box = useRef(null), cv = useRef(null), [vis, setVis] = useState(false), [n, bump] = useState(0);
    const onImg = useRef(() => bump((x) => x + 1)).current;
    useEffect(() => {
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect(); } }, { rootMargin: "300px" });
        io.observe(box.current); return () => io.disconnect();
    }, []);
    useEffect(() => { // redraws only when this mockup changes or a picture finishes loading, not whenever a new screenshot arrives
        if (!vis) return;
        const c = cv.current, { w, h } = item.doc.size, k = 400 / w;
        c.width = 400; c.height = Math.round(h * k);
        drawScene(c.getContext("2d"), item.doc, k, { shotFor: (l) => shotsRef.current.find((s) => s.key === l.shot)?.src ?? null, onLoad: onImg });
    }, [vis, item, n, onImg, shotsRef]);
    return (
        <button ref={box} onClick={onPick} className="block w-full bg-base-300" style={{ aspectRatio: `${item.doc.size.w} / ${item.doc.size.h}` }} aria-label={`Open ${item.name} in the editor`}>
            <canvas ref={cv} className="w-full h-full block" />
        </button>
    );
}

export default function App() {
    // ── core
    const [doc, setDoc] = useState(fresh);
    const [name, setName] = useState("Untitled mockup");
    const [sel, setSel] = useState(null);
    const [shots, setShots] = useState([]);
    const shotsRef = useRef(shots); shotsRef.current = shots;
    const [view, setView] = useState("gallery"); // gallery | editor | shots
    const [tab, setTab] = useState("capture"); // left panel: capture | mockups | layers | backdrop
    const [autos, setAutos] = useState([]);
    const [notes, setNotes] = useState([]);
    const [seed, setSeed] = useState(0);
    const [flow, setFlow] = useState(() => lsGet("ms:flow", "0") === "1");
    const [per, setPer] = useState(() => +lsGet("ms:per", "1")); // routes per template: 1, 2 or 0 (all)
    const [orig, setOrig] = useState(null);

    // ── capture settings
    const [url, setUrl] = useState(() => lsGet("ms:url", ""));
    const [mode, setMode] = useState(() => (HOSTED ? lsGet("ms:mode", "hosted") : "local"));
    const localAddr = isLocalAddr(url);
    const base = mode === "hosted" && HOSTED && !localAddr ? HOSTED.trim().replace(/\/+$/, "") : LOCAL;
    const [srv, setSrv] = useState({ state: "checking", version: "" });
    const [cap, setCap] = useState({ busy: false, msg: "", done: 0, total: 0, error: null, note: "", scrollNote: "", shots: 0, summary: "" });
    const [capTab, setCapTab] = useState("scope"); // scope | signin | more
    const [login, setLogin] = useState(() => ({ open: !!lsGet("ms:email", ""), email: lsGet("ms:email", ""), password: "", url: lsGet("ms:loginUrl", "") }));
    const [crawl, setCrawl] = useState(true);
    const [maxPages, setMaxPages] = useState(25);
    const [sections, setSections] = useState(3);
    const [showPw, setShowPw] = useState(false);
    const abortRef = useRef(null);
    const [screen, setScreen] = useState({ on: false, count: 0 });
    const [samePage, setSamePage] = useState(false);
    const screenRef = useRef(null);
    const [sessionInfo, setSessionInfo] = useState(null);
    const [keepIn, setKeepIn] = useState(true);
    const sessRef = useRef(null); sessRef.current = sessionInfo;

    // ── gallery + export
    const [picked, setPicked] = useState(() => new Set());
    const [tplF, setTplF] = useState("all");
    const [pageF, setPageF] = useState("all");
    const [kindF, setKindF] = useState("all");
    const [limit, setLimit] = useState(36);
    const [exp, setExp] = useState({ busy: false, done: 0, total: 0, msg: "" });
    const [asZip, setAsZip] = useState(false); // one file downloads directly; several are always zipped
    const [fmt, setFmt] = useState("png");
    const [res, setRes] = useState(1);
    const [dl, setDl] = useState(null); // id of the single download in progress

    // ── editor
    const [zoom, setZoom] = useState(0.5);
    const [tick, setTick] = useState(0);
    const onImg = useRef(() => setTick((t) => t + 1)).current;
    const cv = useRef(null), wrap = useRef(null), drag = useRef(null);
    const docRef = useRef(doc); docRef.current = doc;
    const past = useRef([]), fut = useRef([]);

    useEffect(() => {
        const f = () => { const s = sessRef.current; if (s) navigator.sendBeacon(`${s.base}/api/session/end`, new Blob([JSON.stringify({ sessionId: s.id })], { type: "application/json" })); };
        window.addEventListener("pagehide", f); return () => window.removeEventListener("pagehide", f);
    }, []);
    useEffect(() => { document.fonts?.ready.then(() => setTick((t) => t + 1)); }, []);
    useEffect(() => { try { localStorage.setItem("ms:email", login.email); localStorage.setItem("ms:loginUrl", login.url); localStorage.setItem("ms:url", url); localStorage.setItem("ms:mode", mode); localStorage.setItem("ms:flow", flow ? "1" : "0"); localStorage.setItem("ms:per", String(per)); } catch { /* private mode */ } }, [login.email, login.url, url, mode, flow, per]);
    useEffect(() => {
        let dead = false; const ac = new AbortController();
        (async () => {
            setSrv({ state: "checking", version: "" });
            let reached = false;
            for (let i = 0; i < (base !== LOCAL ? 12 : 1) && !dead; i++) {
                try {
                    const r = await fetch(`${base}/health`, { signal: ac.signal });
                    if (r.ok) { const d = await r.json(); if (!dead) setSrv({ state: "online", version: d.version || "" }); return; }
                } catch {
                    if (dead) return;
                    try { await fetch(`${base}/health`, { mode: "no-cors", signal: ac.signal }); reached = true; } catch { /* nothing answered */ }
                }
                if (base === LOCAL) break;
                await new Promise((ok) => setTimeout(ok, 5000));
            }
            if (!dead) setSrv({ state: reached ? "blocked" : "offline", version: "" });
        })();
        return () => { dead = true; ac.abort(); };
    }, [base]);

    // ── history
    const mark = () => { past.current.push(docRef.current); if (past.current.length > 80) past.current.shift(); fut.current = []; };
    const edit = (fn) => { mark(); setDoc(fn); };
    const undo = () => { const p = past.current.pop(); if (p) { fut.current.push(docRef.current); setDoc(p); } };
    const redo = () => { const n = fut.current.pop(); if (n) { past.current.push(docRef.current); setDoc(n); } };
    const setLayer = (id, p) => setDoc((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...p } : l)) }));
    const layer = doc.layers.find((l) => l.id === sel);

    const shotFor = (l) => {
        const list = shotsRef.current, hit = l.shot && list.find((s) => s.key === l.shot || s.view === l.shot);
        if (hit) return hit.src;
        const want = DEVICES[l.device].view;
        const m = [...list].reverse().find((s) => s.view === want && !s.flaw) ?? list[list.length - 1];
        return m?.src ?? null;
    };

    useEffect(() => {
        if (view !== "editor" || !cv.current) return;
        const c = cv.current; c.width = doc.size.w; c.height = doc.size.h;
        drawScene(c.getContext("2d"), doc, 1, { sel, shotFor, onLoad: onImg });
    }); // eslint-disable-line
    const fit = (s) => { if (!wrap.current) return; const z = s?.w ? s : doc.size, r = wrap.current.getBoundingClientRect(); setZoom(Math.max(0.1, Math.min((r.width - 80) / z.w, (r.height - 80) / z.h))); };
    useEffect(() => { if (view === "editor") setTimeout(fit, 0); }, [view]); // eslint-disable-line
    useEffect(() => {
        const k = (e) => {
            if (view !== "editor" || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
            if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
            if ((e.key === "Delete" || e.key === "Backspace") && docRef.current.layers.some((l) => l.id === sel)) remove(sel);
        };
        window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
    }); // eslint-disable-line

    // ── canvas pointer
    const pt = (e) => { const r = cv.current.getBoundingClientRect(); return [((e.clientX - r.left) * doc.size.w) / r.width, ((e.clientY - r.top) * doc.size.h) / r.height]; };
    const down = (e) => {
        const [x, y] = pt(e), id = hitTest(doc.layers, x, y); setSel(id);
        if (id) { mark(); const l = doc.layers.find((q) => q.id === id); drag.current = { id, dx: l.x - x, dy: l.y - y }; e.currentTarget.setPointerCapture(e.pointerId); }
    };
    const move = (e) => { if (!drag.current) return; const [x, y] = pt(e); setLayer(drag.current.id, { x: Math.round(x + drag.current.dx), y: Math.round(y + drag.current.dy) }); };

    // ── layer ops
    const add = (device) => { const l = mk(device, { x: doc.size.w / 2, y: doc.size.h / 2 }); edit((d) => ({ ...d, layers: [...d.layers, l] })); setSel(l.id); };
    const remove = (id) => { edit((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) })); setSel(null); };
    const dup = (id) => { const l = doc.layers.find((q) => q.id === id), n = { ...l, id: uid++, x: l.x + 40, y: l.y + 40 }; edit((d) => ({ ...d, layers: [...d.layers, n] })); setSel(n.id); };
    const order = (id, dir) => edit((d) => { const a = [...d.layers], i = a.findIndex((l) => l.id === id), j = i + dir; if (j < 0 || j >= a.length) return d; [a[i], a[j]] = [a[j], a[i]]; return { ...d, layers: a }; });
    // pick a screenshot for one device, then move every other device to the SAME page and scroll point
    const syncMoment = (id, key) => {
        const src = shots.find((s) => s.key === key); if (!src) return;
        edit((d) => ({
            ...d, layers: d.layers.map((l) => {
                if (l.id === id) return { ...l, shot: key };
                const v = DEVICES[l.device].view, pool = shots.filter((s) => s.page === src.page && s.view === v && !s.flaw);
                const best = pool.sort((a, b) => Math.abs((a.pos ?? 0) - (src.pos ?? 0)) - Math.abs((b.pos ?? 0) - (src.pos ?? 0)))[0];
                return best && Math.abs((best.pos ?? 0) - (src.pos ?? 0)) <= 0.2 ? { ...l, shot: best.key } : l;
            }),
        }));
    };
    const mismatch = (() => {
        const ls = doc.layers.filter((l) => l.shot).map((l) => shots.find((s) => s.key === l.shot)).filter(Boolean);
        if (ls.length < 2) return "";
        if (new Set(doc.layers.map((l) => l.device)).size === 1) return "";
        if (new Set(ls.map((s) => s.page)).size > 1) return "These devices show different pages. A real site shows the same page on every device.";
        const ps = ls.map((s) => s.pos ?? 0);
        return Math.max(...ps) - Math.min(...ps) > 0.2 ? "These devices show different parts of the page. Use “Match other devices” in Layers." : "";
    })();

    // ── export: render once, cache, and warm the cache in the background so a click has nothing left to do
    const docIds = useRef(new WeakMap()), docN = useRef(0), blobs = useRef(new Map()), warmQ = useRef(Promise.resolve()), hoverT = useRef(null);
    const renderBlob = async (d) => {
        await Promise.all([document.fonts.load('600 40px "Bricolage Grotesque"'), document.fonts.load('500 16px "Instrument Sans"')]).catch(() => {});
        await Promise.all([...d.layers.map((l) => preload(shotFor(l))), preload(d.bg.img)]);
        const { w: W, h: H } = d.size, k = Math.min(RES[res][1](W), 8192 / Math.max(W, H));
        const c = document.createElement("canvas"); c.width = Math.round(W * k); c.height = Math.round(H * k);
        const g = c.getContext("2d");
        if (fmt === "jpeg") { g.fillStyle = d.bg.type === "transparent" ? "#101218" : "#000"; g.fillRect(0, 0, c.width, c.height); }
        drawScene(g, d, k, { shotFor });
        return new Promise((ok) => c.toBlob(ok, `image/${fmt}`, 0.95));
    };
    const getBlob = (d) => {
        let id = docIds.current.get(d); if (!id) { id = ++docN.current; docIds.current.set(d, id); }
        const key = `${id}|${fmt}|${res}`; let p = blobs.current.get(key);
        if (!p) {
            p = renderBlob(d); blobs.current.set(key, p); p.catch(() => blobs.current.delete(key));
            if (blobs.current.size > 40) blobs.current.delete(blobs.current.keys().next().value);
        }
        return p;
    };
    const warm = (d) => { warmQ.current = warmQ.current.then(() => getBlob(d)).catch(() => {}); }; // one at a time, so the page stays smooth
    const warmSoon = (d) => { clearTimeout(hoverT.current); hoverT.current = setTimeout(() => warm(d), 250); };
    useEffect(() => { // changing format or resolution invalidates what was prepared: prepare the selection again
        blobs.current.clear();
        for (const a of autos) if (picked.has(a.id)) warm(a.doc);
    }, [fmt, res]); // eslint-disable-line
    const ext = () => (fmt === "jpeg" ? "jpg" : "png");
    const saveBlob = (b, nm) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nm; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const exportImg = async () => {
        setDl("editor");
        try {
            const b = await getBlob(doc), nm = (name || "mockup").replace(/[^\w-]+/g, "-");
            if (asZip) saveBlob(makeZip([{ name: `${nm}.${ext()}`, data: new Uint8Array(await b.arrayBuffer()) }]), `${nm}.zip`);
            else saveBlob(b, `${nm}.${ext()}`);
        } finally { setDl(null); }
    };
    const downloadOne = async (a) => { setDl(a.id); try { saveBlob(await getBlob(a.doc), `${a.file}.${ext()}`); } finally { setDl(null); } };
    const exportMany = async (list, label) => {
        if (!list.length || exp.busy) return;
        if (list.length === 1) { await downloadOne(list[0]); return; }
        const px = list.reduce((a, m) => { const { w, h } = m.doc.size, k = Math.min(RES[res][1](w), 8192 / Math.max(w, h)); return a + w * h * k * k; }, 0);
        const gb = (px * (fmt === "png" ? 1.5 : 0.3)) / 1e9;
        if (gb > 1.5 && !window.confirm(`About ${gb.toFixed(1)} GB of images. JPEG and a lower resolution are much smaller. Continue?`)) return;
        let w = null; // the file picker must open straight from the click, so the download starts at once and fills as images render
        if (window.showSaveFilePicker) {
            try {
                const h = await window.showSaveFilePicker({ suggestedName: `mockups-${label}.zip`, types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }] });
                w = await h.createWritable();
            } catch (e) { if (e.name === "AbortError") return; }
        }
        setExp({ busy: true, done: 0, total: list.length, msg: "" });
        let saved = 0;
        try {
            if (w) {
                const z = zipStream(w); let next = getBlob(list[0].doc);
                for (let i = 0; i < list.length; i++) {
                    if (z.size() > 3.8e9) break;
                    const b = await next;
                    if (i + 1 < list.length) next = getBlob(list[i + 1].doc); // render the next image while this one is written
                    await z.add(`${list[i].file}.${ext()}`, new Uint8Array(await b.arrayBuffer()));
                    saved++; setExp((e) => ({ ...e, done: saved }));
                }
                await z.finish(); await w.close();
            } else { // no streaming in this browser: small parts, so the first download starts after a few images, not after all of them
                const CH = list.length <= 12 ? list.length : 10; let part = 0;
                for (let i = 0; i < list.length; i += CH) {
                    const files = [];
                    for (const a of list.slice(i, i + CH)) { files.push({ name: `${a.file}.${ext()}`, data: new Uint8Array(await (await getBlob(a.doc)).arrayBuffer()) }); saved++; setExp((e) => ({ ...e, done: saved })); }
                    saveBlob(makeZip(files), `mockups-${label}${list.length > CH ? `-part${++part}` : ""}.zip`);
                    await new Promise((r) => setTimeout(r, 300));
                }
            }
            setExp({ busy: false, done: 0, total: 0, msg: saved < list.length ? `Saved ${saved} of ${list.length}. ZIP size limit hit. Use JPEG or a lower resolution for the rest.` : `Saved ${saved} mockups` });
        } catch (e) {
            if (w) await w.abort().catch(() => {});
            setExp({ busy: false, done: 0, total: 0, msg: `Export failed: ${e.message}` });
        }
        setTimeout(() => setExp((e) => (e.busy ? e : { ...e, msg: "" })), 9000);
    };

    // ── mockups: generated live while capturing, so the first ones show up within seconds
    const genRef = useRef(0), liveT = useRef(null), prevItems = useRef(new Map()), seenRef = useRef(false);
    const runAuto = async (list, sd = seed, o = {}) => {
        const g = ++genRef.current;
        const { items, skipped } = await generate(list, sd, { flow: o.flow ?? flow, per: o.per ?? per });
        if (g !== genRef.current) return items; // a newer run replaced this one
        const prev = prevItems.current, next = new Map();
        const stable = items.map((it) => { const sig = JSON.stringify(it.doc), p = prev.get(it.id), r = p && p.sig === sig ? p : { ...it, sig }; next.set(it.id, r); return r; }); // unchanged mockups keep their identity: no redraw, no flicker
        prevItems.current = next;
        setAutos(stable); setNotes(skipped);
        setPicked((p) => new Set([...p].filter((id) => next.has(id))));
        return stable;
    };
    const latestRef = useRef([]);
    // throttle, not debounce: shots arrive every few hundred ms, so a debounce would wait until the capture ends
    const scheduleLive = (list) => { latestRef.current = list; if (liveT.current) return; liveT.current = setTimeout(() => { liveT.current = null; runAuto([...latestRef.current], seed); }, 600); };
    const stopLive = () => { clearTimeout(liveT.current); liveT.current = null; };
    useEffect(() => { if (autos.length && !seenRef.current) { seenRef.current = true; setView("gallery"); } }, [autos.length]);
    const resetFilters = () => { setPageF("all"); setTplF("all"); setKindF("all"); setLimit(36); };
    const pick = (a) => { mark(); setDoc(a.doc); setOrig(a); setName(`${a.pageLabel === "/" ? "Home" : a.pageLabel.replace(/^\//, "")} ${a.name}`); setSel(null); setView("editor"); };
    const changeOpts = async (o) => { if (o.flow !== undefined) setFlow(o.flow); if (o.per !== undefined) setPer(o.per); resetFilters(); if (shots.length) await runAuto(shots, seed, o); };

    // ── capture
    const stopScreen = () => { screenRef.current?.stream.getTracks().forEach((t) => t.stop()); screenRef.current = null; setScreen((s) => ({ ...s, on: false })); };
    const startScreen = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
            const v = document.createElement("video"); v.srcObject = stream; v.muted = true; await v.play();
            stream.getVideoTracks()[0].addEventListener("ended", stopScreen);
            screenRef.current = { stream, v, lastPage: null };
            setScreen((s) => ({ ...s, on: true })); setCap((s) => ({ ...s, error: null }));
        } catch (e) { setCap((s) => ({ ...s, error: e.name === "NotAllowedError" ? "Screen sharing was cancelled." : `Could not start screen capture: ${e.message}` })); }
    };
    const grab = async () => {
        const r = screenRef.current; if (!r || !r.v.videoWidth) return;
        const c = document.createElement("canvas"); c.width = r.v.videoWidth; c.height = r.v.videoHeight; c.getContext("2d").drawImage(r.v, 0, 0);
        const ar = c.width / c.height, v = ar < 0.62 ? "mobile" : ar < 0.9 ? "tablet" : "desktop"; // a narrow window becomes a phone view
        const n = screen.count + 1, pageKey = samePage && r.lastPage ? r.lastPage : `scr-${Date.now()}`;
        r.lastPage = pageKey;
        const sec = shots.filter((s) => s.page === pageKey && s.view === v).length;
        const shot = { key: `${pageKey}-${v}-${sec}`, page: pageKey, label: `Screen grab ${n} \u00b7 ${v}`, view: v, sec, pos: Math.min(1, sec * 0.4), flaw: "", title: `Screen ${n}`, host: "", src: c.toDataURL("image/png") };
        const next = [...shots, shot];
        setShots(next); setScreen((s) => ({ ...s, count: n }));
        scheduleLive(next);
    };
    const diagnose = async () => {
        try { await fetch(`${base}/health`, { mode: "no-cors" }); return `The server answered but blocked this website. On the server set ALLOWED_ORIGINS to exactly ${location.origin} (no slash at the end), then retry.`; }
        catch { return base !== LOCAL ? "Cannot reach the hosted server. A free instance sleeps when idle and needs about a minute to wake. Try again shortly." : "Cannot reach the server on this computer. Double-click Start-Capture-Server.bat in the project folder, or share a tab. If the browser asks to allow local network access, allow it."; }
    };
    const endSession = async () => {
        const id = sessionInfo?.id; if (!id) return;
        setSessionInfo(null);
        try {
            const r = await fetch(`${sessionInfo.base ?? base}/api/session/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: id }) });
            const d = await r.json();
            setCap((s) => ({ ...s, error: null, note: d.signedOut ? "Signed out of the site." : "Session closed. No sign-out button was found on the site." }));
        } catch { setCap((s) => ({ ...s, error: "Could not reach the capture server to sign out." })); }
    };
    const finishCapture = async (got) => {
        stopLive();
        const items = await runAuto(got, seed);
        if (!items.length) setCap((s) => ({ ...s, busy: false, error: "Screenshots arrived, but none were mockup-ready (broken pictures, pages still loading, empty states, or a missing phone or tablet view). Try again, or lower the page limit." }));
    };
    const capture = async () => {
        let target = url.trim();
        if (target && !/^https?:\/\//i.test(target)) { target = `http://${target}`; setUrl(target); }
        setCap({ busy: true, msg: "Starting…", done: 0, total: 0, error: null, note: "", scrollNote: "", shots: 0, summary: "" });
        setShots([]); setAutos([]); setPicked(new Set()); prevItems.current = new Map(); blobs.current.clear(); seenRef.current = false; resetFilters(); setView("gallery");
        const stamp = Date.now(); const got = []; let sawDone = false;
        const ac = new AbortController(); abortRef.current = ac;
        try {
            const res = await fetch(`${base}/api/capture`, { method: "POST", signal: ac.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target, sessionId: sessionInfo?.base === base ? sessionInfo.id : undefined, keep: keepIn, sections, crawl, maxPages, login: login.password ? { email: login.email, password: login.password, url: login.url || undefined } : undefined }) });
            if (!res.ok || !res.body) throw new Error("Capture server not reachable. Check the address and that the server is running.");
            const rd = res.body.getReader(), dec = new TextDecoder(); let buf = "";
            for (;;) {
                const { done, value } = await rd.read(); if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split("\n"); buf = lines.pop();
                for (const ln of lines) {
                    if (!ln) continue;
                    const m = JSON.parse(ln);
                    if (m.error) throw new Error(m.error);
                    if (m.done) sawDone = true;
                    if (m.status) setCap((s) => ({ ...s, msg: m.status }));
                    if (m.progress) setCap((s) => ({ ...s, done: m.progress.done, total: m.progress.total }));
                    if (m.session !== undefined) setSessionInfo(m.session ? { id: m.session.id, as: m.session.as, base } : null);
                    if (m.note) setCap((s) => ({ ...s, scrollNote: m.note }));
                    if (m.keptOpen) setCap((s) => ({ ...s, note: "Still signed in, so the next capture needs no login. Press Sign out when you are finished." }));
                    if (m.signedOut !== undefined) setCap((s) => ({ ...s, note: m.signedOut ? "Signed out of the site. Password cleared." : "No sign-out button found. The session was discarded here; sign out of the site yourself if needed." }));
                    if (m.shot) {
                        const sec = m.shot.section ?? 0;
                        const shot = { key: `${stamp}-${m.shot.page}-${m.shot.view}-${sec}`, page: `${stamp}-${m.shot.page}`, label: `${m.shot.path} \u00b7 ${m.shot.view}${sec ? ` #${sec + 1}` : ""}`, view: m.shot.view, sec, pos: m.shot.pos ?? 0, flaw: m.shot.flaw || "", score: m.shot.score, title: m.shot.title, brand: m.shot.brand, h1: m.shot.h1, host: (() => { try { return new URL(target).hostname; } catch { return ""; } })(), src: m.shot.src };
                        got.push(shot); setShots((s) => [...s, shot]); setCap((s) => ({ ...s, shots: (s.shots || 0) + 1 }));
                        scheduleLive(got); // mockups appear while the capture is still running
                    }
                }
            }
            if (!got.length) throw new Error("The server finished without sending any screenshots. On the free Render plan it probably ran out of memory: open the Render Logs tab and look for \"out of memory\".");
            setCap((s) => ({ ...s, busy: false, summary: `${got.length} screenshots from ${new Set(got.map((g) => g.page)).size} pages.${sawDone ? "" : " The server stopped early, possibly out of memory, so some pages are missing."}` }));
            if (login.password) setLogin((l) => ({ ...l, password: "" }));
            await finishCapture(got);
        } catch (e) {
            if (e.name === "AbortError") { setCap((s) => ({ ...s, busy: false })); if (got.length) await finishCapture(got); return; }
            if (/expired|asked for the password/i.test(e.message)) setSessionInfo(null);
            let msg = e.message;
            if (e instanceof TypeError) {
                if (got.length) { msg = `The connection dropped after ${got.length} screenshots (a small hosted server can run out of memory). What was captured is kept. Lower the page limit or sections and retry.`; await finishCapture(got); }
                else msg = await diagnose();
            }
            stopLive();
            setCap((s) => ({ ...s, busy: false, error: msg }));
        }
    };
    const upload = async (e) => {
        const next = []; for (const f of e.target.files) { const k = `up-${uid++}`; next.push({ key: k, page: k, label: f.name, view: "upload", pos: 0, flaw: "", src: await readFile(f) }); }
        const all = [...shots, ...next]; setShots(all); e.target.value = ""; await runAuto(all, seed);
    };
    const bgUpload = async (e) => { const f = e.target.files[0]; if (f) edit((d) => ({ ...d, bg: { ...d.bg, type: "image", img: URL.createObjectURL(f) } })); e.target.value = ""; };

    const togglePick = (a) => setPicked((p) => { const q = new Set(p); if (q.has(a.id)) q.delete(a.id); else { q.add(a.id); warm(a.doc); } return q; });
    const visible = autos.filter((a) => (tplF === "all" || a.name === tplF) && (pageF === "all" || String(a.pageIndex) === pageF) && (kindF === "all" || a.kind === kindF));
    const exportShown = () => exportMany(visible, "all");
    const outK = Math.min(RES[res][1](doc.size.w), 8192 / Math.max(doc.size.w, doc.size.h));
    const sliders = (rows) => (layer ? rows.map(([label, key, min, max, step]) => <Slider key={key} label={label} min={min} max={max} step={step} value={layer[key]} onStart={mark} onChange={(v) => setLayer(layer.id, { [key]: v })} />) : null);
    const tplNames = [...new Set(autos.filter((a) => kindF === "all" || a.kind === kindF).map((a) => a.name))];
    const pageOpts = [...new Map(autos.map((a) => [a.pageIndex, a.pageLabel]))];
    const kinds = [...new Set(autos.map((a) => a.kind))];
    const bg = doc.bg, setBg = (p) => setDoc((d) => ({ ...d, bg: { ...d.bg, ...p } }));
    const expBar = exp.busy
        ? <div className="text-xs text-base-content/70">Saving {exp.done} of {exp.total}…<progress className="progress progress-primary w-full mt-1" value={exp.done} max={exp.total} /></div>
        : exp.msg ? <div role="status" className="text-xs text-success">{exp.msg}</div> : null;
    const clean = shots.filter((s) => !s.flaw).length, flawed = shots.length - clean;
    const pagesList = (() => {
        const m = new Map();
        for (const s of shots) { const k = s.page ?? s.key; if (!m.has(k)) m.set(k, { key: k, label: s.label.split(" \u00b7 ")[0], views: {} }); (m.get(k).views[s.view] ??= []).push(s); }
        return [...m.values()];
    })();
    const srvText = srv.state === "online" ? `Server online${srv.version ? `, v${srv.version}` : ""}` : srv.state === "checking" ? (base !== LOCAL ? "Checking server. A free host can take a minute to wake." : "Checking server…") : srv.state === "blocked" ? `Server blocks this website. Set ALLOWED_ORIGINS to ${location.origin}` : base === LOCAL ? "Server not running. Start Start-Capture-Server.bat, or share a tab." : "Hosted server not reachable.";
    const TABS = [["capture", Camera, "Capture"], ["mockups", LayoutGrid, "Mockups"], ["layers", Layers, "Layers"], ["backdrop", Palette, "Backdrop"]];
    const VIEWS = [["gallery", `Mockups${autos.length ? ` ${autos.length}` : ""}`], ["editor", "Editor"], ["shots", `Screenshots${shots.length ? ` ${shots.length}` : ""}`]];
    const exportBlock = (
        <div className="shrink-0 border-t border-base-300 p-4 space-y-3 bg-base-200">
            <div className="flex items-center justify-between"><h3 className="text-[13px] font-medium">Export</h3><span className="text-xs tabular-nums text-base-content/45">{view === "editor" ? `${Math.round(doc.size.w * outK)} × ${Math.round(doc.size.h * outK)} px` : "per mockup"}</span></div>
            <div className="grid grid-cols-[1fr_1fr] gap-2">
                <Seg value={fmt} onChange={setFmt} options={[["png", "PNG"], ["jpeg", "JPG"]]} />
                <select className="select select-sm" value={res} onChange={(e) => setRes(+e.target.value)} aria-label="Resolution">{RES.map(([l], i) => <option key={l} value={i}>{l}</option>)}</select>
            </div>
            {view === "editor" && <Row title="Pack as ZIP" checked={asZip} onChange={(e) => setAsZip(e.target.checked)} />}
            {view === "editor"
                ? <button onClick={exportImg} onPointerEnter={() => warm(doc)} onFocus={() => warm(doc)} disabled={dl === "editor"} className="btn btn-primary btn-sm w-full">{dl === "editor" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}{dl === "editor" ? "Preparing…" : asZip ? "Download ZIP" : `Download ${fmt.toUpperCase()}`}</button>
                : <button onClick={() => exportMany(autos.filter((a) => picked.has(a.id)), "selected")} disabled={!picked.size || exp.busy} className="btn btn-primary btn-sm w-full"><Download size={15} />{picked.size ? `Download ${picked.size} selected` : "Select mockups to download"}</button>}
        </div>
    );

    return (
        <div className="h-full grid grid-rows-[3rem_1fr] grid-cols-[20rem_1fr_19rem] bg-base-100 text-base-content">
            {/* ── toolbar */}
            <header className="col-span-3 grid grid-cols-[20rem_1fr_19rem] items-center bg-base-200 border-b border-base-300">
                <div className="flex items-center gap-2.5 px-4 font-display font-semibold tracking-tight"><Mark />Mockup Studio<span className="rounded bg-base-300 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-base-content/55" title={`Studio v${VERSION}${SHA !== "dev" ? ` build ${SHA}` : ""}`}>v{VERSION}</span></div>
                <div className="flex items-center justify-center gap-3">
                    <div className="w-[26rem]"><Seg value={view} onChange={setView} options={VIEWS} /></div>
                </div>
                <div className="flex items-center justify-end gap-1 px-3">
                    {view === "editor" ? (<>
                        <Btn icon={Undo2} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo" />
                        <Btn icon={Redo2} onClick={redo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" />
                        <Btn icon={RotateCcw} onClick={() => { if (orig) { mark(); setDoc(orig.doc); setSel(null); } }} title="Back to the generated layout" aria-label="Reset layout" />
                    </>) : <Btn icon={Download} disabled={!visible.length || exp.busy} onClick={exportShown} className="btn-outline btn-sm" title="Download every mockup shown, as one ZIP">Export {visible.length === autos.length ? "all" : "shown"}{visible.length ? ` (${visible.length})` : ""}</Btn>}
                </div>
            </header>

            {/* ── left panel: everything fits without scrolling; extra settings sit behind a switch */}
            <aside className="bg-base-200 border-r border-base-300 flex flex-col min-h-0">
                <div className="grid grid-cols-4 border-b border-base-300 shrink-0">
                    {TABS.map(([id, I, label]) => (
                        <button key={id} onClick={() => setTab(id)} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] border-b-2 -mb-px transition-colors ${tab === id ? "text-primary border-primary" : "border-transparent text-base-content/55 hover:text-base-content"}`}><I size={17} strokeWidth={1.8} />{label}</button>
                    ))}
                </div>

                {tab === "capture" && (
                    <div className="flex-1 min-h-0 flex flex-col">
                        <div className="p-4 space-y-3 shrink-0">
                            <Field icon={Globe} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !cap.busy && url && capture()} placeholder="Website address, e.g. example.com" spellCheck={false} aria-label="Website address" />
                            {cap.busy
                                ? <button onClick={() => abortRef.current?.abort()} className="btn btn-outline w-full btn-sm h-10"><Square size={13} />Stop and keep what is captured</button>
                                : <button onClick={capture} disabled={!url} className="btn btn-primary w-full h-10 min-h-10"><Camera size={16} />Capture website</button>}
                            <div className="flex items-start gap-2 text-xs text-base-content/55 leading-relaxed">
                                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${srv.state === "online" ? "bg-success" : srv.state === "checking" ? "bg-warning animate-pulse" : "bg-error"}`} />
                                <span>{srvText}{srv.state === "online" && srv.version && srv.version !== VERSION ? `. Studio is v${VERSION}.` : ""}</span>
                            </div>
                        </div>
                        <div className="px-4 shrink-0"><Seg value={capTab} onChange={setCapTab} options={[["scope", "Scope"], ["signin", "Sign in"], ["more", "More"]]} /></div>
                        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                            {capTab === "scope" && (<>
                                <Row title="Follow links" hint="Explore other pages on the same site." checked={crawl} onChange={(e) => setCrawl(e.target.checked)} />
                                {crawl && <Slider label="Pages" min={1} max={100} value={maxPages} onChange={setMaxPages} />}
                                <Slider label="Sections" min={1} max={5} value={sections} onChange={setSections} />
                                <p className="text-xs text-base-content/45 leading-relaxed">Sections are scroll stops per page (top, middle, bottom). Each device is captured at the same stops.</p>
                            </>)}
                            {capTab === "signin" && (<>
                                <Row title="Use a login" hint="For sites behind a sign-in page." checked={login.open} onChange={(e) => setLogin({ ...login, open: e.target.checked })} />
                                {login.open && (<>
                                    <Field icon={Mail} label="Email or username" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} placeholder="you@example.com" autoComplete="off" spellCheck={false} />
                                    <Field icon={Lock} label="Password" type={showPw ? "text" : "password"} value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && !cap.busy && url && capture()} placeholder={sessionInfo ? "Not needed while signed in" : "Enter password"} autoComplete="new-password"
                                        right={<button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} className="text-base-content/50 hover:text-base-content">{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>} />
                                    <Field icon={Link2} label="Login page (optional)" value={login.url} onChange={(e) => setLogin({ ...login, url: e.target.value })} placeholder="Only if different from the address" spellCheck={false} />
                                    {sessionInfo && <div className="flex items-center justify-between gap-2 rounded-md bg-success/10 px-3 py-2 text-xs text-success"><span className="truncate">Signed in as {sessionInfo.as}</span><button onClick={endSession} className="btn btn-xs btn-ghost text-success">Sign out</button></div>}
                                    <Row title="Stay signed in" hint="Between captures. Ends after 10 idle minutes or when you close this tab." checked={keepIn} onChange={(e) => setKeepIn(e.target.checked)} />
                                </>)}
                            </>)}
                            {capTab === "more" && (<>
                                {HOSTED && (
                                    <div className="space-y-2"><h4 className="text-[13px] font-medium">Capture from</h4>
                                        <Seg value={mode} onChange={setMode} options={[["local", "This computer"], ["hosted", "Hosted"]]} />
                                        {mode === "hosted" && localAddr && <p className="text-xs text-base-content/50 leading-relaxed">This address only exists on your network, so the capture runs on your computer.</p>}
                                    </div>
                                )}
                                <div className="space-y-2"><h4 className="text-[13px] font-medium">Share a browser tab</h4>
                                    <p className="text-xs text-base-content/45 leading-relaxed">No server needed. Share your site's tab, then grab each page. A narrow window becomes a phone view.</p>
                                    {!screen.on ? <Btn icon={ScreenShare} onClick={startScreen} className="btn-outline btn-sm w-full">Share a tab</Btn> : (<>
                                        <div className="grid grid-cols-2 gap-2"><Btn icon={Camera} onClick={grab} className="btn-primary btn-sm">Grab ({screen.count})</Btn><Btn icon={Square} onClick={stopScreen} className="btn-outline btn-sm">Stop</Btn></div>
                                        <Row title="Same page as last grab" checked={samePage} onChange={(e) => setSamePage(e.target.checked)} />
                                    </>)}
                                </div>
                                <div className="space-y-2"><h4 className="text-[13px] font-medium">Upload screenshots</h4>
                                    <p className="text-xs text-base-content/45 leading-relaxed">Each image is its own page and appears on every device in its mockups.</p>
                                    <label className="btn btn-outline btn-sm w-full"><Upload size={15} />Choose images<input type="file" accept="image/*" multiple hidden onChange={upload} /></label>
                                </div>
                            </>)}
                        </div>
                        {/* progress and results stay pinned here, so they are visible without scrolling */}
                        {(cap.busy || cap.error || cap.summary || cap.note || cap.scrollNote) && (
                            <div className="shrink-0 border-t border-base-300 p-4 space-y-2 max-h-52 overflow-y-auto">
                                {cap.busy && (<>
                                    <div className="flex items-center gap-2 text-[13px]"><Loader2 size={14} className="animate-spin text-primary shrink-0" /><span className="truncate">{cap.msg}</span></div>
                                    {cap.total > 0 && <progress className="progress progress-primary w-full h-1" value={cap.done} max={cap.total} />}
                                    <p className="text-xs text-base-content/50 tabular-nums">{cap.shots} screenshots, {autos.length} mockups ready</p>
                                </>)}
                                {cap.error && <div role="alert" className="flex gap-2 text-[13px] text-error leading-relaxed"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{cap.error}</span></div>}
                                {!cap.busy && cap.summary && <p role="status" className="text-xs text-success leading-relaxed">{cap.summary}</p>}
                                {!cap.busy && cap.scrollNote && <p className="text-xs text-base-content/55 leading-relaxed">{cap.scrollNote}</p>}
                                {!cap.busy && cap.note && <p className="text-xs text-success leading-relaxed">{cap.note}</p>}
                            </div>
                        )}
                    </div>
                )}

                {tab === "mockups" && (
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
                        <div className="space-y-2"><h4 className="text-[13px] font-medium">Show</h4>
                            <select className="select select-sm w-full" value={pageF} onChange={(e) => { setPageF(e.target.value); setLimit(36); }} aria-label="Page">
                                <option value="all">All pages ({pageOpts.length})</option>{pageOpts.map(([i, l]) => <option key={i} value={i}>{l === "/" ? "Home" : l}</option>)}
                            </select>
                            <select className="select select-sm w-full" value={kindF} onChange={(e) => { setKindF(e.target.value); setTplF("all"); setLimit(36); }} aria-label="Layout type">
                                <option value="all">All layout types</option>{kinds.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
                            </select>
                            <select className="select select-sm w-full" value={tplF} onChange={(e) => { setTplF(e.target.value); setLimit(36); }} aria-label="Template">
                                <option value="all">Any template</option>{tplNames.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2"><h4 className="text-[13px] font-medium">Pages per template</h4>
                            <Seg value={per} onChange={(v) => changeOpts({ per: v })} options={[[1, "One"], [2, "Two"], [0, "All"]]} />
                            <p className="text-xs text-base-content/45 leading-relaxed">{per === 1 ? "Each template gets its own page, so the set has variety." : per === 2 ? "Each template is shown with two different pages." : "Every page in every template. Can be hundreds."}</p>
                        </div>
                        <Row title="Multi-screen flows" hint="Several phones or windows of one page at different scroll points. Off keeps every mockup realistic." checked={flow} onChange={(e) => changeOpts({ flow: e.target.checked })} />
                        <Btn icon={Shuffle} disabled={!shots.length} onClick={() => { setSeed(seed + 1); resetFilters(); runAuto(shots, seed + 1); }} className="btn-outline btn-sm w-full">Reshuffle pages and colours</Btn>
                    </div>
                )}

                {tab === "layers" && (
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
                        {view !== "editor" && <p className="text-xs text-base-content/50 leading-relaxed rounded-md bg-base-300/50 p-3">Open a mockup in the Editor to work with its layers.</p>}
                        <Section title="Add a device"><div className="grid grid-cols-5 gap-1">{Object.entries(DEVICES).map(([k, d]) => <button key={k} onClick={() => { setView("editor"); add(k); }} title={`Add ${d.label}`} className="rounded-md py-2 text-[11px] text-base-content/70 bg-base-300/50 hover:bg-base-300 hover:text-base-content ring-1 ring-inset ring-base-content/10">{d.label}</button>)}</div></Section>
                        <Section title="Layers">
                            {doc.layers.length === 0 && <p className="text-xs text-base-content/45">Empty canvas. Add a device above.</p>}
                            <ul className="space-y-0.5">{[...doc.layers].reverse().map((l) => {
                                const I = DEV_ICON[DEVICES[l.device].view] || Monitor;
                                return (
                                    <li key={l.id} onClick={() => setSel(l.id)} className={`group flex items-center gap-2 rounded-md pl-2 pr-1 h-9 text-[13px] cursor-pointer ${sel === l.id ? "bg-primary/15 text-primary" : "hover:bg-base-300/60"}`}>
                                        <I size={14} className="shrink-0 opacity-70" /><span className="flex-1 truncate">{DEVICES[l.device].label}</span>
                                        <span className="hidden group-hover:flex items-center">
                                            <Btn icon={ArrowUp} onClick={(e) => { e.stopPropagation(); order(l.id, 1); }} className="btn-ghost btn-xs px-1" aria-label="Bring forward" />
                                            <Btn icon={ArrowDown} onClick={(e) => { e.stopPropagation(); order(l.id, -1); }} className="btn-ghost btn-xs px-1" aria-label="Send back" />
                                            <Btn icon={Copy} onClick={(e) => { e.stopPropagation(); dup(l.id); }} className="btn-ghost btn-xs px-1" aria-label="Duplicate" />
                                            <Btn icon={Trash2} onClick={(e) => { e.stopPropagation(); remove(l.id); }} className="btn-ghost btn-xs px-1 text-error" aria-label="Remove" />
                                        </span>
                                    </li>);
                            })}</ul>
                        </Section>
                        {layer && doc.layers.length > 1 && layer.shot && <Btn icon={LinkIcon} onClick={() => syncMoment(layer.id, layer.shot)} className="btn-outline btn-sm w-full">Match other devices</Btn>}
                    </div>
                )}

                {tab === "backdrop" && (
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
                        <Section title="Fill"><Seg value={bg.type} onChange={(t) => edit((d) => ({ ...d, bg: { ...d.bg, type: t } }))} options={[["solid", "Solid"], ["gradient", "Gradient"], ["image", "Image"], ["transparent", "Clear"]]} /></Section>
                        {(bg.type === "solid" || bg.type === "gradient") && (<>
                            <Section title="Colour">
                                <div className="flex items-center gap-3"><input type="color" value={bg.a} onPointerDown={mark} onChange={(e) => setBg({ a: e.target.value })} aria-label="First colour" />
                                    {bg.type === "gradient" && <input type="color" value={bg.b} onPointerDown={mark} onChange={(e) => setBg({ b: e.target.value })} aria-label="Second colour" />}</div>
                                {bg.type === "gradient" && <Slider label="Angle" min={0} max={360} value={bg.angle} onStart={mark} onChange={(v) => setBg({ angle: v })} />}
                                <div className="grid grid-cols-8 gap-1.5">{Object.entries(BG).map(([k, v]) => (
                                    <button key={k} title={k} aria-label={k} onClick={() => edit((d) => ({ ...d, bg: v }))} className="h-7 rounded-md ring-1 ring-inset ring-base-content/15 hover:ring-primary" style={{ background: `linear-gradient(${v.angle}deg,${v.a},${v.b})` }} />))}</div>
                            </Section>
                            <Section title="Texture">
                                <Seg value={bg.style || "plain"} onChange={(st) => edit((d) => ({ ...d, bg: { ...d.bg, style: st } }))} options={[["plain", "Plain"], ["mesh", "Mesh"], ["stage", "Stage"]]} />
                                <Row title="Ambient glow" checked={!!bg.glow} onChange={(e) => edit((d) => ({ ...d, bg: { ...d.bg, glow: e.target.checked } }))} />
                            </Section>
                        </>)}
                        {bg.type === "image" && <label className="btn btn-sm btn-outline w-full"><Upload size={14} />{bg.img ? "Replace image" : "Upload image"}<input type="file" accept="image/*" hidden onChange={bgUpload} /></label>}
                        <Section title="Canvas size"><div className="grid grid-cols-2 gap-1.5">{SIZES.map(([l, w, h]) => (
                            <button key={l} onClick={() => { edit((d) => ({ ...d, size: { w, h } })); setTimeout(fit, 0); }} className={`btn btn-xs tabular-nums ${doc.size.w === w && doc.size.h === h ? "btn-primary" : "btn-outline"}`}>{l}</button>))}</div></Section>
                    </div>
                )}
            </aside>

            {/* ── stage */}
            {view === "gallery" && (
                <main className="stage overflow-y-auto min-h-0 relative">
                    <div className="sticky top-0 z-10 bg-base-100/90 backdrop-blur border-b border-base-300 px-5 h-11 flex items-center gap-3">
                        <span className="text-[13px] tabular-nums text-base-content/70">{visible.length} shown{picked.size ? `, ${picked.size} selected` : ""}</span>
                        {cap.busy && <span className="inline-flex items-center gap-1.5 text-xs text-primary"><Loader2 size={12} className="animate-spin" />Capturing, new mockups appear as pages arrive</span>}
                        <div className="ml-auto flex items-center gap-1">
                            <Btn onClick={() => { const next = new Set(picked); for (const a of visible) { if (!next.has(a.id)) { next.add(a.id); warm(a.doc); } } setPicked(next); }} disabled={!visible.length} className="btn-ghost btn-xs">Select shown</Btn>
                            {picked.size > 0 && <Btn onClick={() => setPicked(new Set())} className="btn-ghost btn-xs">Clear</Btn>}
                        </div>
                    </div>
                    {expBar && <div className="px-5 pt-3">{expBar}</div>}
                    {visible.length === 0 ? (
                        <div className="h-[calc(100%-2.75rem)] grid place-items-center p-10">
                            <div className="max-w-xs text-center">
                                {cap.busy ? <Loader2 size={22} className="animate-spin text-primary mx-auto mb-3" /> : <LayoutGrid size={22} className="text-base-content/30 mx-auto mb-3" />}
                                <h2 className="font-display text-base font-semibold">{cap.busy ? "First mockups on the way" : autos.length ? "Nothing matches these filters" : "No mockups yet"}</h2>
                                <p className="mt-1.5 text-[13px] text-base-content/50 leading-relaxed">{cap.busy ? "A mockup shows up as soon as its page has the views it needs. You can open and edit them while the capture continues." : autos.length ? "Pick another page or layout in the Mockups tab." : "Enter a website address on the left and press Capture website."}</p>
                            </div>
                        </div>
                    ) : (<>
                        <div className="p-5 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))" }}>
                            {visible.slice(0, limit).map((a) => (
                                <article key={a.id} className="group" onPointerEnter={() => warmSoon(a.doc)} onPointerLeave={() => clearTimeout(hoverT.current)}>
                                    <div className={`relative overflow-hidden rounded-md ring-1 ring-inset transition ${picked.has(a.id) ? "ring-2 ring-primary" : "ring-base-content/10 group-hover:ring-base-content/30"}`}>
                                        <Thumb item={a} shotsRef={shotsRef} onPick={() => pick(a)} />
                                        <label className={`absolute top-2 left-2 grid place-items-center h-6 w-6 rounded-full cursor-pointer transition ${picked.has(a.id) ? "bg-primary text-primary-content" : "bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`} title="Select">
                                            <input type="checkbox" className="sr-only" aria-label={`Select ${a.name}, ${a.pageLabel}`} checked={picked.has(a.id)} onChange={() => togglePick(a)} />
                                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.4 5 8.8l4.5-5" /></svg>
                                        </label>
                                        <button onClick={() => downloadOne(a)} disabled={dl === a.id} title={`Download ${fmt.toUpperCase()}`} aria-label={`Download ${a.name}`} className="absolute top-2 right-2 grid place-items-center h-6 w-6 rounded-full bg-black/60 text-white/80 hover:text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition">
                                            {dl === a.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                        </button>
                                    </div>
                                    <div className="mt-2 flex items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[13px] font-medium truncate">{a.name}</div>
                                            <div className="text-xs text-base-content/45 truncate">{a.pageLabel === "/" ? "Home" : a.pageLabel}<span className="mx-1.5 text-base-content/25">/</span><span className="tabular-nums">{a.moment}</span></div>
                                        </div>
                                        <div className="flex gap-1 pt-0.5 text-base-content/40">{[...new Set(a.doc.layers.map((l) => DEVICES[l.device].view))].map((v) => { const I = DEV_ICON[v] || Monitor; return <I key={v} size={14} />; })}</div>
                                    </div>
                                </article>
                            ))}
                        </div>
                        {visible.length > limit && <div className="pb-10 text-center"><Btn onClick={() => setLimit((l) => l + 36)} className="btn-outline btn-sm">Show {Math.min(36, visible.length - limit)} more</Btn></div>}
                    </>)}
                </main>
            )}

            {view === "editor" && (
                <main ref={wrap} className="stage relative overflow-auto flex min-h-0">
                    <div className="m-auto p-10">
                        <div className={bg.type === "transparent" ? "checker" : ""} style={{ width: doc.size.w * zoom, height: doc.size.h * zoom, boxShadow: "0 24px 70px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.06)" }}>
                            <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} style={{ width: "100%", height: "100%", cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }} />
                        </div>
                    </div>
                    <div className="absolute left-4 top-4"><input value={name} onChange={(e) => setName(e.target.value)} className="input input-sm w-64 bg-base-200/90" aria-label="Mockup name" /></div>
                    {mismatch && <div role="status" className="absolute left-1/2 -translate-x-1/2 top-4 z-10 flex items-center gap-2 max-w-md rounded-md bg-base-200 ring-1 ring-warning/50 text-warning px-3 py-2 text-xs"><AlertTriangle size={14} className="shrink-0" />{mismatch}</div>}
                    <div className="absolute left-4 bottom-4 flex items-center gap-0.5 bg-base-200/95 ring-1 ring-base-content/10 rounded-md px-1 py-0.5 text-xs">
                        <Btn icon={Minus} className="btn-ghost btn-xs" onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))} aria-label="Zoom out" />
                        <span className="w-28 text-center tabular-nums text-base-content/70">{Math.round(zoom * 100)}%, {doc.size.w}×{doc.size.h}</span>
                        <Btn icon={Plus} className="btn-ghost btn-xs" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} aria-label="Zoom in" />
                        <Btn icon={Maximize} className="btn-ghost btn-xs" onClick={() => fit()} title="Fit to window" aria-label="Fit to window" />
                    </div>
                </main>
            )}

            {view === "shots" && (
                <main className="stage overflow-y-auto min-h-0">
                    {pagesList.length === 0 ? (
                        <div className="h-full grid place-items-center p-10"><div className="max-w-xs text-center"><Camera size={22} className="text-base-content/30 mx-auto mb-3" /><h2 className="font-display text-base font-semibold">No screenshots yet</h2><p className="mt-1.5 text-[13px] text-base-content/50 leading-relaxed">Captured pages appear here, each device lined up by how far down the page it was taken.</p></div></div>
                    ) : (
                        <div className="p-5 space-y-4">
                            <p className="text-[13px] text-base-content/55">{pagesList.length} {pagesList.length === 1 ? "page" : "pages"}, {clean} screenshots ready{flawed ? `, ${flawed} left out` : ""}. The amber tick shows how far down the page a shot was taken.</p>
                            {pagesList.map((p) => (
                                <section key={p.key} className="rounded-lg bg-base-200/70 ring-1 ring-inset ring-base-content/[0.07]">
                                    <header className="flex items-center gap-3 px-4 py-2.5 border-b border-base-300/80">
                                        <h3 className="text-sm font-medium truncate">{p.label === "/" ? "Home" : p.label}</h3>
                                        <span className="ml-auto flex items-center gap-3 text-xs text-base-content/45">{["desktop", "tablet", "mobile"].filter((v) => p.views[v]?.length).map((v) => { const I = DEV_ICON[v]; return <span key={v} className="inline-flex items-center gap-1 tabular-nums"><I size={13} />{p.views[v].length}</span>; })}</span>
                                    </header>
                                    <div className="flex gap-6 overflow-x-auto px-4 py-4 items-start">
                                        {["desktop", "upload", "tablet", "mobile", "full"].filter((v) => p.views[v]?.length).map((v) => <div key={v} className="flex gap-3 shrink-0">{p.views[v].map((s) => <ShotThumb key={s.key} s={s} />)}</div>)}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </main>
            )}

            {/* ── right panel */}
            <aside className="bg-base-200 border-l border-base-300 flex flex-col min-h-0">
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
                    {view === "editor" && (layer ? (<>
                        <h3 className="font-display text-sm font-semibold">{DEVICES[layer.device].label}</h3>
                        <Section title="Screenshot">
                            <select className="select select-sm w-full" value={layer.shot ?? ""} onChange={(e) => (e.target.value ? syncMoment(layer.id, e.target.value) : edit((d) => ({ ...d, layers: d.layers.map((l) => (l.id === layer.id ? { ...l, shot: null } : l)) })))}>
                                <option value="">Auto</option>
                                {shots.filter((s) => !s.flaw && (s.view === DEVICES[layer.device].view || s.view === "upload" || s.view === "full")).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                            <p className="text-xs text-base-content/45 leading-relaxed">Changing it moves the other devices to the same page and scroll point.</p>
                        </Section>
                        <Section title="Position">{sliders([["X", "x", 0, doc.size.w, 1], ["Y", "y", 0, doc.size.h, 1]])}</Section>
                        <Section title="Size and rotation">{sliders([["Scale", "scale", 0.2, 2.5, 0.01], ["Rotate X", "rotX", -60, 60, 1], ["Rotate Y", "rotY", -60, 60, 1], ["Rotate Z", "rotZ", -180, 180, 1], ["Depth", "depth", 0, 0.4, 0.01]])}</Section>
                        <Section title="Finish">
                            {sliders([["Corners", "radius", 0, 2, 0.05], ["Shadow", "shadow", 0, 1, 0.01]])}
                            <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs text-base-content/65"><span>Frame</span><input type="color" value={layer.frame} onPointerDown={mark} onChange={(e) => setLayer(layer.id, { frame: e.target.value })} /></div>
                        </Section>
                    </>) : <div><h3 className="font-display text-sm font-semibold mb-1.5">Selection</h3><p className="text-[13px] text-base-content/50 leading-relaxed">Click a device on the canvas to adjust it. Drag to move it.</p></div>)}
                    {view === "gallery" && (<>
                        <Section title="Selection">
                            <p className="text-[13px] text-base-content/60 tabular-nums">{picked.size} of {autos.length} selected</p>
                            <p className="text-xs text-base-content/45 leading-relaxed">Ticked mockups are prepared in the background, so Download starts at once. Click a mockup to edit it.</p>
                        </Section>
                        {notes.length > 0 && <Section title="Left out">{notes.map((n, i) => <div key={i} className="flex gap-2 text-xs text-base-content/60 leading-relaxed"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />{n}</div>)}</Section>}
                    </>)}
                    {view === "shots" && <Section title="Quality"><p className="text-[13px] text-base-content/60 leading-relaxed">Shots with broken pictures, loading placeholders or empty states are dimmed and never used in a mockup.</p></Section>}
                </div>
                {view !== "shots" && exportBlock}
            </aside>
        </div>
    );
}
