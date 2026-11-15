// Store-only ZIP writer (PNG/JPEG are already compressed). No dependency.
// makeZip builds in memory; zipStream writes entries straight to disk (one big ZIP, flat memory).
const T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u) => { let c = ~0; for (let i = 0; i < u.length; i++) c = T[(c ^ u[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
const enc = new TextEncoder();

function localHdr(nm, crc, sz) {
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, nm.length, true);
    return new Uint8Array(h.buffer);
}
function centralHdr(nm, crc, sz, off) {
    const h = new DataView(new ArrayBuffer(46));
    h.setUint32(0, 0x02014b50, true); h.setUint16(4, 20, true); h.setUint16(6, 20, true); h.setUint16(8, 0x0800, true); h.setUint16(14, 0x21, true);
    h.setUint32(16, crc, true); h.setUint32(20, sz, true); h.setUint32(24, sz, true); h.setUint16(28, nm.length, true); h.setUint32(42, off, true);
    return new Uint8Array(h.buffer);
}
function endRec(count, cdSize, off) {
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, count, true); e.setUint16(10, count, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
    return new Uint8Array(e.buffer);
}

export function makeZip(files) {
    const parts = [], cd = []; let off = 0;
    for (const f of files) {
        const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
        parts.push(localHdr(nm, crc, sz), nm, f.data); cd.push(centralHdr(nm, crc, sz, off), nm);
        off += 30 + nm.length + sz;
    }
    return new Blob([...parts, ...cd, endRec(files.length, cd.reduce((a, b) => a + b.length, 0), off)], { type: "application/zip" });
}

export function zipStream(w) { // w: FileSystemWritableFileStream
    const cd = []; let off = 0, count = 0;
    return {
        size: () => off,
        async add(name, data) {
            const nm = enc.encode(name), crc = crc32(data), sz = data.length;
            await w.write(localHdr(nm, crc, sz)); await w.write(nm); await w.write(data);
            cd.push(centralHdr(nm, crc, sz, off), nm); off += 30 + nm.length + sz; count++;
        },
        async finish() {
            let size = 0; for (const p of cd) { await w.write(p); size += p.length; }
            await w.write(endRec(count, size, off));
        },
    };
}
