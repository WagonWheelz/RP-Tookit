/* Animated WebP without an encoder.

   Chromium can already encode a single WebP through canvas.toBlob, so instead
   of shipping a VP8 encoder we take those per-frame files, pull the image
   chunks out of each, and re-wrap them in an animated RIFF container
   (VP8X + ANIM + one ANMF per frame). */
(function () {
  'use strict';

  const fourCC = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  // Everything after the WEBP fourCC that describes the picture itself.
  // A plain canvas WebP is 'VP8 ' (lossy) or 'VP8L' (lossless), optionally
  // preceded by 'ALPH'.
  function imageChunks(bytes) {
    if (bytes.length < 16 || fourCC(bytes, 0) !== 'RIFF' || fourCC(bytes, 8) !== 'WEBP') return null;
    const parts = [];
    let o = 12;
    while (o + 8 <= bytes.length) {
      const tag = fourCC(bytes, o);
      const size = u32(bytes, o + 4);
      const total = 8 + size + (size & 1);
      if (tag === 'VP8 ' || tag === 'VP8L' || tag === 'ALPH') {
        parts.push(bytes.subarray(o, Math.min(bytes.length, o + total)));
      }
      o += total;
    }
    return parts.length ? parts : null;
  }

  // Small headers are built as plain number arrays; frame data stays in typed
  // arrays and is copied once into the finished file. (Pushing every byte of a
  // big frame as a function argument used to overflow the call stack.)
  function w24(arr, v) { arr.push(v & 255, (v >> 8) & 255, (v >> 16) & 255); }
  function w32(arr, v) { arr.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255); }
  function wStr(arr, s) { for (let i = 0; i < s.length; i++) arr.push(s.charCodeAt(i)); }

  // a chunk as a list of pieces: its 8-byte header, its payload pieces, padding
  function chunk(tag, pieces) {
    const size = pieces.reduce((a, p) => a + p.length, 0);
    const head = [];
    wStr(head, tag);
    w32(head, size);
    const out = [Uint8Array.from(head)].concat(pieces);
    if (size & 1) out.push(new Uint8Array(1));         // chunks are even-aligned
    return out;
  }

  // frames: [{ bytes: Uint8Array (a complete simple .webp), delay: ms }]
  // Throws when not one frame was a real WebP (Safari hands back PNGs), so an
  // empty file is never reported as a success.
  function encode(frames, w, h, opts) {
    opts = opts || {};
    const body = [];

    const vp8x = [];
    vp8x.push(0x02);                                   // animation flag
    vp8x.push(0, 0, 0);                                // reserved
    w24(vp8x, w - 1);
    w24(vp8x, h - 1);
    body.push.apply(body, chunk('VP8X', [Uint8Array.from(vp8x)]));

    const anim = [];
    w32(anim, 0x00000000);                             // background, BGRA
    anim.push((opts.loops || 0) & 255, ((opts.loops || 0) >> 8) & 255);
    body.push.apply(body, chunk('ANIM', [Uint8Array.from(anim)]));

    let written = 0;
    for (let i = 0; i < frames.length; i++) {
      const parts = imageChunks(frames[i].bytes);
      if (!parts) continue;
      const anmf = [];
      w24(anmf, 0);                                    // x offset, in 2px units
      w24(anmf, 0);                                    // y offset
      w24(anmf, w - 1);
      w24(anmf, h - 1);
      w24(anmf, Math.max(1, Math.round(frames[i].delay || 60)));
      anmf.push(0x02);                                 // dispose none, no blend
      body.push.apply(body, chunk('ANMF', [Uint8Array.from(anmf)].concat(parts)));
      written++;
    }
    if (!written) throw new Error('This browser cannot make WebP images. Choose GIF instead.');

    const bodyLen = body.reduce((a, p) => a + p.length, 0);
    const head = [];
    wStr(head, 'RIFF');
    w32(head, 4 + bodyLen);
    wStr(head, 'WEBP');

    const out = new Uint8Array(head.length + bodyLen);
    out.set(head, 0);
    let o = head.length;
    for (const p of body) { out.set(p, o); o += p.length; }
    return out;
  }

  window.WebpMux = { encode, imageChunks };
})();
