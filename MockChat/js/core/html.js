/* Safe-by-default markup.

   Every screen is built from html`…` templates. Whatever goes into a ${…}
   slot is escaped as text — quotes included — unless it is itself html`…`
   output. So a value from a project file can at worst show as odd text; it
   can never become live markup, even where the import guard misses it.

     html`<div class="row ${m.side}" data-id="${m.id}">${m.text}</div>`
     HTML.setHTML(el, html`…`)            instead of el.innerHTML = …
     HTML.insert(el, 'beforeend', html`…`) instead of insertAdjacentHTML

   Slots also take arrays (joined), false / null / undefined (nothing), and
   numbers. For values that go into CSS or attributes with a meaning:
     HTML.num(v, d)          a finite number, else d
     HTML.color(v, d)        a CSS colour (#hex, rgb()/rgba()/hsl()/hsla(),
                             a colour keyword), else d
     HTML.oneOf(v, list, d)  v if it is in list, else d

   HTML.trusted(s) wraps markup the app itself wrote (icon SVGs, static
   chrome) — never data. `npm run check` fails on innerHTML / insertAdjacentHTML
   anywhere but here, and on trusted() outside the files allowed to use it. */
(function (root) {
  'use strict';

  const SAFE = Symbol('safeHTML');
  const escText = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const isSafe = (v) => !!v && v[SAFE] === true;
  // no toString on purpose: markup glued with + becomes a plain string, which
  // setHTML() refuses, instead of slipping through as HTML
  const make = (s) => ({ [SAFE]: true, html: s });
  const part = (v) => Array.isArray(v) ? v.map(part).join('')
    : isSafe(v) ? v.html
    : (v === false || v == null) ? ''
    : escText(v);

  function html(strings, ...values) {
    let out = strings[0];
    for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
    return make(out);
  }
  // only for markup the app itself wrote — never for data
  const trusted = (s) => make(String(s == null ? '' : s));
  // a list of html`` pieces (or text) as one piece
  const join = (list, sep) => make((list || []).map(part).join(sep ? part(sep) : ''));

  function setHTML(el, v) {
    if (!isSafe(v)) throw new TypeError('setHTML needs html`` output');
    el.innerHTML = v.html;
  }
  function insert(el, where, v) {
    if (!isSafe(v)) throw new TypeError('insert needs html`` output');
    el.insertAdjacentHTML(where, v.html);
  }

  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : (d === undefined ? 0 : d); };
  const COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/+-]+\)|[a-z]{3,20})$/i;
  const color = (v, d) => (typeof v === 'string' && COLOR.test(v.trim()) ? v.trim() : (d === undefined ? 'transparent' : d));
  const oneOf = (v, list, d) => (list.indexOf(v) >= 0 ? v : d);

  root.HTML = { html, trusted, join, setHTML, insert, isSafe, escText, num, color, oneOf };
})(typeof window !== 'undefined' ? window : globalThis);
