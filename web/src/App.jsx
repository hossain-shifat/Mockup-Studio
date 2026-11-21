import { useEffect, useRef, useState } from "react";
import { Undo2, Redo2, Download, Camera, Layers, Palette, Copy, Trash2, ArrowUp, ArrowDown, Upload, RotateCcw, Loader2, Check, Plus, Minus, Maximize, Mail, Lock, Link2, Eye, EyeOff, Square, Globe, LayoutGrid, ArrowLeft, ChevronDown, Monitor, Smartphone, Tablet as TabletIcon, AlertTriangle, SlidersHorizontal, Sparkles, ScreenShare, Link as LinkIcon } from "lucide-react";
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
const DEV_ICON = { desktop: Monitor, tablet: TabletIcon, mobile: Smartphone };

// ── small ui ─────────────────────────────────────────────────────────────────
const Slider = ({ label, value, min, max, step = 1, onChange, onStart }) => (
    <label className="flex items-center gap-2 text-xs text-base-content/70">
        <span className="w-16 shrink-0">{label}</span>
        <input type="range" className="flex-1" min={min} max={max} step={step} value={value} onPointerDown={onStart} onChange={(e) => onChange(+e.target.value)} />
        <span className="w-10 text-right tabular-nums text-base-content/50">{Math.round(value * 100) / 100}</span>
    </label>
);
const Field = ({ icon: I, label, right, ...p }) => (
    <label className="block">
        {label && <span className="text-xs font-medium text-base-content/60">{label}</span>}
        <span className={`${label ? "mt-1 " : ""}flex items-center gap-2 rounded-md bg-base-300/70 px-3 h-10 transition focus-within:bg-base-300`}>
            <I size={16} className="text-base-content/40 shrink-0" />
            <input {...p} className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-base-content/30" />
            {right}
        </span>
    </label>
);
const Toggle = ({ checked, onChange }) => (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange({ target: { checked: !checked } })}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ${checked ? "bg-primary" : "bg-base-content/25"}`}>
        <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
);
const Row = ({ title, hint, checked, onChange }) => (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span><span className="block text-sm font-medium">{title}</span>{hint && <span className="block text-xs text-base-content/50 leading-relaxed">{hint}</span>}</span>
        <Toggle checked={checked} onChange={onChange} />
    </label>
);
const Section = ({ title, children }) => (
    <div className="space-y-2.5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-base-content/50">{title}</h4>
        {children}
    </div>
);
const Btn = ({ icon: I, children, ...p }) => (
    <button {...p} className={`btn btn-sm ${p.className ?? "btn-ghost"}`}>{I && <I size={15} />}{children}</button>
);
// one collapsible group, so the capture screen shows the essentials first and the rest on demand
const Group = ({ icon: I, title, summary, children, open: o = false }) => {
    const [open, setOpen] = useState(o);
    return (
        <div className="rounded-box border border-base-300 bg-base-200/60">
            <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <I size={16} className="text-base-content/50" />
                <span className="flex-1 text-sm font-medium">{title}</span>
                {summary && <span className="text-xs text-base-content/50 truncate max-w-48">{summary}</span>}
                <ChevronDown size={16} className={`text-base-content/40 transition ${open ? "rotate-180" : ""}`} />
            </button>
            {open && <div className="px-4 pb-4 pt-1 space-y-4 border-t border-base-300/70">{children}</div>}
        </div>
    );
};

function Thumb({ item, shots, onPick }) {
    const box = useRef(null), cv = useRef(null), [vis, setVis] = useState(false), [n, bump] = useState(0);
    const onImg = useRef(() => bump((x) => x + 1)).current;
    useEffect(() => {
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect(); } }, { rootMargin: "300px" });
        io.observe(box.current); return () => io.disconnect();
    }, []);
    useEffect(() => {
        if (!vis) return;
        const c = cv.current, { w, h } = item.doc.size, k = 400 / w;
        c.width = 400; c.height = Math.round(h * k);
        drawScene(c.getContext("2d"), item.doc, k, { shotFor: (l) => shots.find((s) => s.key === l.shot)?.src ?? null, onLoad: onImg });
    }, [vis, item, shots, n, onImg]);
    return (
        <button ref={box} onClick={onPick} className="block w-full bg-base-300" style={{ aspectRatio: `${item.doc.size.w} / ${item.doc.size.h}` }}>
            <canvas ref={cv} className="w-full h-full block" />
        </button>
    );
}

export default function App() {
    // ── core state
    const [doc, setDoc] = useState(fresh);
    const [name, setName] = useState("Untitled mockup");
    const [sel, setSel] = useState(null);
    const [shots, setShots] = useState([]);
    const [stage, setStage] = useState("capture"); // capture → mockups → edit
    const [panel, setPanel] = useState("device"); // editor inspector tab
    const [autos, setAutos] = useState([]);
    const [notes, setNotes] = useState([]);
    const [seed, setSeed] = useState(0);
    const [flow, setFlow] = useState(() => lsGet("ms:flow", "0") === "1"); // multi-screen flow layouts (different moments of one page on several phones)
    const [orig, setOrig] = useState(null);

    // ── capture settings
    const [url, setUrl] = useState(() => lsGet("ms:url", ""));
    const [mode, setMode] = useState(() => (HOSTED ? lsGet("ms:mode", "hosted") : "local"));
    const localAddr = isLocalAddr(url);
    const base = mode === "hosted" && HOSTED && !localAddr ? HOSTED.trim().replace(/\/+$/, "") : LOCAL;
    const [srv, setSrv] = useState({ state: "checking", version: "" });
    const [cap, setCap] = useState({ busy: false, msg: "", done: 0, total: 0, error: null, note: "", scrollNote: "", shots: 0, summary: "" });
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
    const sessRef = useRef(null);
    sessRef.current = sessionInfo;

    // ── gallery state
    const [picked, setPicked] = useState(() => new Set());
    const [tplF, setTplF] = useState("all");
    const [pageF, setPageF] = useState("all");
    const [kindF, setKindF] = useState("all");
    const [limit, setLimit] = useState(36);
    const [exp, setExp] = useState({ busy: false, done: 0, total: 0, msg: "" });
    const [asZip, setAsZip] = useState(true);

    // ── editor state
    const [zoom, setZoom] = useState(0.5);
    const [tick, setTick] = useState(0);
    const onImg = useRef(() => setTick((t) => t + 1)).current;
    const [fmt, setFmt] = useState("png");
    const [res, setRes] = useState(1);
    const cv = useRef(null), wrap = useRef(null), drag = useRef(null);
    const docRef = useRef(doc); docRef.current = doc;
    const past = useRef([]), fut = useRef([]);

    useEffect(() => { // closing the studio tab ends the sign-in on the site
        const f = () => { const s = sessRef.current; if (s) navigator.sendBeacon(`${s.base}/api/session/end`, new Blob([JSON.stringify({ sessionId: s.id })], { type: "application/json" })); };
        window.addEventListener("pagehide", f); return () => window.removeEventListener("pagehide", f);
    }, []);
    useEffect(() => { document.fonts?.ready.then(() => setTick((t) => t + 1)); }, []);
    useEffect(() => { try { localStorage.setItem("ms:email", login.email); localStorage.setItem("ms:loginUrl", login.url); localStorage.setItem("ms:url", url); localStorage.setItem("ms:mode", mode); localStorage.setItem("ms:flow", flow ? "1" : "0"); } catch { /* private mode */ } }, [login.email, login.url, url, mode, flow]);
    useEffect(() => { // is the capture server reachable? A sleeping hosted server gets about a minute to wake.
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
        const hit = l.shot && shots.find((s) => s.key === l.shot || s.view === l.shot);
        if (hit) return hit.src;
        const want = DEVICES[l.device].view;
        const m = [...shots].reverse().find((s) => s.view === want && !s.flaw) ?? shots[shots.length - 1];
        return m?.src ?? null;
    };

    useEffect(() => {
        if (stage !== "edit" || !cv.current) return;
        const c = cv.current; c.width = doc.size.w; c.height = doc.size.h;
        drawScene(c.getContext("2d"), doc, 1, { sel, shotFor, onLoad: onImg });
    }); // eslint-disable-line
    const fit = (s) => { if (!wrap.current) return; const z = s?.w ? s : doc.size, r = wrap.current.getBoundingClientRect(); setZoom(Math.max(0.1, Math.min((r.width - 80) / z.w, (r.height - 80) / z.h))); };
    useEffect(() => { if (stage === "edit") setTimeout(fit, 0); }, [stage]); // eslint-disable-line
    useEffect(() => {
        const k = (e) => {
            if (stage !== "edit" || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
            if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
            if ((e.key === "Delete" || e.key === "Backspace") && docRef.current.layers.some((l) => l.id === sel)) remove(sel);
        };
        window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
    }); // eslint-disable-line

    // ── canvas pointer
    const pt = (e) => { const r = cv.current.getBoundingClientRect(); return [((e.clientX - r.left) * doc.size.w) / r.width, ((e.clientY - r.top) * doc.size.h) / r.height]; };
    const down = (e) => {
        const [x, y] = pt(e), id = hitTest(doc.layers, x, y); setSel(id); if (id) setPanel("device");
        if (id) { mark(); const l = doc.layers.find((q) => q.id === id); drag.current = { id, dx: l.x - x, dy: l.y - y }; e.currentTarget.setPointerCapture(e.pointerId); }
    };
    const move = (e) => { if (!drag.current) return; const [x, y] = pt(e); setLayer(drag.current.id, { x: Math.round(x + drag.current.dx), y: Math.round(y + drag.current.dy) }); };

    // ── layer ops
    const add = (device) => { const l = mk(device, { x: doc.size.w / 2, y: doc.size.h / 2 }); edit((d) => ({ ...d, layers: [...d.layers, l] })); setSel(l.id); setPanel("device"); };
    const remove = (id) => { edit((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) })); setSel(null); };
    const dup = (id) => { const l = doc.layers.find((q) => q.id === id), n = { ...l, id: uid++, x: l.x + 40, y: l.y + 40 }; edit((d) => ({ ...d, layers: [...d.layers, n] })); setSel(n.id); };
    const order = (id, dir) => edit((d) => { const a = [...d.layers], i = a.findIndex((l) => l.id === id), j = i + dir; if (j < 0 || j >= a.length) return d; [a[i], a[j]] = [a[j], a[i]]; return { ...d, layers: a }; });
    // pick a screenshot for one device, then make every other device show the SAME page at the same point (what a real site would show)
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
    // does this mockup mix pages or moments? The editor warns instead of silently exporting something unrealistic.
    const mismatch = (() => {
        const ls = doc.layers.filter((l) => l.shot).map((l) => shots.find((s) => s.key === l.shot)).filter(Boolean);
        if (ls.length < 2) return "";
        const devs = new Set(doc.layers.map((l) => l.device));
        if (devs.size === 1 && doc.layers.length > 1) return ""; // several screens of one device are a flow on purpose
        if (new Set(ls.map((s) => s.page)).size > 1) return "These devices show different pages. A real site would show the same page on every device.";
        const ps = ls.map((s) => s.pos ?? 0);
        return Math.max(...ps) - Math.min(...ps) > 0.2 ? "These devices show different parts of the page. Use “Match other devices” on one of them." : "";
    })();

    // ── auto mockups
    const runAuto = async (list, sd = seed, o = {}) => {
        const { items, skipped } = await generate(list, sd, { flow: o.flow ?? flow });
        setAutos(items); setNotes(skipped); setPicked(new Set()); setLimit(36); setPageF("all"); setTplF("all"); setKindF("all");
        if (o.go !== false && items.length) setStage("mockups");
        return items;
    };
    const pick = (a) => { mark(); setDoc(a.doc); setOrig(a); setName(`${a.pageLabel === "/" ? "Home" : a.pageLabel.replace(/^\//, "")} · ${a.name}`); setSel(null); setPanel("device"); setStage("edit"); };
    const toggleFlow = async (v) => { setFlow(v); if (shots.length) await runAuto(shots, seed, { flow: v, go: false }); };

    // ── capture
    const stopScreen = () => { screenRef.current?.stream.getTracks().forEach((t) => t.stop()); screenRef.current = null; setScreen((s) => ({ ...s, on: false })); };
    const startScreen = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
            const v = document.createElement("video"); v.srcObject = stream; v.muted = true; await v.play();
            stream.getVideoTracks()[0].addEventListener("ended", stopScreen);
            screenRef.current = { stream, v, lastPage: null };
            setScreen((s) => ({ ...s, on: true }));
            setCap((s) => ({ ...s, error: null }));
        } catch (e) { setCap((s) => ({ ...s, error: e.name === "NotAllowedError" ? "Screen sharing was cancelled." : `Could not start screen capture: ${e.message}` })); }
    };
    const grab = async () => {
        const r = screenRef.current; if (!r || !r.v.videoWidth) return;
        const c = document.createElement("canvas"); c.width = r.v.videoWidth; c.height = r.v.videoHeight; c.getContext("2d").drawImage(r.v, 0, 0);
        const ar = c.width / c.height, view = ar < 0.62 ? "mobile" : ar < 0.9 ? "tablet" : "desktop"; // a narrow window becomes a phone view
        const n = screen.count + 1, pageKey = samePage && r.lastPage ? r.lastPage : `scr-${Date.now()}`;
        r.lastPage = pageKey;
        const sec = shots.filter((s) => s.page === pageKey && s.view === view).length;
        const shot = { key: `${pageKey}-${view}-${sec}`, page: pageKey, label: `Screen grab ${n} \u00b7 ${view}`, view, sec, pos: Math.min(1, sec * 0.4), flaw: "", title: `Screen ${n}`, host: "", src: c.toDataURL("image/png") };
        const next = [...shots, shot];
        setShots(next); setScreen((s) => ({ ...s, count: n }));
        await runAuto(next, seed, { go: false });
    };
    const diagnose = async () => {
        try { await fetch(`${base}/health`, { mode: "no-cors" }); return `The server answered but blocked this website. On the server set ALLOWED_ORIGINS to exactly ${location.origin} (no slash at the end), then retry.`; }
        catch { return base !== LOCAL ? "Cannot reach the hosted server. A free instance sleeps when idle and needs about a minute to wake. Try again shortly." : "Cannot reach the server on this computer. Double-click Start-Capture-Server.bat in the project folder, or use Capture from your screen. If the browser asks to allow local network access, allow it."; }
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
        const items = await runAuto(got, seed);
        if (!items.length) setCap((s) => ({ ...s, busy: false, error: "Screenshots arrived, but none were mockup-ready (broken pictures, pages still loading, empty states, or a missing phone or tablet view). Try again, or lower the page limit." }));
    };
    const capture = async () => {
        let target = url.trim();
        if (target && !/^https?:\/\//i.test(target)) { target = `http://${target}`; setUrl(target); }
        setCap({ busy: true, msg: "Starting…", done: 0, total: 0, error: null, note: "", scrollNote: "", shots: 0, summary: "" });
        setShots([]); setAutos([]);
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
                        const shot = { key: `${stamp}-${m.shot.page}-${m.shot.view}-${sec}`, page: `${stamp}-${m.shot.page}`, label: `${m.shot.path} · ${m.shot.view}${sec ? ` #${sec + 1}` : ""}`, view: m.shot.view, sec, pos: m.shot.pos ?? 0, flaw: m.shot.flaw || "", score: m.shot.score, title: m.shot.title, brand: m.shot.brand, h1: m.shot.h1, host: (() => { try { return new URL(target).hostname; } catch { return ""; } })(), src: m.shot.src };
                        got.push(shot); setShots((s) => [...s, shot]); setCap((s) => ({ ...s, shots: (s.shots || 0) + 1 }));
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
            setCap((s) => ({ ...s, busy: false, error: msg }));
        }
    };
    const upload = async (e) => {
        const next = []; for (const f of e.target.files) { const k = `up-${uid++}`; next.push({ key: k, page: k, label: f.name, view: "upload", pos: 0, flaw: "", src: await readFile(f) }); }
        const all = [...shots, ...next]; setShots(all); e.target.value = ""; await runAuto(all, seed);
    };
    const bgUpload = async (e) => { const f = e.target.files[0]; if (f) edit((d) => ({ ...d, bg: { ...d.bg, type: "image", img: URL.createObjectURL(f) } })); e.target.value = ""; };

    // ── export
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
    const ext = () => (fmt === "jpeg" ? "jpg" : "png");
    const saveBlob = (b, nm) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nm; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const exportImg = async () => {
        const b = await renderBlob(doc), nm = (name || "mockup").replace(/[^\w-]+/g, "-");
        if (asZip) saveBlob(makeZip([{ name: `${nm}.${ext()}`, data: new Uint8Array(await b.arrayBuffer()) }]), `${nm}.zip`);
        else saveBlob(b, `${nm}.${ext()}`);
    };
    const exportMany = async (list, label, forceZip = false) => {
        if (!list.length || exp.busy) return;
        if (list.length === 1 && !asZip && !forceZip) { saveBlob(await renderBlob(list[0].doc), `${list[0].file}.${ext()}`); return; }
        const px = list.reduce((a, m) => { const { w, h } = m.doc.size, k = Math.min(RES[res][1](w), 8192 / Math.max(w, h)); return a + w * h * k * k; }, 0);
        const gb = (px * (fmt === "png" ? 1.5 : 0.3)) / 1e9;
        if (gb > 1.5 && !window.confirm(`About ${gb.toFixed(1)} GB of images. JPEG and a lower resolution are much smaller. Continue?`)) return;
        let w = null; // one ZIP, streamed straight to disk (Edge/Chrome). Must run before any await: needs the click.
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
                const z = zipStream(w);
                for (const a of list) {
                    if (z.size() > 3.8e9) break;
                    const b = await renderBlob(a.doc);
                    await z.add(`${a.file}.${ext()}`, new Uint8Array(await b.arrayBuffer()));
                    saved++; setExp((e) => ({ ...e, done: saved }));
                }
                await z.finish(); await w.close();
            } else {
                const CH = gb < 1.2 ? list.length : 30; let part = 0;
                for (let i = 0; i < list.length; i += CH) {
                    const files = [];
                    for (const a of list.slice(i, i + CH)) {
                        const b = await renderBlob(a.doc);
                        files.push({ name: `${a.file}.${ext()}`, data: new Uint8Array(await b.arrayBuffer()) });
                        saved++; setExp((e) => ({ ...e, done: saved }));
                    }
                    saveBlob(makeZip(files), `mockups-${label}${list.length > CH ? `-part${++part}` : ""}.zip`);
                    await new Promise((r) => setTimeout(r, 400));
                }
            }
            setExp({ busy: false, done: 0, total: 0, msg: saved < list.length ? `Saved ${saved} of ${list.length}. ZIP size limit hit. Use JPEG or a lower resolution for the rest.` : `Saved ${saved} mockups` });
        } catch (e) {
            if (w) await w.abort().catch(() => {});
            setExp({ busy: false, done: 0, total: 0, msg: `Export failed: ${e.message}` });
        }
        setTimeout(() => setExp((e) => (e.busy ? e : { ...e, msg: "" })), 9000);
    };
    const exportAll = () => exportMany(visible.length ? visible : autos, "all", true);
    const togglePick = (id) => setPicked((p) => { const q = new Set(p); if (q.has(id)) q.delete(id); else q.add(id); return q; });

    const visible = autos.filter((a) => (tplF === "all" || a.name === tplF) && (pageF === "all" || String(a.pageIndex) === pageF) && (kindF === "all" || a.kind === kindF));
    const outK = Math.min(RES[res][1](doc.size.w), 8192 / Math.max(doc.size.w, doc.size.h));
    const sliders = (rows) => (layer ? rows.map(([label, key, min, max, step]) => <Slider key={key} label={label} min={min} max={max} step={step} value={layer[key]} onStart={mark} onChange={(v) => setLayer(layer.id, { [key]: v })} />) : null);
    const tplNames = [...new Set(autos.filter((a) => kindF === "all" || a.kind === kindF).map((a) => a.name))];
    const pageOpts = [...new Map(autos.map((a) => [a.pageIndex, a.pageLabel]))];
    const kinds = ["all", ...new Set(autos.map((a) => a.kind))];
    const bg = doc.bg, setBg = (p) => setDoc((d) => ({ ...d, bg: { ...d.bg, ...p } }));
    const expBar = exp.busy
        ? <div className="text-xs text-base-content/70">Exporting {exp.done} of {exp.total}…<progress className="progress progress-primary w-full mt-1" value={exp.done} max={exp.total} /></div>
        : exp.msg ? <div role="status" className="text-xs text-success">{exp.msg}</div> : null;
    const clean = shots.filter((s) => !s.flaw).length, flawed = shots.length - clean;
    const STEPS = [["capture", "1", "Capture"], ["mockups", "2", "Mockups"], ["edit", "3", "Edit & export"]];
    const srvText = srv.state === "online" ? `Capture server online${srv.version ? ` · v${srv.version}` : ""}` : srv.state === "checking" ? (base !== LOCAL ? "Checking server. A free hosted server can take about a minute to wake…" : "Checking server…") : srv.state === "blocked" ? `Server answered but blocks this website. Set ALLOWED_ORIGINS to ${location.origin}` : base === LOCAL ? "Server not running. Double-click Start-Capture-Server.bat, or use “Share a tab” below." : "Hosted server not reachable.";

    return (
        <div className="h-full flex flex-col bg-base-100 text-base-content">
            {/* ── top bar: brand, the three steps, and only the actions that matter for the current step */}
            <header className="h-14 shrink-0 flex items-center gap-4 px-5 bg-base-200 border-b border-base-300">
                <div className="font-display font-bold text-lg tracking-tight flex items-center gap-2 min-w-40">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary" />Mockup Studio
                </div>
                <nav className="flex items-center gap-1 mx-auto" aria-label="Steps">
                    {STEPS.map(([id, n, label], i) => {
                        const enabled = id === "capture" || (id === "mockups" && autos.length > 0) || (id === "edit" && autos.length > 0);
                        return (
                            <div key={id} className="flex items-center gap-1">
                                {i > 0 && <span className="w-6 h-px bg-base-300" />}
                                <button disabled={!enabled} onClick={() => setStage(id)} aria-current={stage === id ? "step" : undefined}
                                    className={`flex items-center gap-2 rounded-md px-3 h-9 text-sm transition ${stage === id ? "bg-base-300 text-base-content font-medium" : "text-base-content/60 hover:text-base-content disabled:opacity-35 disabled:hover:text-base-content/60"}`}>
                                    <span className={`grid place-items-center h-5 w-5 rounded-full text-[11px] font-semibold ${stage === id ? "bg-primary text-primary-content" : "bg-base-300 text-base-content/70"}`}>{n}</span>{label}
                                </button>
                            </div>
                        );
                    })}
                </nav>
                <div className="min-w-40 flex items-center justify-end gap-1">
                    {stage === "edit" && (<>
                        <Btn icon={Undo2} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo" />
                        <Btn icon={Redo2} onClick={redo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" />
                        <Btn icon={RotateCcw} onClick={() => { if (orig) { mark(); setDoc(orig.doc); setSel(null); } }} title="Back to the generated layout" aria-label="Reset" />
                    </>)}
                    {stage === "mockups" && <Btn icon={Download} disabled={!autos.length || exp.busy} onClick={exportAll} className="btn-outline">Export {visible.length === autos.length ? "all" : `${visible.length} shown`}</Btn>}
                </div>
            </header>

            {/* ───────────────────────── STEP 1: CAPTURE ───────────────────────── */}
            {stage === "capture" && (
                <main className="flex-1 overflow-y-auto stage">
                    <div className="mx-auto w-full max-w-2xl px-6 py-12 space-y-8">
                        <div className="space-y-2 text-center">
                            <h1 className="font-display text-3xl font-semibold tracking-tight">Turn any website into mockups</h1>
                            <p className="text-sm text-base-content/60 leading-relaxed">Paste an address. Every page is captured on desktop, tablet and phone, and each mockup shows the <em>same page</em> on all of its devices.</p>
                        </div>

                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <div className="flex-1"><Field icon={Globe} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !cap.busy && url && capture()} placeholder="example.com" spellCheck={false} aria-label="Website address" /></div>
                                <button onClick={capture} disabled={cap.busy || !url} className="btn btn-primary h-10 min-h-10 px-5">
                                    {cap.busy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}{cap.busy ? "Capturing…" : "Capture"}
                                </button>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-base-content/60">
                                <span className={`h-2 w-2 rounded-full ${srv.state === "online" ? "bg-success" : srv.state === "checking" ? "bg-warning animate-pulse" : "bg-error"}`} />
                                <span>{srvText}</span>
                                {srv.state === "online" && srv.version && srv.version !== VERSION && <span className="text-warning">· studio is v{VERSION}</span>}
                            </div>
                            {HOSTED && mode === "hosted" && localAddr && <p className="text-xs text-base-content/60 leading-relaxed">This address only exists on your own network, so the capture runs on your computer. Start the server there with npm run dev.</p>}
                        </div>

                        {cap.busy && (
                            <div className="rounded-box border border-base-300 bg-base-200/70 p-4 space-y-3">
                                <div className="flex items-center gap-2 text-sm"><Loader2 size={15} className="animate-spin text-primary" /><span className="truncate">{cap.msg}</span><span className="ml-auto text-xs text-base-content/50 shrink-0">{cap.shots} screenshots</span></div>
                                {cap.total > 0 && <progress className="progress progress-primary w-full" value={cap.done} max={cap.total} />}
                                <Btn icon={Square} onClick={() => abortRef.current?.abort()} className="btn-outline btn-xs">Stop and use what is captured</Btn>
                            </div>
                        )}
                        {cap.error && <div role="alert" className="flex gap-2 rounded-box bg-error/10 p-3 text-sm text-error leading-relaxed"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{cap.error}</span></div>}
                        {!cap.busy && (cap.summary || cap.note || cap.scrollNote) && (
                            <div role="status" className="rounded-box bg-base-200/70 p-3 text-xs text-base-content/70 leading-relaxed space-y-1">
                                {cap.summary && <p className="text-success">{cap.summary}</p>}
                                {cap.scrollNote && <p>{cap.scrollNote}</p>}
                                {cap.note && <p className="text-success">{cap.note}</p>}
                            </div>
                        )}
                        {autos.length > 0 && !cap.busy && (
                            <button onClick={() => setStage("mockups")} className="btn btn-outline w-full"><LayoutGrid size={16} />View {autos.length} mockups</button>
                        )}

                        <div className="space-y-2">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-base-content/50">Options</h2>
                            <Group icon={SlidersHorizontal} title="What to capture" summary={`${crawl ? `up to ${maxPages} pages` : "this page only"} · ${sections} sections`} open>
                                <Row title="Explore every page" hint="Follow links on the same site." checked={crawl} onChange={(e) => setCrawl(e.target.checked)} />
                                {crawl && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs text-base-content/60"><span>Page limit</span><span className="tabular-nums text-sm text-base-content">{maxPages}</span></div>
                                        <input type="range" min={1} max={100} value={maxPages} onChange={(e) => setMaxPages(+e.target.value)} className="w-full" aria-label="Page limit" />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs text-base-content/60"><span>Sections per page (top, middle, bottom…)</span><span className="tabular-nums text-sm text-base-content">{sections}</span></div>
                                    <input type="range" min={1} max={5} value={sections} onChange={(e) => setSections(+e.target.value)} className="w-full" aria-label="Sections per page" />
                                </div>
                            </Group>
                            <Group icon={Lock} title="Sign in to the site" summary={login.open ? (sessionInfo ? `signed in as ${sessionInfo.as}` : login.email || "on") : "off"} open={login.open}>
                                <Row title="Use a login" hint="For sites behind a sign-in page." checked={login.open} onChange={(e) => setLogin({ ...login, open: e.target.checked })} />
                                {login.open && (<>
                                    <Field icon={Mail} label="Email or username" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} placeholder="you@example.com" autoComplete="off" spellCheck={false} />
                                    <Field icon={Lock} label="Password" type={showPw ? "text" : "password"} value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && !cap.busy && url && capture()} placeholder={sessionInfo ? "Not needed while signed in" : "Enter password"} autoComplete="new-password"
                                        right={<button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} className="text-base-content/50 hover:text-base-content cursor-pointer">{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>} />
                                    <Field icon={Link2} label="Login page (optional)" value={login.url} onChange={(e) => setLogin({ ...login, url: e.target.value })} placeholder="Only if different from the address above" spellCheck={false} />
                                    {sessionInfo && (
                                        <div className="flex items-center justify-between gap-2 rounded-md bg-success/10 px-3 py-2 text-xs text-success"><span className="truncate">Signed in as {sessionInfo.as}</span><button onClick={endSession} className="btn btn-xs btn-ghost text-success">Sign out</button></div>
                                    )}
                                    <Row title="Stay signed in between captures" checked={keepIn} onChange={(e) => setKeepIn(e.target.checked)} />
                                    <p className="text-xs text-base-content/50 leading-relaxed">The password is never saved or logged, and is cleared after capture. You are signed out when you press Sign out, after 10 idle minutes, or when you close this tab.</p>
                                </>)}
                            </Group>
                            {HOSTED && (
                                <Group icon={Globe} title="Capture from" summary={mode === "hosted" ? "hosted server" : "this computer"}>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => setMode("local")} className={`btn btn-sm ${mode === "local" ? "btn-primary" : "btn-outline"}`}>This computer</button>
                                        <button onClick={() => setMode("hosted")} className={`btn btn-sm ${mode === "hosted" ? "btn-primary" : "btn-outline"}`}>Hosted server</button>
                                    </div>
                                    {mode === "hosted" && !localAddr && /ngrok/i.test(url) && <p className="text-xs text-base-content/60 leading-relaxed">ngrok address: keep ngrok and your site running while it captures.</p>}
                                </Group>
                            )}
                        </div>

                        <div className="space-y-2">
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-base-content/50">No server? Other ways in</h2>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <div className="rounded-box border border-base-300 bg-base-200/60 p-4 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium"><ScreenShare size={16} className="text-base-content/50" />Share a browser tab</div>
                                    <p className="text-xs text-base-content/50 leading-relaxed">Open your site in another tab, share it, press Grab on each page. A narrow window becomes a phone view.</p>
                                    {!screen.on ? <Btn icon={Camera} onClick={startScreen} className="btn-outline btn-sm w-full">Share a tab</Btn> : (
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-2 gap-2"><Btn icon={Camera} onClick={grab} className="btn-primary btn-sm">Grab ({screen.count})</Btn><Btn icon={Square} onClick={stopScreen} className="btn-outline btn-sm">Stop</Btn></div>
                                            <Row title="Same page as last grab" checked={samePage} onChange={(e) => setSamePage(e.target.checked)} />
                                        </div>
                                    )}
                                </div>
                                <div className="rounded-box border border-base-300 bg-base-200/60 p-4 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium"><Upload size={16} className="text-base-content/50" />Upload screenshots</div>
                                    <p className="text-xs text-base-content/50 leading-relaxed">Each image becomes its own page. The same image is shown on every device in a mockup.</p>
                                    <label className="btn btn-outline btn-sm w-full"><Upload size={15} />Choose images<input type="file" accept="image/*" multiple hidden onChange={upload} /></label>
                                </div>
                            </div>
                        </div>

                        {shots.length > 0 && (
                            <Group icon={Layers} title="Captured screenshots" summary={`${clean} ready${flawed ? ` · ${flawed} left out` : ""}`}>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {shots.map((s) => (
                                        <div key={s.key} className="group" title={s.flaw ? `Not used: ${s.flaw}` : s.label}>
                                            <div className={`relative aspect-[4/3] rounded-md overflow-hidden bg-base-300 border ${s.flaw ? "border-warning/60" : "border-base-300"}`}>
                                                <img src={s.src} alt={s.label} loading="lazy" decoding="async" className={`w-full h-full object-cover object-top ${s.flaw ? "opacity-40" : ""}`} />
                                                {s.flaw && <span className="absolute inset-x-0 bottom-0 bg-warning/90 text-warning-content text-[10px] px-1.5 py-0.5 truncate">{s.flaw}</span>}
                                            </div>
                                            <div className="text-[11px] text-base-content/60 truncate mt-1">{s.label}</div>
                                        </div>
                                    ))}
                                </div>
                            </Group>
                        )}
                        <p className="text-center text-[11px] text-base-content/35">Studio v{VERSION}{SHA !== "dev" ? ` · ${SHA}` : ""}</p>
                    </div>
                </main>
            )}

            {/* ───────────────────────── STEP 2: MOCKUPS ───────────────────────── */}
            {stage === "mockups" && (
                <div className="flex-1 min-h-0 grid grid-cols-[16rem_1fr]">
                    <aside className="bg-base-200 border-r border-base-300 overflow-y-auto p-4 space-y-6">
                        <Section title="Page">
                            <div className="space-y-0.5">
                                {[["all", `All pages (${pageOpts.length})`], ...pageOpts.map(([i, l]) => [String(i), l === "/" ? "Home" : l])].map(([v, l]) => (
                                    <button key={v} onClick={() => { setPageF(v); setLimit(36); }} className={`w-full text-left truncate rounded-md px-2.5 py-1.5 text-sm ${pageF === v ? "bg-primary/15 text-primary" : "hover:bg-base-300"}`}>{l}</button>
                                ))}
                            </div>
                        </Section>
                        <Section title="Layout type">
                            <div className="space-y-0.5">
                                {kinds.map((k) => (
                                    <button key={k} onClick={() => { setKindF(k); setTplF("all"); setLimit(36); }} className={`w-full text-left rounded-md px-2.5 py-1.5 text-sm ${kindF === k ? "bg-primary/15 text-primary" : "hover:bg-base-300"}`}>{k === "all" ? "All layouts" : KIND[k]}</button>
                                ))}
                            </div>
                            <select className="select select-sm w-full" value={tplF} onChange={(e) => { setTplF(e.target.value); setLimit(36); }} aria-label="Template">
                                <option value="all">Any template</option>{tplNames.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </Section>
                        <Section title="Options">
                            <Row title="Multi-screen flows" hint="Several phones or windows of one page at different scroll points. Off by default so every mockup stays realistic." checked={flow} onChange={(e) => toggleFlow(e.target.checked)} />
                            <Btn icon={Sparkles} onClick={() => { setSeed(seed + 1); runAuto(shots, seed + 1, { go: false }); }} className="btn-outline btn-sm w-full">Shuffle colours & moments</Btn>
                            <Btn icon={ArrowLeft} onClick={() => setStage("capture")} className="btn-ghost btn-sm w-full">Capture more</Btn>
                        </Section>
                    </aside>
                    <main className="overflow-y-auto">
                        <div className="sticky top-0 z-10 bg-base-100/95 backdrop-blur border-b border-base-300 px-5 h-14 flex items-center gap-3">
                            <h2 className="font-display text-base font-semibold">{visible.length} mockups <span className="text-sm font-normal text-base-content/50">· {picked.size} selected</span></h2>
                            <Btn onClick={() => setPicked(new Set([...picked, ...visible.map((a) => a.id)]))} className="btn-outline btn-xs">Select shown</Btn>
                            <Btn onClick={() => setPicked(new Set())} disabled={!picked.size} className="btn-ghost btn-xs">Clear</Btn>
                            <div className="ml-auto flex items-center gap-3">
                                <label className="flex items-center gap-2 text-xs text-base-content/70 cursor-pointer">Format
                                    <select className="select select-xs w-20" value={fmt} onChange={(e) => setFmt(e.target.value)}><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label>
                                <label className="flex items-center gap-2 text-xs text-base-content/70 cursor-pointer">Size
                                    <select className="select select-xs w-20" value={res} onChange={(e) => setRes(+e.target.value)}>{RES.map(([l], i) => <option key={l} value={i}>{l}</option>)}</select></label>
                                <Btn icon={Download} disabled={!picked.size || exp.busy} onClick={() => exportMany(autos.filter((a) => picked.has(a.id)), "selected")} className="btn-primary btn-sm">Download selected</Btn>
                            </div>
                        </div>
                        {(notes.length > 0 || expBar) && (
                            <div className="px-5 pt-4 space-y-2">
                                {notes.map((n, i) => <div key={i} className="flex gap-2 text-xs text-base-content/60 bg-base-200 rounded-md px-3 py-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />{n}</div>)}
                                {expBar}
                            </div>
                        )}
                        <div className="p-5 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
                            {visible.slice(0, limit).map((a) => (
                                <div key={a.id} className={`relative rounded-box overflow-hidden bg-base-200 border transition ${picked.has(a.id) ? "border-primary ring-1 ring-primary/60" : "border-base-300 hover:border-base-content/30"}`}>
                                    <input type="checkbox" aria-label={`Select ${a.name}, ${a.pageLabel}`} checked={picked.has(a.id)} onChange={() => togglePick(a.id)} className="checkbox checkbox-sm checkbox-primary absolute top-2 left-2 z-10 bg-base-100/80" />
                                    <Thumb item={a} shots={shots} onPick={() => pick(a)} />
                                    <div className="px-3 py-2.5 text-xs flex items-center gap-2">
                                        <div className="min-w-0 flex-1"><div className="font-medium truncate text-sm">{a.name}</div><div className="text-base-content/50 truncate">{a.pageLabel === "/" ? "Home" : a.pageLabel} · {a.moment}</div></div>
                                        <div className="flex gap-1 text-base-content/40">{[...new Set(a.doc.layers.map((l) => DEVICES[l.device].view))].map((v) => { const I = DEV_ICON[v] || Monitor; return <I key={v} size={14} />; })}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {visible.length > limit && <div className="pb-10 text-center"><Btn onClick={() => setLimit((l) => l + 36)} className="btn-outline btn-sm">Show more ({visible.length - limit} left)</Btn></div>}
                        {visible.length === 0 && <p className="p-10 text-center text-sm text-base-content/50">No mockups match these filters.</p>}
                    </main>
                </div>
            )}

            {/* ───────────────────────── STEP 3: EDIT & EXPORT ───────────────────────── */}
            {stage === "edit" && (
                <div className="flex-1 min-h-0 grid grid-cols-[1fr_20rem]">
                    <main ref={wrap} className="stage relative overflow-auto flex">
                        <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
                            <Btn icon={ArrowLeft} onClick={() => setStage("mockups")} className="btn-outline btn-sm">All mockups</Btn>
                            <input value={name} onChange={(e) => setName(e.target.value)} className="input input-sm w-64" aria-label="Mockup name" />
                        </div>
                        <div className="m-auto p-10 pt-16">
                            <div className={bg.type === "transparent" ? "checker" : ""} style={{ width: doc.size.w * zoom, height: doc.size.h * zoom, boxShadow: "0 30px 80px rgba(0,0,0,.55)" }}>
                                <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} style={{ width: "100%", height: "100%", cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }} />
                            </div>
                        </div>
                        {mismatch && <div className="absolute left-1/2 -translate-x-1/2 top-4 z-10 flex items-center gap-2 max-w-md rounded-md bg-warning/15 border border-warning/40 text-warning px-3 py-2 text-xs"><AlertTriangle size={14} className="shrink-0" />{mismatch}</div>}
                        <div className="absolute left-4 bottom-4 flex items-center gap-1 bg-base-200/90 border border-base-300 rounded-box px-2 py-1 text-xs">
                            <Btn icon={Minus} className="btn-ghost btn-xs" onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))} aria-label="Zoom out" />
                            <span className="w-28 text-center tabular-nums">{Math.round(zoom * 100)}% · {doc.size.w}×{doc.size.h}</span>
                            <Btn icon={Plus} className="btn-ghost btn-xs" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} aria-label="Zoom in" />
                            <Btn icon={Maximize} className="btn-ghost btn-xs" onClick={() => fit()} title="Fit to window" aria-label="Fit" />
                        </div>
                    </main>

                    <aside className="bg-base-200 border-l border-base-300 flex flex-col min-h-0">
                        <div className="grid grid-cols-4 border-b border-base-300 shrink-0">
                            {[["device", Layers, "Device"], ["layout", LayoutGrid, "Layers"], ["backdrop", Palette, "Backdrop"], ["export", Download, "Export"]].map(([id, I, label]) => (
                                <button key={id} onClick={() => setPanel(id)} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${panel === id ? "text-primary border-b-2 border-primary" : "text-base-content/55 hover:text-base-content"}`}><I size={16} />{label}</button>
                            ))}
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-5">
                            {panel === "device" && (layer ? (<>
                                <h3 className="font-display text-sm font-semibold">{DEVICES[layer.device].label}</h3>
                                <Section title="Screenshot">
                                    <select className="select select-sm w-full" value={layer.shot ?? ""} onChange={(e) => (e.target.value ? syncMoment(layer.id, e.target.value) : edit((d) => ({ ...d, layers: d.layers.map((l) => (l.id === layer.id ? { ...l, shot: null } : l)) })))}>
                                        <option value="">Auto</option>
                                        {shots.filter((s) => !s.flaw && (s.view === DEVICES[layer.device].view || s.view === "upload" || s.view === "full")).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                                    </select>
                                    <p className="text-[11px] text-base-content/50 leading-relaxed">Changing it moves the other devices to the same page and scroll point.</p>
                                </Section>
                                <Section title="Position">{sliders([["X", "x", 0, doc.size.w, 1], ["Y", "y", 0, doc.size.h, 1]])}</Section>
                                <Section title="Size and rotation">{sliders([["Scale", "scale", 0.2, 2.5, 0.01], ["Rotate X", "rotX", -60, 60, 1], ["Rotate Y", "rotY", -60, 60, 1], ["Rotate Z", "rotZ", -180, 180, 1], ["Depth", "depth", 0, 0.4, 0.01]])}</Section>
                                <Section title="Appearance">
                                    {sliders([["Corners", "radius", 0, 2, 0.05], ["Shadow", "shadow", 0, 1, 0.01]])}
                                    <div className="flex items-center gap-3 text-xs text-base-content/70"><span className="w-16">Frame</span><input type="color" value={layer.frame} onPointerDown={mark} onChange={(e) => setLayer(layer.id, { frame: e.target.value })} /></div>
                                </Section>
                            </>) : <p className="text-sm text-base-content/55 leading-relaxed">Click a device on the canvas to edit it. Drag to move.</p>)}

                            {panel === "layout" && (<>
                                <Section title="Add a device">
                                    <div className="grid grid-cols-2 gap-2">{Object.entries(DEVICES).map(([k, d]) => <Btn key={k} icon={Plus} onClick={() => add(k)} className="btn-outline btn-sm">{d.label}</Btn>)}</div>
                                </Section>
                                <Section title="Layers (top first)">
                                    {doc.layers.length === 0 && <p className="text-xs text-base-content/50">Canvas is empty. Add a device above.</p>}
                                    <ul className="space-y-1">{[...doc.layers].reverse().map((l) => (
                                        <li key={l.id} onClick={() => { setSel(l.id); setPanel("device"); }} className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer ${sel === l.id ? "bg-primary/15 text-primary" : "hover:bg-base-300"}`}>
                                            <span className="flex-1">{DEVICES[l.device].label}</span>
                                            <Btn icon={ArrowUp} onClick={(e) => { e.stopPropagation(); order(l.id, 1); }} className="btn-ghost btn-xs" aria-label="Bring forward" />
                                            <Btn icon={ArrowDown} onClick={(e) => { e.stopPropagation(); order(l.id, -1); }} className="btn-ghost btn-xs" aria-label="Send back" />
                                            <Btn icon={Copy} onClick={(e) => { e.stopPropagation(); dup(l.id); }} className="btn-ghost btn-xs" aria-label="Duplicate" />
                                            <Btn icon={Trash2} onClick={(e) => { e.stopPropagation(); remove(l.id); }} className="btn-ghost btn-xs text-error" aria-label="Remove" />
                                        </li>))}</ul>
                                </Section>
                                {layer && doc.layers.length > 1 && layer.shot && <Btn icon={LinkIcon} onClick={() => syncMoment(layer.id, layer.shot)} className="btn-outline btn-sm w-full">Match other devices to selected</Btn>}
                            </>)}

                            {panel === "backdrop" && (<>
                                <Section title="Type">
                                    <div className="join w-full">{[["solid", "Solid"], ["gradient", "Gradient"], ["image", "Image"], ["transparent", "Clear"]].map(([t, l]) => (
                                        <button key={t} onClick={() => edit((d) => ({ ...d, bg: { ...d.bg, type: t } }))} className={`join-item btn btn-xs flex-1 ${bg.type === t ? "btn-primary" : ""}`}>{l}</button>))}</div>
                                </Section>
                                {(bg.type === "solid" || bg.type === "gradient") && (<>
                                    <Section title="Colour">
                                        <div className="flex items-center gap-3 text-xs">Colours <input type="color" value={bg.a} onPointerDown={mark} onChange={(e) => setBg({ a: e.target.value })} />
                                            {bg.type === "gradient" && <input type="color" value={bg.b} onPointerDown={mark} onChange={(e) => setBg({ b: e.target.value })} />}</div>
                                        {bg.type === "gradient" && <Slider label="Angle" min={0} max={360} value={bg.angle} onStart={mark} onChange={(v) => setBg({ angle: v })} />}
                                        <div className="grid grid-cols-8 gap-1.5">{Object.entries(BG).map(([k, v]) => (
                                            <button key={k} title={k} aria-label={k} onClick={() => edit((d) => ({ ...d, bg: v }))} className="h-8 rounded-md border border-base-300 hover:border-primary" style={{ background: `linear-gradient(${v.angle}deg,${v.a},${v.b})` }} />))}</div>
                                    </Section>
                                    <Section title="Texture">
                                        <div className="grid grid-cols-3 gap-1.5">{["plain", "mesh", "stage"].map((st) => <button key={st} onClick={() => edit((d) => ({ ...d, bg: { ...d.bg, style: st } }))} className={`btn btn-xs capitalize ${(bg.style || "plain") === st ? "btn-primary" : "btn-outline"}`}>{st}</button>)}</div>
                                        <Row title="Ambient glow" checked={!!bg.glow} onChange={(e) => edit((d) => ({ ...d, bg: { ...d.bg, glow: e.target.checked } }))} />
                                    </Section>
                                </>)}
                                {bg.type === "image" && <label className="btn btn-sm btn-outline w-full"><Upload size={14} />{bg.img ? "Replace image" : "Upload image"}<input type="file" accept="image/*" hidden onChange={bgUpload} /></label>}
                                <Section title="Canvas size">
                                    <div className="grid grid-cols-2 gap-2">{SIZES.map(([l, w, h]) => (
                                        <button key={l} onClick={() => { edit((d) => ({ ...d, size: { w, h } })); setTimeout(fit, 0); }} className={`btn btn-xs ${doc.size.w === w && doc.size.h === h ? "btn-primary" : "btn-outline"}`}>{l}</button>))}</div>
                                </Section>
                            </>)}

                            {panel === "export" && (<>
                                <Section title="Format"><div className="grid grid-cols-2 gap-1.5">{["png", "jpeg"].map((f) => <button key={f} onClick={() => setFmt(f)} className={`btn btn-sm ${fmt === f ? "btn-primary" : "btn-outline"}`}>{f.toUpperCase()}</button>)}</div></Section>
                                <Section title="Resolution"><div className="grid grid-cols-3 gap-1.5">{RES.map(([l], i) => <button key={l} onClick={() => setRes(i)} className={`btn btn-xs ${res === i ? "btn-primary" : "btn-outline"}`}>{l}</button>)}</div></Section>
                                <Section title="Output"><p className="text-sm tabular-nums">{Math.round(doc.size.w * outK)} × {Math.round(doc.size.h * outK)} px<span className="text-base-content/50">{fmt === "png" && bg.type === "transparent" ? " · transparent" : ""}</span></p></Section>
                                <Row title="Pack as ZIP" checked={asZip} onChange={(e) => setAsZip(e.target.checked)} />
                            </>)}
                        </div>
                        <div className="shrink-0 p-4 border-t border-base-300">
                            <button onClick={exportImg} className="btn btn-primary btn-sm w-full"><Download size={15} />{asZip ? "Download ZIP" : `Download ${fmt.toUpperCase()}`}</button>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}
