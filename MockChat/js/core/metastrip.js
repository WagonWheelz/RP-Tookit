/* Removes hidden personal details from media files — GPS location, camera
   make and serial, author, dates, comments, embedded thumbnails — WITHOUT
   re-encoding them: the picture, clip or sound itself is copied bit for bit.
   Used when a project file (.mockchat.zip) is made, because those get shared.

   MetaStrip.strip(bytes, ext) -> { bytes, removed: [what was taken out] }

   What each format keeps:
     JPEG   the image, its colour profile (ICC) and JFIF/Adobe colour headers;
            if the photo was taken sideways, a tiny new EXIF block with ONLY the
            orientation, so it still shows the right way up. Everything after
            the image (phones append thumbnails and depth maps there, with
            their own GPS) is cut off.
     PNG    image and colour/animation chunks; text, eXIf and time chunks go.
     WebP   image, animation and colour profile; EXIF and XMP go.
     GIF    frames, the loop setting; comments and other app data go.
     MP4/MOV/M4A/3GP  the 'udta' and 'meta' boxes (where phones keep the
            location) are renamed to 'free' and blanked with zeros — players
            skip those — so every offset in the file stays valid. Nothing is
            removed or moved.
     AVIF/HEIC  the EXIF and XMP items are blanked with zeros and renamed.
     WebM/MKV   Tags, and Title / DateUTC / WritingApp, become Void elements of
            the same length.
     SVG    <metadata> and comments.
     MP3    ID3 tags.  FLAC  tags and pictures.  WAV  info/bext/iXML chunks.
   Anything else (Ogg/Opus, BMP…) is returned unchanged. */
(function (root) {
  'use strict';

  const str4 = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  const u16be = (b, o) => (b[o] << 8) | b[o + 1];
  const u32be = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
  const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const startsWith = (b, o, s) => { for (let i = 0; i < s.length; i++) if (b[o + i] !== s.charCodeAt(i)) return false; return true; };

  function concat(parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // ------------------------------------------------------------------ JPEG
  // The orientation (EXIF tag 0x0112) out of an APP1 Exif payload, or 0.
  function exifOrientation(b, start, end) {
    try {
      const t = start + 6;                                   // after "Exif\0\0"
      const le = b[t] === 0x49;                              // "II" little-endian, "MM" big
      const r16 = (o) => le ? (b[o] | (b[o + 1] << 8)) : u16be(b, o);
      const r32 = (o) => le ? u32le(b, o) : u32be(b, o);
      const ifd = t + r32(t + 4);
      const n = r16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > end) break;
        if (r16(e) === 0x0112) return r16(e + 8);
      }
    } catch (e) { /* a damaged block: no orientation */ }
    return 0;
  }

  // A minimal APP1: one IFD with one entry, Orientation.
  function orientationApp1(v) {
    const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8,        // "MM", 42, IFD at 8
      0, 1,                                                   // one entry
      0x01, 0x12, 0, 3, 0, 0, 0, 1, (v >> 8) & 255, v & 255, 0, 0,  // Orientation, SHORT, 1
      0, 0, 0, 0];                                            // no next IFD
    const payload = [0x45, 0x78, 0x69, 0x66, 0, 0].concat(tiff);  // "Exif\0\0"
    const len = payload.length + 2;
    return Uint8Array.from([0xff, 0xe1, len >> 8, len & 255].concat(payload));
  }

  function jpeg(b) {
    if (b[0] !== 0xff || b[1] !== 0xd8) return null;
    const out = [b.subarray(0, 2)];
    const removed = new Set();
    let orientation = 0, wroteOrientation = false, o = 2;

    const keepSegment = (marker, s, e) => {
      if (marker === 0xe0) return true;                                       // JFIF
      if (marker === 0xe2) return startsWith(b, s + 4, 'ICC_PROFILE\0');      // colour profile (not MPF/FPXR)
      if (marker === 0xee) return true;                                       // Adobe colour transform
      if (marker >= 0xe0 && marker <= 0xef) return false;                     // every other APPn
      if (marker === 0xfe) return false;                                      // comment
      return true;                                                            // tables, frame, scan…
    };

    while (o + 2 <= b.length) {
      if (b[o] !== 0xff) return null;                       // not where a marker should be: leave it alone
      const marker = b[o + 1];
      if (marker === 0xff) { o++; continue; }               // fill byte
      if (marker === 0xd9) { out.push(b.subarray(o, o + 2)); o += 2; break; }
      if (o + 4 > b.length) return null;
      const len = u16be(b, o + 2);
      const s = o, e = o + 2 + len;
      if (e > b.length) return null;
      if (marker === 0xe1 && startsWith(b, s + 4, 'Exif\0')) {
        orientation = orientation || exifOrientation(b, s + 4, e);
      }
      if (keepSegment(marker, s, e)) {
        // the orientation block goes where the EXIF was: after the APPn
        // headers, before the first table or frame header
        if (!wroteOrientation && !(marker >= 0xe0 && marker <= 0xef)) {
          if (orientation > 1) out.push(orientationApp1(orientation));
          wroteOrientation = true;
        }
        out.push(b.subarray(s, e));
      } else {
        removed.add(marker === 0xfe ? 'comment' : marker === 0xe1 ? 'EXIF/XMP (location, camera, dates)' : 'APP' + (marker - 0xe0) + ' data');
      }
      o = e;
      if (marker === 0xda) {
        // entropy-coded scan data runs until the next real marker
        let p = o;
        while (p + 1 < b.length) {
          if (b[p] === 0xff) {
            const n = b[p + 1];
            if (n === 0x00 || (n >= 0xd0 && n <= 0xd7) || n === 0xff) { p += (n === 0xff ? 1 : 2); continue; }
            break;
          }
          p++;
        }
        out.push(b.subarray(o, p));
        o = p;
      }
    }
    if (o < b.length) removed.add('extra data after the image (thumbnails, depth maps)');
    return { bytes: concat(out), removed: [...removed] };
  }

  // ------------------------------------------------------------------- PNG
  const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB',
    'bKGD', 'pHYs', 'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCV', 'cLLI', 'hIST', 'sPLT']);
  function png(b) {
    if (!(b[0] === 0x89 && startsWith(b, 1, 'PNG'))) return null;
    const out = [b.subarray(0, 8)];
    const removed = new Set();
    let o = 8;
    while (o + 12 <= b.length) {
      const len = u32be(b, o), type = str4(b, o + 4), e = o + 12 + len;
      if (e > b.length) return null;
      if (PNG_KEEP.has(type)) out.push(b.subarray(o, e)); else removed.add(type + ' chunk');
      o = e;
      if (type === 'IEND') break;
    }
    return { bytes: concat(out), removed: [...removed] };
  }

  // ------------------------------------------------------------------ WebP
  const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);
  function webp(b) {
    if (!(startsWith(b, 0, 'RIFF') && startsWith(b, 8, 'WEBP'))) return null;
    const out = [];
    const removed = new Set();
    let o = 12;
    while (o + 8 <= b.length) {
      const type = str4(b, o), size = u32le(b, o + 4), e = Math.min(b.length, o + 8 + size + (size & 1));
      if (WEBP_KEEP.has(type)) {
        const c = b.slice(o, e);
        if (type === 'VP8X') c[8] &= ~(0x08 | 0x04);       // no EXIF, no XMP any more
        out.push(c);
      } else removed.add(type.trim() + ' chunk');
      o = e;
    }
    const body = concat(out);
    const head = new Uint8Array(12);
    head.set(b.subarray(0, 12));
    const size = body.length + 4;
    head[4] = size & 255; head[5] = (size >> 8) & 255; head[6] = (size >> 16) & 255; head[7] = (size >>> 24) & 255;
    return { bytes: concat([head, body]), removed: [...removed] };
  }

  // ------------------------------------------------------------------- GIF
  function gif(b) {
    if (!startsWith(b, 0, 'GIF8')) return null;
    const removed = new Set();
    const out = [];
    let o = 13;
    const gctFlag = b[10] & 0x80;
    if (gctFlag) o += 3 * (1 << ((b[10] & 7) + 1));
    out.push(b.subarray(0, o));
    const skipSubBlocks = (p) => { while (p < b.length && b[p] !== 0) p += b[p] + 1; return p + 1; };
    while (o < b.length) {
      const t = b[o];
      if (t === 0x3b) { out.push(b.subarray(o, o + 1)); break; }
      if (t === 0x2c) {                                     // an image
        let p = o + 10;
        if (b[o + 9] & 0x80) p += 3 * (1 << ((b[o + 9] & 7) + 1));
        p = skipSubBlocks(p + 1);                           // LZW min code size, then data
        out.push(b.subarray(o, p));
        o = p;
        continue;
      }
      if (t === 0x21) {
        const label = b[o + 1];
        const e = skipSubBlocks(o + 2);
        let keep = label === 0xf9 || label === 0x01;        // frame timing, plain text
        if (label === 0xff && (startsWith(b, o + 3, 'NETSCAPE2.0') || startsWith(b, o + 3, 'ANIMEXTS1.0'))) keep = true;
        if (keep) out.push(b.subarray(o, e));
        else removed.add(label === 0xfe ? 'comment' : 'application data');
        o = e;
        continue;
      }
      return null;                                          // something unexpected: leave it alone
    }
    return { bytes: concat(out), removed: [...removed] };
  }

  // ------------------------------------------------------- MP4 / MOV / M4A
  // Retype metadata boxes to 'free' in place; sizes and offsets never move.
  const MP4_CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta']);
  function mp4(src) {
    if (!(src.length > 12 && (startsWith(src, 4, 'ftyp') || startsWith(src, 4, 'moov') || startsWith(src, 4, 'mdat') ||
          startsWith(src, 4, 'wide') || startsWith(src, 4, 'free')))) return null;
    const b = src.slice();
    const removed = new Set();
    let ok = true;
    const walk = (start, end, depth) => {
      let o = start;
      while (o + 8 <= end) {
        let size = u32be(b, o);
        const type = str4(b, o + 4);
        let header = 8;
        if (size === 1) {
          if (o + 16 > end) { ok = false; return; }
          size = u32be(b, o + 8) * 4294967296 + u32be(b, o + 12);
          header = 16;
        } else if (size === 0) size = end - o;
        if (size < header || o + size > end) { ok = false; return; }
        if (type === 'udta' || type === 'meta' || (type === 'uuid' && depth === 0) || type === 'XMP_') {
          b[o + 4] = 0x66; b[o + 5] = 0x72; b[o + 6] = 0x65; b[o + 7] = 0x65;   // 'free'
          b.fill(0, o + header, o + size);                  // and blank what it held: same size, unreadable
          removed.add(type === 'uuid' ? 'XMP box' : type + ' box (location, device, dates)');
        } else if (MP4_CONTAINERS.has(type)) {
          walk(o + header, o + size, depth + 1);
        }
        o += size;
      }
    };
    walk(0, b.length, 0);
    return ok ? { bytes: b, removed: [...removed] } : null;
  }

  // ------------------------------------------------------------ AVIF / HEIC
  // The photo's EXIF and XMP are "items" inside the top-level 'meta' box.
  // Their bytes (found through 'iloc') are blanked with zeros and the item's
  // type renamed, so a reader no longer finds them. Sizes and offsets never
  // change, so the picture itself is untouched.
  function heif(src) {
    if (!startsWith(src, 4, 'ftyp')) return null;
    const b = src.slice();
    const removed = new Set();
    const readN = (o, n) => n === 0 ? 0 : n === 2 ? u16be(b, o) : n === 4 ? u32be(b, o) : n === 8 ? u32be(b, o) * 4294967296 + u32be(b, o + 4) : NaN;
    const boxes = (start, end) => {
      const out = [];
      let o = start;
      while (o + 8 <= end) {
        let size = u32be(b, o), header = 8;
        if (size === 1) { size = u32be(b, o + 8) * 4294967296 + u32be(b, o + 12); header = 16; } else if (size === 0) size = end - o;
        if (size < header || o + size > end) return null;
        out.push({ type: str4(b, o + 4), o, start: o + header, end: o + size });
        o += size;
      }
      return out;
    };
    const top = boxes(0, b.length);
    const meta = top && top.find(x => x.type === 'meta');
    if (!meta) return { bytes: b, removed: [] };
    const kids = boxes(meta.start + 4, meta.end);                 // meta is a FullBox
    if (!kids) return null;
    const iinf = kids.find(x => x.type === 'iinf'), iloc = kids.find(x => x.type === 'iloc'), idat = kids.find(x => x.type === 'idat');
    if (!iinf || !iloc) return { bytes: b, removed: [] };
    // which items are Exif / XMP
    const hidden = new Set();
    const iv = b[iinf.start];
    const entries = boxes(iinf.start + 4 + (iv === 0 ? 2 : 4), iinf.end) || [];
    entries.filter(x => x.type === 'infe').forEach(e => {
      const v = b[e.start];
      if (v < 2) return;
      const id = v === 2 ? u16be(b, e.start + 4) : u32be(b, e.start + 4);
      const t = e.start + 4 + (v === 2 ? 2 : 4) + 2;
      const type = str4(b, t);
      if (type === 'Exif' || type === 'mime') {
        hidden.add(id);
        b[t] = 0x66; b[t + 1] = 0x72; b[t + 2] = 0x65; b[t + 3] = 0x65;   // 'free': an item type nothing reads
        removed.add(type === 'Exif' ? 'EXIF (location, camera, dates)' : 'XMP');
      }
    });
    if (!hidden.size) return { bytes: b, removed: [] };
    // and where their bytes are
    let o = iloc.start;
    const v = b[o]; o += 4;
    const offSize = b[o] >> 4, lenSize = b[o] & 15, baseSize = b[o + 1] >> 4, idxSize = v ? b[o + 1] & 15 : 0;
    o += 2;
    const count = v < 2 ? u16be(b, o) : u32be(b, o); o += v < 2 ? 2 : 4;
    for (let i = 0; i < count && o < iloc.end; i++) {
      const id = v < 2 ? u16be(b, o) : u32be(b, o); o += v < 2 ? 2 : 4;
      const method = v ? (u16be(b, o) & 15) : 0; if (v) o += 2;
      o += 2;                                                     // data_reference_index
      const base = readN(o, baseSize); o += baseSize;
      const n = u16be(b, o); o += 2;
      for (let k = 0; k < n; k++) {
        o += idxSize;
        const off = readN(o, offSize); o += offSize;
        const len = readN(o, lenSize); o += lenSize;
        if (!hidden.has(id)) continue;
        const at = (method === 1 && idat ? idat.start : 0) + base + off;
        if (method > 1 || !isFinite(at) || at + len > b.length) return null;
        b.fill(0, at, at + len);
      }
    }
    return { bytes: b, removed: [...removed] };
  }

  // -------------------------------------------------------------- WebM / MKV
  // Tags, and the title / date / app in Info, are overwritten in place by a
  // Void element of exactly the same length: nothing else moves.
  const EBML = { segment: 0x18538067, info: 0x1549A966, tags: 0x1254C367, cluster: 0x1F43B675 };
  const INFO_DROP = new Set([0x7BA9, 0x4461, 0x5741]);           // Title, DateUTC, WritingApp
  function ebml(src) {
    if (u32be(src, 0) !== 0x1A45DFA3) return null;
    const b = src.slice();
    const removed = new Set();
    const id = (o) => {
      const f = b[o];
      const len = f >= 0x80 ? 1 : f >= 0x40 ? 2 : f >= 0x20 ? 3 : f >= 0x10 ? 4 : 0;
      if (!len) return null;
      let v = 0; for (let i = 0; i < len; i++) v = v * 256 + b[o + i];
      return { v, len };
    };
    const size = (o) => {
      const f = b[o];
      let len = 1; while (len <= 8 && !(f & (0x80 >> (len - 1)))) len++;
      if (len > 8) return null;
      let v = f & (0xff >> len), ones = v === (0xff >> len);
      for (let i = 1; i < len; i++) { v = v * 256 + b[o + i]; if (b[o + i] !== 0xff) ones = false; }
      return { v: ones ? -1 : v, len };
    };
    const voidOut = (start, end) => {                             // same length, Void (0xEC), zeros
      const L = end - start;
      const k = Math.min(8, L - 1);
      const data = L - 1 - k;
      b.fill(0, start, end);
      b[start] = 0xEC;
      let v = data;
      for (let i = k; i >= 1; i--) { b[start + i] = v & 255; v = Math.floor(v / 256); }
      b[start + 1] |= (0x80 >> (k - 1));
    };
    const children = (start, end, fn) => {
      let o = start;
      while (o < end) {
        const i = id(o); if (!i) return false;
        const s = size(o + i.len); if (!s) return false;
        const dataStart = o + i.len + s.len;
        const dataEnd = s.v < 0 ? end : dataStart + s.v;
        if (dataEnd > end) return false;
        if (fn(i.v, o, dataStart, dataEnd) === false) return true;
        o = dataEnd;
      }
      return true;
    };
    let ok = true;
    children(0, b.length, (top, o, ds, de) => {
      if (top !== EBML.segment) return;
      ok = children(ds, de, (el, eo, eds, ede) => {
        if (el === EBML.tags) { voidOut(eo, ede); removed.add('tags (title, dates, names)'); }
        else if (el === EBML.info) {
          children(eds, ede, (ie, io, ids, ide) => {
            if (INFO_DROP.has(ie)) { voidOut(io, ide); removed.add('title / date / app'); }
          });
        } else if (el === EBML.cluster && ede === de) return false;  // a live, unsized cluster: stop here
      }) && ok;
    });
    return ok ? { bytes: b, removed: [...removed] } : null;
  }

  // -------------------------------------------------------------------- SVG
  function svg(src) {
    if (typeof TextDecoder === 'undefined') return null;
    const text = new TextDecoder().decode(src);
    if (!/<svg[\s>]/i.test(text)) return null;
    const out = text.replace(/<metadata[\s\S]*?<\/metadata\s*>/gi, '').replace(/<metadata[^>]*\/>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    if (out === text) return { bytes: src, removed: [] };
    return { bytes: new TextEncoder().encode(out), removed: ['metadata and comments'] };
  }

  // ------------------------------------------------------------- MP3 / FLAC / WAV
  function mp3(b) {
    let s = 0, e = b.length;
    const removed = [];
    while (startsWith(b, s, 'ID3') && s + 10 <= e) {
      const size = ((b[s + 6] & 127) << 21) | ((b[s + 7] & 127) << 14) | ((b[s + 8] & 127) << 7) | (b[s + 9] & 127);
      s += 10 + size + ((b[s + 5] & 0x10) ? 10 : 0);
      removed.push('ID3 tags');
    }
    if (e - s >= 128 && startsWith(b, e - 128, 'TAG')) { e -= 128; removed.push('ID3v1 tag'); }
    if (s > e) return null;
    return { bytes: b.slice(s, e), removed };
  }

  function flac(b) {
    if (!startsWith(b, 0, 'fLaC')) return null;
    const keep = [], removed = new Set();
    let o = 4, last = false;
    while (!last && o + 4 <= b.length) {
      last = !!(b[o] & 0x80);
      const type = b[o] & 0x7f, len = (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
      const blk = b.slice(o, o + 4 + len);
      if (type === 0 || type === 3 || type === 5) keep.push(blk);     // stream info, seek table, cue sheet
      else removed.add(type === 4 ? 'tags' : type === 6 ? 'embedded picture' : 'metadata block');
      o += 4 + len;
    }
    if (!keep.length || o > b.length) return null;
    keep.forEach((k, i) => { k[0] = (k[0] & 0x7f) | (i === keep.length - 1 ? 0x80 : 0); });
    return { bytes: concat([b.subarray(0, 4)].concat(keep, [b.subarray(o)])), removed: [...removed] };
  }

  const WAV_KEEP = new Set(['fmt ', 'data', 'fact', 'cue ', 'smpl']);
  function wav(b) {
    if (!(startsWith(b, 0, 'RIFF') && startsWith(b, 8, 'WAVE'))) return null;
    const out = [], removed = new Set();
    let o = 12;
    while (o + 8 <= b.length) {
      const type = str4(b, o), size = u32le(b, o + 4), e = Math.min(b.length, o + 8 + size + (size & 1));
      if (WAV_KEEP.has(type)) out.push(b.subarray(o, e)); else removed.add(type.trim() + ' chunk');
      o = e;
    }
    const body = concat(out);
    const head = b.slice(0, 12);
    const size = body.length + 4;
    head[4] = size & 255; head[5] = (size >> 8) & 255; head[6] = (size >> 16) & 255; head[7] = (size >>> 24) & 255;
    return { bytes: concat([head, body]), removed: [...removed] };
  }

  // ------------------------------------------------------------------ entry
  const BY_EXT = {
    jpg: jpeg, jpeg: jpeg, jfif: jpeg, png: png, apng: png, webp: webp, gif: gif,
    mp4: mp4, m4v: mp4, mov: mp4, m4a: mp4, '3gp': mp4, mp3: mp3, flac: flac, wav: wav,
    avif: heif, heic: heif, heif: heif, webm: ebml, mkv: ebml, weba: ebml, svg: svg
  };

  function strip(bytes, ext) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const fn = BY_EXT[String(ext || '').toLowerCase()];
    if (!fn) return { bytes: b, removed: [] };
    try {
      const r = fn(b);
      // anything the stripper does not understand is passed through untouched
      return r && r.bytes && r.bytes.length ? r : { bytes: b, removed: [] };
    } catch (e) {
      return { bytes: b, removed: [] };
    }
  }

  root.MetaStrip = { strip };
})(typeof window !== 'undefined' ? window : globalThis);
