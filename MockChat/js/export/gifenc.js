/* A small, dependency-free animated GIF encoder.

   Two ways in:

   GifEnc.createStream(w, h, opts) — frames are encoded the moment they arrive
     and then let go, so memory stays flat however long the animation is
     (hand-over issue 13: holding every raw frame of an XL GIF took ~380 MB).
     The first frame's palette becomes the global one and is reused while it
     still fits; when new colours turn up (a photo sliding in, an emoji burst)
     that frame gets a palette of its own, which then carries on.

   GifEnc.encode(frames, w, h, opts) — every frame at once: one global palette
     by median cut over pixels sampled from all of them. Used by the desktop
     recorder, which captures live and must not stop to encode.

   Each frame is mapped to its palette through a 15-bit colour cache and LZW
   packed into a GIF89a with a NETSCAPE looping block. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- writer
  // Bytes go into 64 KB blocks rather than one growing array of numbers,
  // which cost about 8 bytes of memory for every byte of GIF.
  function Bytes() { this.blocks = []; this.cur = new Uint8Array(65536); this.n = 0; this.total = 0; }
  Bytes.prototype.u8 = function (v) {
    if (this.n === this.cur.length) { this.blocks.push(this.cur); this.cur = new Uint8Array(65536); this.n = 0; }
    this.cur[this.n++] = v & 255;
    this.total++;
    return this;
  };
  Bytes.prototype.u16 = function (v) { return this.u8(v).u8(v >> 8); };
  Bytes.prototype.str = function (s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); return this; };
  Bytes.prototype.raw = function (a) { for (let i = 0; i < a.length; i++) this.u8(a[i]); return this; };
  Bytes.prototype.out = function () {
    const out = new Uint8Array(this.total);
    let o = 0;
    for (const b of this.blocks) { out.set(b, o); o += b.length; }
    out.set(this.cur.subarray(0, this.n), o);
    return out;
  };

  // ------------------------------------------------------------ median cut
  // datas: RGBA arrays; about `samples` pixels are taken from them in all
  function buildPalette(datas, w, h, maxColors, samples) {
    const step = Math.max(1, Math.floor((w * h * datas.length) / (samples || 90000))) * 4;
    const pts = [];
    for (let f = 0; f < datas.length; f++) {
      const d = datas[f];
      for (let i = 0; i < d.length; i += step) pts.push([d[i], d[i + 1], d[i + 2]]);
    }
    if (!pts.length) pts.push([0, 0, 0]);

    let boxes = [pts];
    while (boxes.length < maxColors) {
      // split whichever box spans the widest single channel
      let bi = -1, best = -1, ch = 0;
      for (let i = 0; i < boxes.length; i++) {
        const bx = boxes[i];
        if (bx.length < 2) continue;
        let lo = [255, 255, 255], hi = [0, 0, 0];
        for (let j = 0; j < bx.length; j++) {
          for (let c = 0; c < 3; c++) {
            if (bx[j][c] < lo[c]) lo[c] = bx[j][c];
            if (bx[j][c] > hi[c]) hi[c] = bx[j][c];
          }
        }
        for (let c = 0; c < 3; c++) {
          const span = hi[c] - lo[c];
          if (span > best) { best = span; bi = i; ch = c; }
        }
      }
      if (bi < 0 || best <= 0) break;
      const box = boxes[bi];
      box.sort((a, b) => a[ch] - b[ch]);
      const mid = box.length >> 1;
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }

    const pal = [];
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i];
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < bx.length; j++) { r += bx[j][0]; g += bx[j][1]; b += bx[j][2]; }
      pal.push([Math.round(r / bx.length), Math.round(g / bx.length), Math.round(b / bx.length)]);
    }
    while (pal.length < 2) pal.push([0, 0, 0]);
    return pal;
  }

  const dist = (r, g, b, c) => { const dr = r - c[0], dg = g - c[1], db = b - c[2]; return dr * dr * 3 + dg * dg * 6 + db * db; };  // weighted for the eye

  function makeMapper(pal) {
    const cache = new Int16Array(32768).fill(-1);
    return function (r, g, b) {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const hit = cache[key];
      if (hit >= 0) return hit;
      let best = 0, bd = Infinity;
      for (let i = 0; i < pal.length; i++) {
        const d = dist(r, g, b, pal[i]);
        if (d < bd) { bd = d; best = i; }
      }
      cache[key] = best;
      return best;
    };
  }

  // a palette ready to use: colours, mapper, table size in bits
  function prepare(pal) {
    let bits = 1;
    while ((1 << bits) < pal.length) bits++;
    return { pal, map: makeMapper(pal), bits };
  }
  function writeTable(out, p) {
    for (let i = 0; i < (1 << p.bits); i++) {
      const c = p.pal[i] || [0, 0, 0];
      out.u8(c[0]).u8(c[1]).u8(c[2]);
    }
  }

  // ------------------------------------------------------------------ LZW
  function lzw(indices, minCodeSize, out) {
    const clear = 1 << minCodeSize;
    const eoi = clear + 1;
    let codeSize = minCodeSize + 1;
    let next = eoi + 1;
    let dict = new Map();

    const chunk = [];
    let cur = 0, curBits = 0;

    function emit(code) {
      cur |= code << curBits;
      curBits += codeSize;
      while (curBits >= 8) {
        chunk.push(cur & 255);
        cur >>= 8; curBits -= 8;
        if (chunk.length === 255) { out.u8(255).raw(chunk); chunk.length = 0; }
      }
    }
    function resetDict() {
      dict = new Map();
      codeSize = minCodeSize + 1;
      next = eoi + 1;
    }

    emit(clear);
    resetDict();
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = prefix * 4096 + k;
      if (dict.has(key)) { prefix = dict.get(key); continue; }
      emit(prefix);
      if (next < 4096) {
        dict.set(key, next);
        if (next === (1 << codeSize) && codeSize < 12) codeSize++;
        next++;
      } else {
        // The table is full: start over. This used to add a 4097th code and
        // then count past the reset, leaving the encoder one code ahead of
        // every decoder — any frame busy enough to fill the table (a photo,
        // a gradient, a long chat) came out as garbage from there on.
        emit(clear);
        resetDict();
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (curBits > 0) chunk.push(cur & 255);
    if (chunk.length) out.u8(chunk.length).raw(chunk);
    out.u8(0);
  }

  // ------------------------------------------------------------ the parts
  function writeHeader(out, w, h, global) {
    out.str('GIF89a').u16(w).u16(h);
    out.u8(0xF0 | (global.bits - 1)).u8(0).u8(0);       // global table, no background
    writeTable(out, global);
    out.u8(0x21).u8(0xFF).u8(11).str('NETSCAPE2.0').u8(3).u8(1).u16(0).u8(0);   // loop forever
  }

  // local: a palette of this frame's own, or null to use the global one
  function writeFrame(out, idx, rgba, w, h, delay, p, local) {
    const px = w * h;
    for (let i = 0, q = 0; i < px; i++, q += 4) idx[i] = p.map(rgba[q], rgba[q + 1], rgba[q + 2]);
    const cs = Math.max(1, Math.round((delay || 60) / 10));            // GIF ticks are 1/100s
    out.u8(0x21).u8(0xF9).u8(4).u8(0x04).u16(cs).u8(0).u8(0);           // no transparency, keep frame
    out.u8(0x2C).u16(0).u16(0).u16(w).u16(h).u8(local ? 0x80 | (p.bits - 1) : 0);
    if (local) writeTable(out, p);
    const minCode = Math.max(2, p.bits);
    out.u8(minCode);
    lzw(idx, minCode, out);
  }

  // --------------------------------------------------------- all at once
  // frames: [{ data: Uint8ClampedArray (RGBA), delay: ms }]
  function encode(frames, w, h, opts) {
    opts = opts || {};
    const onProgress = opts.onProgress || function () {};
    const global = prepare(buildPalette(frames.map(f => f.data), w, h, Math.max(2, Math.min(256, opts.colors || 256))));
    const out = new Bytes();
    writeHeader(out, w, h, global);
    const idx = new Uint8Array(w * h);
    for (let f = 0; f < frames.length; f++) {
      writeFrame(out, idx, frames[f].data, w, h, frames[f].delay, global, false);
      onProgress((f + 1) / frames.length);
    }
    out.u8(0x3B);
    return out.out();
  }

  // ----------------------------------------------------- one at a time
  // Does this palette still suit the frame? Checks ~4000 sampled pixels: if
  // more than 0.5% land further than about 8 levels per channel from their
  // nearest colour, something new is on screen and it gets a palette of its own.
  const FIT_LIMIT = 8 * 8 * 10;
  function fits(rgba, w, h, p) {
    const step = Math.max(1, Math.floor((w * h) / 4000)) * 4;
    let n = 0, far = 0;
    for (let q = 0; q < rgba.length; q += step) {
      n++;
      if (dist(rgba[q], rgba[q + 1], rgba[q + 2], p.pal[p.map(rgba[q], rgba[q + 1], rgba[q + 2])]) > FIT_LIMIT) far++;
    }
    return far <= n * 0.005;
  }

  function createStream(w, h, opts) {
    opts = opts || {};
    const maxColors = Math.max(2, Math.min(256, opts.colors || 256));
    const out = new Bytes();
    const idx = new Uint8Array(w * h);
    // 20,000 sampled pixels per palette: as accurate here as 60,000, and four
    // times quicker — it matters, a busy animation can need a hundred palettes
    const SAMPLES = 20000;
    let global = null, cur = null, frames = 0, palettes = 0;
    const recent = [];                 // the last few palettes: colours that come back reuse one
    return {
      // rgba: this frame's pixels — not kept after the call returns
      addFrame(rgba, delay) {
        if (!global) {
          global = cur = prepare(buildPalette([rgba], w, h, maxColors, SAMPLES));
          palettes++;
          writeHeader(out, w, h, global);
        } else if (!fits(rgba, w, h, cur)) {
          cur = [global].concat(recent).find(p => p !== cur && fits(rgba, w, h, p)) || null;
          if (!cur) {
            cur = prepare(buildPalette([rgba], w, h, maxColors, SAMPLES));
            palettes++;
            recent.unshift(cur);
            if (recent.length > 6) recent.pop();
          }
        }
        writeFrame(out, idx, rgba, w, h, delay, cur, cur !== global);
        frames++;
      },
      get frames() { return frames; },
      get palettes() { return palettes; },
      get size() { return out.total; },
      finish() {
        if (!global) throw new Error('No frames to encode.');
        out.u8(0x3B);
        return out.out();
      }
    };
  }

  window.GifEnc = { encode, createStream };
})();
