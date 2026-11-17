import { useEffect, useRef, useState } from "react";
import { Undo2, Redo2, Download, Save, Camera, LayoutTemplate, Layers, Palette, Copy, Trash2, ArrowUp, ArrowDown, Upload, RotateCcw, Loader2, Check, Plus, Minus, Maximize, Sparkles, Mail, Lock, Link2, Eye, EyeOff, Square, Globe, LayoutGrid, ArrowLeft } from "lucide-react";
import { DEVICES, drawScene, hitTest, preload } from "./render";
import { makeZip, zipStream } from "./zip";
import { generate } from "./auto";

// ── model ────────────────────────────────────────────────────────────────────
const HOSTED = import.meta.env.VITE_CAPTURE_URL || ""; // hosted capture server, set in Vercel (never shown in the UI)
const LOCAL = import.meta.env.DEV ? "" : "http://localhost:5050"; // the server on this computer
const VERSION = typeof __APP_VERSION__ === "undefined" ? "dev" : __APP_VERSION__;
const SHA = typeof __BUILD_SHA__ === "undefined" ? "dev" : __BUILD_SHA__;
const BUILD_DATE = typeof __BUILD_DATE__ === "undefined" ? "" : __BUILD_DATE__;
const REPO = "hossain-shifat/Mockup-Studio";
// localhost, LAN and single-word hosts can only be reached by the server on this computer
const isLocalAddr = (u) => { try { const t = u.trim(), h = new URL(/^https?:\/\//i.test(t) ? t : `http://${t}`).hostname; return !h.includes(".") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\])|\.local$/i.test(h); } catch { return false; } };
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
let uid = 1;
const mk = (device, o = {}) => ({ id: uid++, device, shot: null, x: 800, y: 500, scale: 1, rotX: 0, rotY: 0, rotZ: 0, depth: 0.18, radius: 1, frame: "#26272c", shadow: 0.55, ...o });
const F = { spot: true, vig: true, grain: true, glow: false };
const BG = {
    ink: { type: "gradient", a: "#1b1d23", b: "#121318", angle: 165, ...F, style: "plain" },
    slate: { type: "gradient", a: "#2c3340", b: "#222833", angle: 165, ...F, style: "mesh", hl: "#7d92b8" },
    navy: { type: "gradient", a: "#1a2036", b: "#10131f", angle: 165, ...F, style: "beam", hl: "#5b7bd6" },
    forest: { type: "gradient", a: "#16241f", b: "#0e1713", angle: 165, ...F, style: "mesh", hl: "#4aa57f" },
    plum: { type: "gradient", a: "#241a2b", b: "#160f1c", angle: 165, ...F, style: "stage", hl: "#a266c4" },
    clay: { type: "gradient", a: "#b4694f", b: "#a45c44", angle: 165, ...F, style: "stage" },
    bone: { type: "gradient", a: "#ebe8e1", b: "#e0dcd3", angle: 165, ...F, style: "plain" },
    stone: { type: "gradient", a: "#d6d2c9", b: "#cbc6bb", angle: 165, ...F, style: "grid" },
    sand: { type: "gradient", a: "#e6dccb", b: "#d9ccb7", angle: 165, ...F, style: "plain" },
    mist: { type: "gradient", a: "#e6ecf2", b: "#d6dfe9", angle: 165, ...F, style: "grid" },
};
const TEMPLATES = [
    { name: "Floating laptop", bg: "ink", make: () => [mk("laptop", { rotX: 14, rotY: -16, rotZ: -3, scale: 1.2 })] },
    { name: "Desktop + phone", bg: "slate", make: () => [mk("browser", { x: 600, y: 500, scale: 0.98 }), mk("phone", { x: 1240, y: 540, rotZ: 6, scale: 0.95 })] },
    { name: "Device trio", bg: "clay", make: () => [mk("tablet", { x: 330, y: 540, rotZ: -6, scale: 0.85 }), mk("laptop", { x: 820, y: 470, scale: 0.95 }), mk("phone", { x: 1300, y: 580, rotZ: 7, scale: 0.8 })] },
    { name: "Browser stack", bg: "ink", make: () => [mk("browser", { x: 560, y: 420, scale: 0.78, rotZ: -4, shot: "full" }), mk("browser", { x: 900, y: 540, scale: 0.85 }), mk("browser", { x: 1180, y: 640, scale: 0.7, rotZ: 4 })] },
    { name: "Minimal phone", bg: "bone", make: () => [mk("phone", { x: 800, y: 500, scale: 1.35, frame: "#e9e6e1", shadow: 0.3 })] },
];
const SIZES = [["1600×1000", 1600, 1000], ["1920×1080", 1920, 1080], ["1080×1080", 1080, 1080], ["1200×1500", 1200, 1500]];
const RES = [["1x", () => 1], ["2x", () => 2], ["3x", () => 3], ["1080p", (W) => 1920 / W], ["2K", (W) => 2560 / W], ["4K", (W) => 3840 / W]];
const STEPS = [["desktop", "Desktop"], ["full", "Full page"], ["tablet", "Tablet"], ["mobile", "Mobile"]];
const fresh = () => ({ size: { w: 1600, h: 1000 }, bg: BG.ink, layers: TEMPLATES[0].make() });
const readFile = (f) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });

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
        {label && <span className="text-[11px] font-medium text-base-content/60">{label}</span>}
        <span className={`${label ? "mt-1 " : ""}flex items-center gap-2 rounded-md bg-base-300/70 px-2.5 h-9 transition focus-within:bg-base-300`}>
            <I size={15} className="text-base-content/40 shrink-0" />
            <input {...p} className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-base-content/30" />
            {right}
        </span>
    </label>
);
// fully rounded switch with a white knob
const Toggle = ({ checked, onChange }) => (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange({ target: { checked: !checked } })}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ${checked ? "bg-primary" : "bg-base-content/25"}`}>
        <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
);
const Section = ({ title, children }) => (
    <div className="space-y-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-base-content/50">{title}</h4>
        {children}
    </div>
);
const Btn = ({ icon: I, children, ...p }) => (
    <button {...p} className={`btn btn-sm ${p.className ?? "btn-ghost"}`}>{I && <I size={15} />}{children}</button>
);
const Head = ({ children }) => <h3 className="font-display text-sm font-semibold text-base-content mb-2">{children}</h3>;

function Thumb({ item, shots, onPick }) {
    const box = useRef(null), cv = useRef(null), [vis, setVis] = useState(false), [n, bump] = useState(0);
    const onImg = useRef(() => bump((x) => x + 1)).current;
    useEffect(() => {
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect(); } }, { rootMargin: "300px" });
        io.observe(box.current); return () => io.disconnect();
    }, []);
    useEffect(() => {
        if (!vis) return;
        const c = cv.current, { w, h } = item.doc.size, k = 360 / w;
        c.width = 360; c.height = Math.round(h * k);
        drawScene(c.getContext("2d"), item.doc, k, { shotFor: (l) => shots.find((s) => s.key === l.shot)?.src ?? null, onLoad: onImg });
    }, [vis, item, shots, n, onImg]);
    return (
        <button ref={box} onClick={onPick} className="block w-full bg-base-300" style={{ aspectRatio: `${item.doc.size.w} / ${item.doc.size.h}` }}>
            <canvas ref={cv} className="w-full h-full block" />
        </button>
    );
}

export default function App() {
    const [doc, setDoc] = useState(fresh);
    const [name, setName] = useState("Untitled mockup");
    const [sel, setSel] = useState(null);
    const [shots, setShots] = useState([]);
    const [tab, setTab] = useState("capture");
    const [url, setUrl] = useState(() => lsGet("ms:url", ""));
    const [mode, setMode] = useState(() => (HOSTED ? lsGet("ms:mode", "hosted") : "local")); // capture on this computer or on the hosted server
    const localAddr = isLocalAddr(url); // a local address always goes to the server on this computer
    const base = mode === "hosted" && HOSTED && !localAddr ? HOSTED.trim().replace(/\/+$/, "") : LOCAL;
    const [srv, setSrv] = useState({ state: "checking", version: "" });
    const [latest, setLatest] = useState("");
    const [cap, setCap] = useState({ busy: false, msg: "", done: 0, total: 0, error: null, note: "", scrollNote: "" });
    const [login, setLogin] = useState(() => ({ open: !!lsGet("ms:email", ""), email: lsGet("ms:email", ""), password: "", url: lsGet("ms:loginUrl", "") })); // email + login page remembered; password never saved
    const [crawl, setCrawl] = useState(true);
    const [maxPages, setMaxPages] = useState(50);
    const [sections, setSections] = useState(3);
    const [showPw, setShowPw] = useState(false);
    const abortRef = useRef(null);
    const [view, setView] = useState("editor");
    const [picked, setPicked] = useState(() => new Set());
    const [tplF, setTplF] = useState("all");
    const [pageF, setPageF] = useState("all");
    const [limit, setLimit] = useState(48);
    const [exp, setExp] = useState({ busy: false, done: 0, total: 0, msg: "" });
    const [asZip, setAsZip] = useState(true);
    const [screen, setScreen] = useState({ on: false, count: 0 }); // capture from a shared browser tab, no server needed
    const [samePage, setSamePage] = useState(false);
    const screenRef = useRef(null);
    const [sessionInfo, setSessionInfo] = useState(null); // open sign-in kept on the capture server
    const [keepIn, setKeepIn] = useState(true);
    const sessRef = useRef(null);
    sessRef.current = sessionInfo;
    useEffect(() => { // closing the studio tab ends the sign-in on the site
        const f = () => { const s = sessRef.current; if (s) navigator.sendBeacon(`${s.base}/api/session/end`, new Blob([JSON.stringify({ sessionId: s.id })], { type: "application/json" })); };
        window.addEventListener("pagehide", f); return () => window.removeEventListener("pagehide", f);
    }, []);
    const [zoom, setZoom] = useState(0.5);
    const [tick, setTick] = useState(0);
    const onImg = useRef(() => setTick((t) => t + 1)).current;
    const [fmt, setFmt] = useState("png");
    const [res, setRes] = useState(1);
    const [saved, setSaved] = useState(false);
    const [autos, setAutos] = useState([]);
    const [seed, setSeed] = useState(0);
    const cv = useRef(null), wrap = useRef(null), drag = useRef(null);
    const docRef = useRef(doc); docRef.current = doc;
    const past = useRef([]), fut = useRef([]);
    useEffect(() => { try { localStorage.removeItem("ms:key"); } catch { /* ignore */ } }, []); // the access key feature is gone
    useEffect(() => { document.fonts?.ready.then(() => setTick((t) => t + 1)); }, []); // redraw once web fonts are ready
    useEffect(() => { try { localStorage.setItem("ms:email", login.email); localStorage.setItem("ms:loginUrl", login.url); localStorage.setItem("ms:url", url); localStorage.setItem("ms:mode", mode); } catch { /* private mode */ } }, [login.email, login.url, url, mode]);
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
    useEffect(() => { // is there newer code on GitHub than this build?
        if (SHA === "dev") return;
        fetch(`https://api.github.com/repos/${REPO}/commits/HEAD`, { headers: { Accept: "application/vnd.github+json" } }).then((r) => (r.ok ? r.json() : null)).then((d) => d?.sha && setLatest(d.sha.slice(0, 7))).catch(() => {});
    }, []);

    // history
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
        const m = [...shots].reverse().find((s) => s.view === want) ?? shots[shots.length - 1];
        return m?.src ?? null;
    };

    // draw
    useEffect(() => {
        const c = cv.current; c.width = doc.size.w; c.height = doc.size.h;
        drawScene(c.getContext("2d"), doc, 1, { sel, shotFor, onLoad: onImg });
    }); // eslint-disable-line

    const fit = (s) => { const z = s?.w ? s : doc.size, r = wrap.current.getBoundingClientRect(); setZoom(Math.max(0.1, Math.min((r.width - 80) / z.w, (r.height - 80) / z.h))); };
    useEffect(() => { fit(); }, []); // eslint-disable-line
    useEffect(() => {
        const k = (e) => {
            if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
            if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
            if ((e.key === "Delete" || e.key === "Backspace") && docRef.current.layers.some((l) => l.id === sel)) remove(sel);
        };
        window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
    }); // eslint-disable-line

    // canvas pointer
    const pt = (e) => { const r = cv.current.getBoundingClientRect(); return [((e.clientX - r.left) * doc.size.w) / r.width, ((e.clientY - r.top) * doc.size.h) / r.height]; };
    const down = (e) => {
        const [x, y] = pt(e), id = hitTest(doc.layers, x, y); setSel(id);
        if (id) { mark(); const l = doc.layers.find((q) => q.id === id); drag.current = { id, dx: l.x - x, dy: l.y - y }; e.currentTarget.setPointerCapture(e.pointerId); }
    };
    const move = (e) => { if (!drag.current) return; const [x, y] = pt(e); setLayer(drag.current.id, { x: Math.round(x + drag.current.dx), y: Math.round(y + drag.current.dy) }); };

    // layer ops
    const add = (device, shot = null) => { const l = mk(device, { shot, x: doc.size.w / 2, y: doc.size.h / 2 }); edit((d) => ({ ...d, layers: [...d.layers, l] })); setSel(l.id); };
    const remove = (id) => { edit((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) })); setSel(null); };
    const dup = (id) => { const l = doc.layers.find((q) => q.id === id), n = { ...l, id: uid++, x: l.x + 40, y: l.y + 40 }; edit((d) => ({ ...d, layers: [...d.layers, n] })); setSel(n.id); };
    const order = (id, dir) => edit((d) => { const a = [...d.layers], i = a.findIndex((l) => l.id === id), j = i + dir; if (j < 0 || j >= a.length) return d; [a[i], a[j]] = [a[j], a[i]]; return { ...d, layers: a }; });
    const useShot = (key) => (layer ? (mark(), setLayer(layer.id, { shot: key })) : add("browser", key));

    // auto mockups: generate a full set, apply the first one
    const runAuto = async (list, sd = seed, apply = true) => {
        if (!list.length) return;
        const out = await generate(list, sd); setAutos(out);
        if (apply) { mark(); setDoc(out[0].doc); setName(out[0].name); setSel(null); setTab("auto"); setView("gallery"); setTimeout(() => fit(out[0].doc.size), 0); }
    };
    const pick = (a) => { mark(); setDoc(a.doc); setName(a.name); setSel(null); setView("editor"); setTimeout(() => fit(a.doc.size), 0); };

    // capture
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
        const shot = { key: `${pageKey}-${view}-${sec}`, page: pageKey, label: `Screen grab ${n} \u00b7 ${view}`, view, sec, title: `Screen ${n}`, host: "", src: c.toDataURL("image/png") };
        const next = [...shots, shot];
        setShots(next); setScreen((s) => ({ ...s, count: n }));
        await runAuto(next, seed, false);
    };
    // "Failed to fetch" tells nothing: find out whether the server is down, asleep, or refusing this website
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
    const capture = async () => {
        let target = url.trim();
        if (target && !/^https?:\/\//i.test(target)) { target = `http://${target}`; setUrl(target); }
        setCap({ busy: true, msg: "Starting…", done: 0, total: 0, error: null, note: "" });
        const stamp = Date.now(); let path = "/"; const got = [];
        const ac = new AbortController(); abortRef.current = ac;
        try { path = new URL(url).pathname; } catch { /* server reports invalid URL */ }
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
                    if (m.status) setCap((s) => ({ ...s, msg: m.status }));
                    if (m.progress) setCap((s) => ({ ...s, done: m.progress.done, total: m.progress.total }));
                    if (m.session !== undefined) setSessionInfo(m.session ? { id: m.session.id, as: m.session.as, base } : null);
                    if (m.note) setCap((s) => ({ ...s, scrollNote: m.note }));
                    if (m.keptOpen) setCap((s) => ({ ...s, note: "Still signed in, so the next capture needs no login. Press Sign out when you are finished." }));
                    if (m.signedOut !== undefined) setCap((s) => ({ ...s, note: m.signedOut ? "Signed out of the site. Password cleared." : "No sign-out button found. The session was discarded here; sign out of the site yourself if needed." }));
                    if (m.shot) {
                        const sec = m.shot.section ?? 0;
                        const shot = { key: `${stamp}-${m.shot.page}-${m.shot.view}-${sec}`, page: `${stamp}-${m.shot.page}`, label: `${m.shot.path} · ${m.shot.view}${sec ? ` #${sec + 1}` : ""}`, view: m.shot.view, sec, title: m.shot.title, host: (() => { try { return new URL(target).hostname; } catch { return ""; } })(), src: m.shot.src }; got.push(shot); setShots((s) => [...s, shot]);
                        
                    }
                }
            }
            setCap((s) => ({ ...s, busy: false }));
            if (login.password) setLogin((l) => ({ ...l, password: "" }));
            await runAuto(got, seed);
        } catch (e) {
            if (e.name === "AbortError") { setCap((s) => ({ ...s, busy: false })); await runAuto(got, seed); return; } // Stop: keep what we have
            if (/expired|asked for the password/i.test(e.message)) setSessionInfo(null);
            let msg = e.message;
            if (e instanceof TypeError) {
                if (got.length) { msg = `The connection dropped after ${got.length} screenshots (a small hosted server can run out of memory). What was captured is kept. Lower the page limit or sections and retry.`; await runAuto(got, seed); }
                else msg = await diagnose();
            }
            setCap((s) => ({ ...s, busy: false, error: msg }));
        }
    };
    const upload = async (e) => {
        const next = []; for (const f of e.target.files) next.push({ key: `up-${uid++}`, label: f.name, view: "upload", src: await readFile(f) });
        setShots((s) => [...s, ...next]); e.target.value = ""; runAuto([...shots, ...next], seed);
    };
    const bgUpload = async (e) => { const f = e.target.files[0]; if (f) edit((d) => ({ ...d, bg: { ...d.bg, type: "image", img: URL.createObjectURL(f) } })); e.target.value = ""; };

    // export / save
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
        // size guard: grain makes PNG big. Estimate and let the user choose.
        const px = list.reduce((a, m) => { const { w, h } = m.doc.size, k = Math.min(RES[res][1](w), 8192 / Math.max(w, h)); return a + w * h * k * k; }, 0);
        const gb = (px * (fmt === "png" ? 1.5 : 0.3)) / 1e9;
        if (gb > 1.5 && !window.confirm(`About ${gb.toFixed(1)} GB of images. JPEG and a lower resolution are much smaller. Continue?`)) return;
        // one ZIP, streamed straight to disk (Edge/Chrome on localhost). Must run before any await: needs the click.
        let w = null;
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
                    if (z.size() > 3.8e9) break; // classic ZIP limit is 4 GB
                    const b = await renderBlob(a.doc);
                    await z.add(`${a.file}.${ext()}`, new Uint8Array(await b.arrayBuffer()));
                    saved++; setExp((e) => ({ ...e, done: saved }));
                }
                await z.finish(); await w.close();
            } else { // fallback: several ZIPs of 30
                const CH = gb < 1.2 ? list.length : 30; let part = 0; // one in-memory ZIP when small enough
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
    const exportAll = () => exportMany(autos, "all", true);
    const togglePick = (id) => setPicked((p) => { const q = new Set(p); if (q.has(id)) q.delete(id); else q.add(id); return q; });
    const visible = autos.filter((a) => (tplF === "all" || a.name === tplF) && (pageF === "all" || String(a.pageIndex) === pageF));
    const outK = Math.min(RES[res][1](doc.size.w), 8192 / Math.max(doc.size.w, doc.size.h));
    const sliders = (rows) => (layer ? rows.map(([label, key, min, max, step]) => <Slider key={key} label={label} min={min} max={max} step={step} value={layer[key]} onStart={mark} onChange={(v) => setLayer(layer.id, { [key]: v })} />) : null);
    const tplNames = [...new Set(autos.map((a) => a.name))];
    const pageOpts = [...new Map(autos.map((a) => [a.pageIndex, a.pageLabel]))];
    const expBar = exp.busy
        ? <div className="text-xs text-base-content/70">Exporting {exp.done} of {exp.total}…<progress className="progress progress-primary w-full mt-1" value={exp.done} max={exp.total} /></div>
        : exp.msg ? <div role="status" className="text-xs text-success">{exp.msg}</div> : null;
    const save = () => { try { localStorage.setItem("mockup-studio:project", JSON.stringify({ name, doc: { ...doc, bg: { ...doc.bg, img: undefined } } })); setSaved(true); setTimeout(() => setSaved(false), 1500); } catch { /* quota */ } };
    const bg = doc.bg, setBg = (p) => setDoc((d) => ({ ...d, bg: { ...d.bg, ...p } }));
    const TABS = [["auto", Sparkles, "Auto"], ["capture", Camera, "Capture"], ["templates", LayoutTemplate, "Templates"], ["devices", Layers, "Devices"], ["background", Palette, "Backdrop"]];

    return (
        <div className="h-full grid grid-rows-[3.25rem_1fr] grid-cols-[19rem_1fr_19rem] bg-base-100 text-base-content">
            {/* toolbar */}
            <header className="col-span-3 flex items-center gap-3 px-4 bg-base-200 border-b border-base-300">
                <div className="font-display font-bold text-lg tracking-tight flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary" />Mockup Studio
                </div>
                <span className="rounded-md bg-base-300 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-base-content/60" title={`Studio v${VERSION} · build ${SHA}${BUILD_DATE ? ` · ${BUILD_DATE}` : ""}`}>v{VERSION} · {SHA}</span>
                {latest && SHA !== "dev" && latest !== SHA && <span className="rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning" title={`Newest code on GitHub is ${latest}. Vercel is still deploying it, or redeploy. Then reload this page.`}>Update available</span>}
                <input value={name} onChange={(e) => setName(e.target.value)} className="input input-sm input-ghost w-56 ml-4" aria-label="Project name" />
                <div className="ml-auto flex items-center gap-1">
                    <Btn icon={LayoutGrid} disabled={!autos.length} onClick={() => setView(view === "gallery" ? "editor" : "gallery")}>{view === "gallery" ? "Editor" : `Gallery${autos.length ? ` (${autos.length})` : ""}`}</Btn>
                    <Btn icon={Undo2} onClick={undo} title="Undo (Ctrl+Z)" />
                    <Btn icon={Redo2} onClick={redo} title="Redo (Ctrl+Shift+Z)" />
                    <Btn icon={RotateCcw} onClick={() => { edit(fresh); setSel(null); }} title="Reset layout">Reset</Btn>
                    <Btn icon={saved ? Check : Save} onClick={save}>{saved ? "Saved" : "Save"}</Btn>
                    <Btn icon={Download} disabled={!autos.length || exp.busy} onClick={exportAll} className="btn-outline" title="Download every mockup in one ZIP">Export all</Btn>
                    <Btn icon={Download} onClick={exportImg} className="btn-primary" title="Download the mockup on the canvas">Export</Btn>
                </div>
            </header>

            {/* left */}
            <aside className="bg-base-200 border-r border-base-300 overflow-y-auto">
                <div className="grid grid-cols-5 border-b border-base-300">
                    {TABS.map(([id, I, label]) => (
                        <button key={id} onClick={() => setTab(id)} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${tab === id ? "text-primary border-b-2 border-primary" : "text-base-content/55 hover:text-base-content"}`}>
                            <I size={17} />{label}
                        </button>
                    ))}
                </div>
                <div className="p-4 space-y-4">
                    {tab === "auto" && (<>
                        <div>
                            <Head>Auto mockups</Head>
                            <p className="text-xs text-base-content/60 leading-relaxed mb-3">Every captured page is placed in every template. Open the gallery to compare them all, tick the ones you want, and download.</p>
                            <Btn icon={LayoutGrid} disabled={!autos.length} onClick={() => setView("gallery")} className="btn-primary btn-sm w-full">Open gallery ({autos.length})</Btn>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <Btn icon={Sparkles} disabled={!shots.length} onClick={() => { setSeed(seed + 1); runAuto(shots, seed + 1, false); }} className="btn-outline btn-sm">Shuffle colors</Btn>
                                <Btn icon={Download} disabled={!autos.length || exp.busy} onClick={exportAll} className="btn-outline btn-sm">Export all</Btn>
                            </div>
                            <div className="mt-3">{expBar}</div>
                        </div>
                        {autos.length === 0 && <p className="text-xs text-base-content/50 leading-relaxed">Nothing yet. Open Capture, enter a URL, and the mockups appear here.</p>}
                    </>)}

                    {tab === "capture" && (<>
                        <div>
                            <Head>Website address</Head>
                            <Field icon={Globe} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !cap.busy && capture()} placeholder="example.com" spellCheck={false} />
                            <div className="mt-3 space-y-2.5">
                                {HOSTED && (
                                    <div className="space-y-1.5">
                                        <span className="text-[11px] font-medium text-base-content/60">Capture from</span>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <button onClick={() => setMode("local")} className={`btn btn-sm ${mode === "local" ? "btn-primary" : "btn-outline"}`}>This computer</button>
                                            <button onClick={() => setMode("hosted")} className={`btn btn-sm ${mode === "hosted" ? "btn-primary" : "btn-outline"}`}>Hosted server</button>
                                        </div>
                                    </div>
                                )}
                                {HOSTED && mode === "hosted" && localAddr && <p className="text-[11px] text-base-content/60 leading-relaxed">This address only exists on your own network, so the hosted server cannot open it. The capture runs on your computer: start the server there with npm run dev, or put the site online first.</p>}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                                    <span className={`h-2 w-2 rounded-full ${srv.state === "online" ? "bg-success" : srv.state === "checking" ? "bg-warning animate-pulse" : "bg-error"}`} />
                                    <span className="text-base-content/70">{srv.state === "online" ? `Server online${srv.version ? ` · v${srv.version}` : ""}` : srv.state === "checking" ? (base !== LOCAL ? "Checking server. A free hosted server can take about a minute to wake…" : "Checking server…") : srv.state === "blocked" ? `The server answered but blocks this website. On the server set ALLOWED_ORIGINS to ${location.origin}` : base === LOCAL ? "Server not running. Double-click Start-Capture-Server.bat in the project folder, or capture from your screen below." : "Hosted server not reachable. Check the address and that it is running."}</span>
                                    {srv.state === "online" && srv.version && srv.version !== VERSION && <span className="text-warning">Server is v{srv.version}, studio is v{VERSION}</span>}
                                </div>
                            </div>
                            <div className="mt-4 rounded-box border border-base-300 bg-base-100/50 p-3 space-y-3">
                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="text-sm font-medium">Sign in to the site</span>
                                    <Toggle checked={login.open} onChange={(e) => setLogin({ ...login, open: e.target.checked })} />
                                </label>
                                {login.open && (
                                    <div className="space-y-2.5">
                                        <Field icon={Mail} label="Email or username" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} placeholder="you@example.com" autoComplete="off" spellCheck={false} />
                                        <Field icon={Lock} label="Password" type={showPw ? "text" : "password"} value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && !cap.busy && capture()} placeholder={sessionInfo ? "Not needed while signed in" : "Enter password"} autoComplete="new-password"
                                            right={<button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} title={showPw ? "Hide password" : "Show password"} className="text-base-content/50 hover:text-base-content cursor-pointer">{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>} />
                                        <Field icon={Link2} label="Login page (optional)" value={login.url} onChange={(e) => setLogin({ ...login, url: e.target.value })} placeholder="Only if different from the address above" spellCheck={false} />
                                        {sessionInfo && (
                                            <div className="flex items-center justify-between gap-2 rounded-md bg-success/10 px-2.5 py-2 text-xs text-success">
                                                <span className="truncate">Signed in as {sessionInfo.as}</span>
                                                <button onClick={endSession} className="btn btn-xs btn-ghost text-success">Sign out</button>
                                            </div>
                                        )}
                                        <label className="flex items-center justify-between cursor-pointer text-xs"><span>Stay signed in between captures</span><Toggle checked={keepIn} onChange={(e) => setKeepIn(e.target.checked)} /></label>
                                        <p className="text-[11px] text-base-content/50 leading-relaxed">Email is remembered here. The password is never saved or logged and is cleared after capture. You are signed out when you press Sign out, after 10 idle minutes, or when you close this tab. With the switch off, you are signed out after every capture.</p>
                                    </div>
                                )}
                                <div className="border-t border-base-300 pt-3 space-y-3">
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <span className="text-sm font-medium">Explore every page</span>
                                        <Toggle checked={crawl} onChange={(e) => setCrawl(e.target.checked)} />
                                    </label>
                                    {crawl && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-[11px] font-medium text-base-content/60"><span>Page limit</span><span className="tabular-nums text-sm text-base-content">{maxPages}</span></div>
                                            <input type="range" min={1} max={100} value={maxPages} onChange={(e) => setMaxPages(+e.target.value)} className="w-full" aria-label="Page limit" />
                                            <div className="grid grid-cols-4 gap-1.5">{[10, 25, 50, 100].map((n) => <button key={n} onClick={() => setMaxPages(n)} className={`btn btn-xs ${maxPages === n ? "btn-primary" : "btn-outline"}`}>{n === 100 ? "Max 100" : n}</button>)}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 rounded-box border border-base-300 bg-base-100/50 p-3 space-y-2">
                                <div className="flex items-center justify-between text-[11px] font-medium text-base-content/60"><span>Sections per page</span><span className="tabular-nums text-sm text-base-content">{sections}</span></div>
                                <input type="range" min={1} max={5} value={sections} onChange={(e) => setSections(+e.target.value)} className="w-full" aria-label="Sections per page" />
                                <p className="text-[11px] text-base-content/50 leading-relaxed">Scrolls every page and captures the top, middle and bottom, so mockups show more than the first screen.</p>
                            </div>
                            <button onClick={capture} disabled={cap.busy || !url} className="btn btn-primary btn-sm w-full mt-2">
                                {cap.busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}{cap.busy ? "Capturing…" : "Capture website"}
                            </button>
                            {cap.busy && (
                                <div className="mt-3 text-xs text-base-content/70">
                                    <div className="flex items-center gap-2"><Loader2 size={13} className="animate-spin text-primary" />{cap.msg}</div>
                                    {cap.total > 0 && <progress className="progress progress-primary w-full mt-2" value={cap.done} max={cap.total} />}
                                    <button onClick={() => abortRef.current?.abort()} className="btn btn-xs btn-outline mt-2"><Square size={11} />Stop and use what is captured</button>
                                </div>
                            )}
                            {cap.error && <p role="alert" className="mt-3 text-xs text-error leading-relaxed">{cap.error}</p>}
                            {cap.scrollNote && !cap.busy && <p role="status" className="mt-3 text-xs text-base-content/70 leading-relaxed">{cap.scrollNote}</p>}
                            {cap.note && !cap.busy && <p role="status" className="mt-3 text-xs text-success leading-relaxed">{cap.note}</p>}
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <Btn icon={LayoutGrid} disabled={!autos.length} onClick={() => setView("gallery")} className="btn-outline btn-sm">Gallery</Btn>
                                <Btn icon={Download} disabled={!autos.length || exp.busy} onClick={exportAll} className="btn-primary btn-sm">Export all ({autos.length})</Btn>
                            </div>
                            <div className="mt-2">{expBar}</div>
                            <div className="mt-4 rounded-box border border-base-300 bg-base-100/50 p-3 space-y-2.5">
                                <h4 className="text-sm font-medium">No server? Capture from your screen</h4>
                                <p className="text-[11px] text-base-content/50 leading-relaxed">Works for any site on your computer, with no server at all. Open your site in another tab, share that tab, then press Grab on each page. Scroll between grabs for more sections. Make that window narrow for a phone view.</p>
                                {!screen.on ? <Btn icon={Camera} onClick={startScreen} className="btn-outline btn-sm w-full">Share a tab</Btn> : (
                                    <div className="grid grid-cols-2 gap-2">
                                        <Btn icon={Camera} onClick={grab} className="btn-primary btn-sm">Grab ({screen.count})</Btn>
                                        <Btn icon={Square} onClick={stopScreen} className="btn-outline btn-sm">Stop sharing</Btn>
                                    </div>
                                )}
                                {screen.on && <label className="flex items-center justify-between cursor-pointer text-xs"><span>Same page as the last grab</span><Toggle checked={samePage} onChange={(e) => setSamePage(e.target.checked)} /></label>}
                                {screen.count > 0 && <p className="text-xs text-base-content/70">{autos.length} mockups ready. Open the Gallery to review them.</p>}
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-2"><Head>Screenshots</Head>
                                <label className="btn btn-xs btn-ghost"><Upload size={13} />Upload<input type="file" accept="image/*" multiple hidden onChange={upload} /></label>
                            </div>
                            {shots.length === 0 && <p className="text-xs text-base-content/50 leading-relaxed">No screenshots yet. Capture a site or upload images, then click one to place it on the selected device.</p>}
                            <div className="grid grid-cols-2 gap-2">
                                {shots.map((s) => (
                                    <button key={s.key} onClick={() => useShot(s.key)} className="text-left group">
                                        <div className="aspect-[4/3] rounded-md overflow-hidden bg-base-300 border border-base-300 group-hover:border-primary">
                                            <img src={s.src} alt={s.label} loading="lazy" decoding="async" className="w-full h-full object-cover object-top" />
                                        </div>
                                        <div className="text-[11px] text-base-content/60 truncate mt-1">{s.label}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>)}

                    {tab === "templates" && (<div className="space-y-2">
                        <Head>Start from a layout</Head>
                        {TEMPLATES.map((t) => (
                            <button key={t.name} onClick={() => { edit((d) => ({ ...d, layers: t.make(), bg: BG[t.bg] })); setSel(null); }} className="w-full flex items-center justify-between rounded-md bg-base-300/60 hover:bg-base-300 px-3 py-3 text-sm transition">
                                {t.name}<span className="flex gap-1">{t.make().map((l) => <span key={l.id} className="text-[10px] text-base-content/50">{DEVICES[l.device].label}</span>)}</span>
                            </button>
                        ))}
                    </div>)}

                    {tab === "devices" && (<>
                        <div><Head>Add device</Head>
                            <div className="grid grid-cols-2 gap-2">{Object.entries(DEVICES).map(([k, d]) => <Btn key={k} icon={Plus} onClick={() => add(k)} className="btn-outline btn-sm">{d.label}</Btn>)}</div></div>
                        <div><Head>Layers (top first)</Head>
                            {doc.layers.length === 0 && <p className="text-xs text-base-content/50">Canvas is empty. Add a device above.</p>}
                            <ul className="space-y-1">{[...doc.layers].reverse().map((l) => (
                                <li key={l.id} onClick={() => setSel(l.id)} className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer ${sel === l.id ? "bg-primary/15 text-primary" : "hover:bg-base-300"}`}>
                                    <span className="flex-1">{DEVICES[l.device].label}</span>
                                    <Btn icon={ArrowUp} onClick={(e) => { e.stopPropagation(); order(l.id, 1); }} className="btn-ghost btn-xs" title="Bring forward" />
                                    <Btn icon={ArrowDown} onClick={(e) => { e.stopPropagation(); order(l.id, -1); }} className="btn-ghost btn-xs" title="Send back" />
                                    <Btn icon={Copy} onClick={(e) => { e.stopPropagation(); dup(l.id); }} className="btn-ghost btn-xs" title="Duplicate" />
                                    <Btn icon={Trash2} onClick={(e) => { e.stopPropagation(); remove(l.id); }} className="btn-ghost btn-xs text-error" title="Remove" />
                                </li>))}</ul></div>
                    </>)}

                    {tab === "background" && (<>
                        <div><Head>Backdrop</Head>
                            <div className="join w-full">{[["solid", "Solid"], ["gradient", "Gradient"], ["image", "Image"], ["transparent", "Clear"]].map(([t, l]) => (
                                <button key={t} onClick={() => edit((d) => ({ ...d, bg: { ...d.bg, type: t } }))} className={`join-item btn btn-xs flex-1 ${bg.type === t ? "btn-primary" : ""}`}>{l}</button>))}</div></div>
                        {(bg.type === "solid" || bg.type === "gradient") && (<div className="space-y-2">
                            <div className="flex items-center gap-3 text-xs">Colors <input type="color" value={bg.a} onPointerDown={mark} onChange={(e) => setBg({ a: e.target.value })} />
                                {bg.type === "gradient" && <input type="color" value={bg.b} onPointerDown={mark} onChange={(e) => setBg({ b: e.target.value })} />}</div>
                            {bg.type === "gradient" && <Slider label="Angle" min={0} max={360} value={bg.angle} onStart={mark} onChange={(v) => setBg({ angle: v })} />}
                            <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={!!bg.glow} onChange={(e) => edit((d) => ({ ...d, bg: { ...d.bg, glow: e.target.checked } }))} />Ambient glow</label>
                            <div className="space-y-1.5"><span className="text-[11px] font-medium text-base-content/60">Texture</span>
                                <div className="grid grid-cols-5 gap-1.5">{["plain", "mesh", "stage", "grid", "beam"].map((st) => <button key={st} onClick={() => edit((d) => ({ ...d, bg: { ...d.bg, style: st } }))} className={`btn btn-xs capitalize ${(bg.style || "plain") === st ? "btn-primary" : "btn-outline"}`}>{st}</button>)}</div></div>
                            <span className="block text-[11px] font-medium text-base-content/60 pt-1">Presets</span>
                            <div className="grid grid-cols-5 gap-1.5">{Object.entries(BG).map(([k, v]) => (
                                <button key={k} title={k} onClick={() => edit((d) => ({ ...d, bg: v }))} className="h-8 rounded-md border border-base-300 hover:border-primary" style={{ background: `linear-gradient(${v.angle}deg,${v.a},${v.b})` }} />))}</div>
                        </div>)}
                        {bg.type === "image" && <label className="btn btn-sm btn-outline w-full"><Upload size={14} />{bg.img ? "Replace image" : "Upload image"}<input type="file" accept="image/*" hidden onChange={bgUpload} /></label>}
                        <div><Head>Canvas size</Head>
                            <div className="grid grid-cols-2 gap-2">{SIZES.map(([l, w, h]) => (
                                <button key={l} onClick={() => { edit((d) => ({ ...d, size: { w, h } })); setTimeout(fit, 0); }} className={`btn btn-xs ${doc.size.w === w && doc.size.h === h ? "btn-primary" : "btn-outline"}`}>{l}</button>))}</div></div>
                    </>)}
                </div>
            </aside>

            {/* stage */}
            <main ref={wrap} className="stage relative overflow-auto flex">
                {view === "gallery" && (
                    <div className="absolute inset-0 z-10 bg-base-100 overflow-y-auto">
                        <div className="sticky top-0 z-10 bg-base-100/95 backdrop-blur border-b border-base-300 px-5 py-3 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="font-display text-lg font-semibold mr-2">Mockups <span className="text-sm font-normal text-base-content/50">{visible.length} shown · {picked.size} selected</span></h2>
                                <select className="select select-xs" value={pageF} onChange={(e) => { setPageF(e.target.value); setLimit(48); }} aria-label="Filter by page">
                                    <option value="all">All pages ({pageOpts.length})</option>
                                    {pageOpts.map(([i, l]) => <option key={i} value={i}>{l}</option>)}
                                </select>
                                <Btn onClick={() => setPicked(new Set([...picked, ...visible.map((a) => a.id)]))} className="btn-outline btn-xs">Select shown</Btn>
                                <Btn onClick={() => setPicked(new Set())} disabled={!picked.size} className="btn-ghost btn-xs">Clear</Btn>
                                <div className="ml-auto flex items-center gap-2">
                                    <label className="flex items-center gap-1.5 text-xs text-base-content/70 cursor-pointer"><input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={asZip} onChange={(e) => setAsZip(e.target.checked)} />Pack as ZIP</label>
                                    <Btn icon={Download} disabled={!picked.size || exp.busy} onClick={() => exportMany(autos.filter((a) => picked.has(a.id)), "selected")} className="btn-primary btn-sm">Download selected ({picked.size})</Btn>
                                    <Btn icon={Download} disabled={exp.busy} onClick={exportAll} className="btn-outline btn-sm">Export all ({autos.length})</Btn>
                                    <Btn icon={ArrowLeft} onClick={() => setView("editor")} className="btn-ghost btn-sm">Editor</Btn>
                                </div>
                            </div>
                            <div className="flex gap-1.5 overflow-x-auto pb-1">
                                {["all", ...tplNames].map((t) => <button key={t} onClick={() => { setTplF(t); setLimit(48); }} className={`btn btn-xs shrink-0 ${tplF === t ? "btn-primary" : "btn-outline"}`}>{t === "all" ? "All templates" : t}</button>)}
                            </div>
                            {expBar}
                        </div>
                        <div className="p-5 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
                            {visible.slice(0, limit).map((a) => (
                                <div key={a.id} className={`relative rounded-box overflow-hidden bg-base-200 border ${picked.has(a.id) ? "border-primary ring-1 ring-primary/60" : "border-base-300"}`}>
                                    <input type="checkbox" aria-label={`Select ${a.name}, ${a.pageLabel}`} checked={picked.has(a.id)} onChange={() => togglePick(a.id)} className="checkbox checkbox-sm checkbox-primary absolute top-2 left-2 z-10 bg-base-100/80" />
                                    <Thumb item={a} shots={shots} onPick={() => pick(a)} />
                                    <div className="px-3 py-2 text-xs"><div className="font-medium truncate">{a.name}</div><div className="text-base-content/50 truncate">{a.pageLabel}</div></div>
                                </div>
                            ))}
                        </div>
                        {visible.length > limit && <div className="pb-10 text-center"><Btn onClick={() => setLimit((l) => l + 48)} className="btn-outline btn-sm">Show more ({visible.length - limit} left)</Btn></div>}
                        {visible.length === 0 && <p className="p-10 text-center text-sm text-base-content/50">No mockups yet. Capture a site first.</p>}
                    </div>
                )}
                <div className="m-auto p-10">
                    <div className={bg.type === "transparent" ? "checker" : ""} style={{ width: doc.size.w * zoom, height: doc.size.h * zoom, boxShadow: "0 30px 80px rgba(0,0,0,.55)" }}>
                        <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} style={{ width: "100%", height: "100%", cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }} />
                    </div>
                </div>
                {shots.length === 0 && (
                    <div className="absolute left-4 bottom-14 max-w-64 text-xs text-base-content/60 bg-base-200/90 border border-base-300 rounded-box p-3">Devices are empty frames until you capture or upload a screenshot.</div>
                )}
                <div className="absolute left-4 bottom-4 flex items-center gap-1 bg-base-200/90 border border-base-300 rounded-box px-2 py-1 text-xs">
                    <Btn icon={Minus} className="btn-ghost btn-xs" onClick={() => setZoom((z) => Math.max(0.1, z - 0.1))} />
                    <span className="w-24 text-center tabular-nums">{Math.round(zoom * 100)}% · {doc.size.w}×{doc.size.h}</span>
                    <Btn icon={Plus} className="btn-ghost btn-xs" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} />
                    <Btn icon={Maximize} className="btn-ghost btn-xs" onClick={fit} title="Fit to window" />
                </div>
            </main>

            {/* right */}
            <aside className="bg-base-200 border-l border-base-300 overflow-y-auto p-4 space-y-5">
                {layer ? (
                    <div className="space-y-5">
                        <h3 className="font-display text-sm font-semibold">{DEVICES[layer.device].label} settings</h3>
                        <Section title="Screenshot">
                            <select className="select select-sm w-full" value={layer.shot ?? ""} onChange={(e) => edit((d) => ({ ...d, layers: d.layers.map((l) => (l.id === layer.id ? { ...l, shot: e.target.value || null } : l)) }))}>
                                <option value="">Auto</option>{shots.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                        </Section>
                        <Section title="Position">{sliders([["X", "x", 0, doc.size.w, 1], ["Y", "y", 0, doc.size.h, 1]])}</Section>
                        <Section title="Size and rotation">{sliders([["Scale", "scale", 0.2, 2.5, 0.01], ["Rotate X", "rotX", -60, 60, 1], ["Rotate Y", "rotY", -60, 60, 1], ["Rotate Z", "rotZ", -180, 180, 1], ["Depth", "depth", 0, 0.4, 0.01]])}</Section>
                        <Section title="Appearance">
                            {sliders([["Corners", "radius", 0, 2, 0.05], ["Shadow", "shadow", 0, 1, 0.01]])}
                            <div className="flex items-center gap-3 text-xs text-base-content/70"><span className="w-16">Frame</span>
                                <input type="color" value={layer.frame} onPointerDown={mark} onChange={(e) => setLayer(layer.id, { frame: e.target.value })} /></div>
                        </Section>
                    </div>
                ) : <div><Head>Selection</Head><p className="text-xs text-base-content/50 leading-relaxed">Click a device on the canvas to move it, then fine-tune position, rotation, depth and shadow here.</p></div>}
                <div className="space-y-5 border-t border-base-300 pt-5">
                    <h3 className="font-display text-sm font-semibold">Export</h3>
                    <Section title="Format">
                        <div className="grid grid-cols-2 gap-1.5">{["png", "jpeg"].map((f) => <button key={f} onClick={() => setFmt(f)} className={`btn btn-sm ${fmt === f ? "btn-primary" : "btn-outline"}`}>{f.toUpperCase()}</button>)}</div>
                    </Section>
                    <Section title="Resolution">
                        <div className="grid grid-cols-3 gap-1.5">{RES.map(([l], i) => <button key={l} onClick={() => setRes(i)} className={`btn btn-xs ${res === i ? "btn-primary" : "btn-outline"}`}>{l}</button>)}</div>
                    </Section>
                    <Section title="Output size">
                        <p className="text-sm tabular-nums">{Math.round(doc.size.w * outK)} × {Math.round(doc.size.h * outK)} px<span className="text-base-content/50">{fmt === "png" && bg.type === "transparent" ? " · transparent" : ""}</span></p>
                    </Section>
                    <Section title="Delivery">
                        <label className="flex items-center justify-between cursor-pointer text-sm"><span>Pack as ZIP</span><Toggle checked={asZip} onChange={(e) => setAsZip(e.target.checked)} /></label>
                        <p className="text-[11px] text-base-content/50 leading-relaxed">Applies to this mockup and to Download selected. Export all is always one ZIP.</p>
                    </Section>
                    <button onClick={exportImg} className="btn btn-primary btn-sm w-full"><Download size={15} />{asZip ? "Download ZIP" : `Download ${fmt.toUpperCase()}`}</button>
                </div>
            </aside>
        </div>
    );
}
