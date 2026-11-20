"use strict";
// Route intelligence: URLs that differ only by an id count as ONE kind of page, and sections of a site
// that share a first path segment (/live, /live/category/sports ...) count as one family.
// /media/1 ... /media/100 are the same screen with different data, so only a couple get visited.

// a path segment that is an id, not a word: number, uuid, long hex, or a long mixed-case token
const dynSeg = (s) => {
    let d = s;
    try { d = decodeURIComponent(s); } catch { /* keep raw */ }
    const id = /^\d+$/.test(d) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(d) || /^[0-9a-f]{12,}$/i.test(d)
        || (/^[A-Za-z0-9_=-]{20,}$/.test(d) && /[A-Z]/.test(d) && /[a-z]/.test(d));
    return id ? ":id" : s;
};

const norm = (u) => { const x = new URL(u); return x.origin + (x.pathname.replace(/\/+$/, "") || "/"); };

function createRouteBook(perRoute = 2, perFamily = 2) {
    const queue = [], queued = new Set(), seen = new Set(), visited = new Map(), famVisits = new Map(), kids = new Map(), collections = new Set();

    // more than 4 different children under one parent (/movie/inception, /movie/avatar ...) = a collection of items
    const patternOf = (l) => {
        const segs = new URL(l).pathname.split("/").filter(Boolean).map(dynSeg);
        if (segs.length && collections.has("/" + segs.slice(0, -1).join("/"))) segs[segs.length - 1] = ":slug";
        return "/" + segs.join("/");
    };
    const familyOf = (l) => (new URL(l).pathname.split("/").filter(Boolean)[0] || "/").toLowerCase();
    const spent = (l) => (visited.get(patternOf(l)) || 0) >= perRoute || (famVisits.get(familyOf(l)) || 0) >= perFamily;

    return {
        add(l) {
            const k = norm(l);
            if (seen.has(k) || queued.has(k)) return;
            const segs = new URL(k).pathname.split("/").filter(Boolean);
            if (segs.length) {
                const parent = "/" + segs.slice(0, -1).map(dynSeg).join("/");
                if (!kids.has(parent)) kids.set(parent, new Set());
                kids.get(parent).add(segs[segs.length - 1]);
                if (kids.get(parent).size > 4) collections.add(parent);
            }
            queued.add(k); queue.push(k);
        },
        // least-visited family and route type first, so every part of the site is seen once before any is seen twice
        next() {
            let best = -1, bestCost = Infinity;
            for (let i = 0; i < queue.length; i++) {
                if (spent(queue[i])) continue;
                const cost = (famVisits.get(familyOf(queue[i])) || 0) * 10 + (visited.get(patternOf(queue[i])) || 0);
                if (cost < bestCost) { best = i; bestCost = cost; if (cost === 0) break; }
            }
            if (best < 0) return null;
            const [url] = queue.splice(best, 1);
            queued.delete(url); seen.add(url);
            const p = patternOf(url), f = familyOf(url);
            visited.set(p, (visited.get(p) || 0) + 1); famVisits.set(f, (famVisits.get(f) || 0) + 1);
            return url;
        },
        repeated: () => queue.filter(spent).length,
        patternOf,
    };
}

module.exports = { createRouteBook, dynSeg };
