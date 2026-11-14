# MockChat Studio 3.5.0 — local web build

Fake chat / TikTok mockup studio, served from this box. No account, no internet,
no traffic leaves the LAN except nothing at all — the app is static files plus
your browser's IndexedDB.

## Run

```bash
./start.sh          # background, prints the URL
./stop.sh           # stop it
./serve.py          # or run in the foreground (--port 8443 --no-tls to debug)
./rollback.sh       # remove everything this install created
```

Open **https://mockchat.local:8443/** (after the hosts entry below) or
**https://192.168.1.62:8443/**.

### Why HTTPS and not HTTP

The web build exports video with WebCodecs (`VideoEncoder`/`AudioEncoder`),
which browsers only hand out in a *secure context* — HTTPS or localhost. Over
plain `http://192.168.1.62:8443` the editor still loads, but `videoExport`
comes back `false` in `js/platform/web.js:297` and the **Export video** button
is permanently disabled (`js/editor/inspector.js:646`).

The cert is self-signed, so the first visit shows "Not secure". Click
**Advanced → Proceed**. HTTPS stays a secure context after that, and WebCodecs
works. (Optional: import `.cert.pem` into the Windows trust store to kill the
warning for good.)

### Stable hostname (do this)

`window.api` keeps projects in IndexedDB, which is scoped **per origin**. If the
box's DHCP address changes, `https://192.168.1.62:8443` becomes a different
origin and your saved projects look like they vanished — they haven't, the
browser is just showing you a different store.

Give it a fixed name instead. On the Windows machine, as Administrator:

```
notepad C:\Windows\System32\drivers\etc\hosts
    192.168.1.62    mockchat.local
```

The cert already carries `DNS:mockchat.local` and `DNS:mockchat.lan`. A DHCP
reservation on the router achieves the same thing.

## What works (verified here, headless Chrome 145 over HTTPS)

| | |
|---|---|
| Editor boots, no console errors | yes |
| `isSecureContext` / `videoExport` | `true` / `true` |
| Starter templates seeded into IndexedDB | 2 (`whatsapp-ghosted`, `imessage-plot-twist`) |
| **Export image** → PNG | 1170×2532, real WhatsApp frame |
| **Export video** → WebM | VP9, 780×1688, 12.03 s, 718 KB |

Timings on this box (no GPU, software encode): ~5 s for a 2× still, ~86 s for a
12 s clip at 2× / 30 fps. A machine with a GPU will be much faster.

## Differences from the desktop .exe

Same codebase — `src/` is the web target, `electron/preload.js` is the desktop
one, both implementing the same `window.api`. In the browser:

- projects + imported media live in **IndexedDB**, not `templates/` `media/`
  `exports/` folders beside the app
- exports download normally (browser download folder)
- no "show in folder" / real folders (`fileSystem: false`)
- video is rendered frame-by-frame in the tab, so keep it open until it finishes

**Back up your work** with the Templates dialog (it exports a `.json` per
project). Clearing site data for the origin wipes everything.

## Licence

`package.json` declares `"license": "MIT"`. This copy is for internal use and
has been edited for that purpose.

## Security read

No `child_process`, no `eval`, no remote script loading, no telemetry, no
outbound endpoints. The only `fetch()` calls are for bundled local assets
(fonts, starter templates, media blobs). Under Electron: `contextIsolation:
true`, `nodeIntegration: false`.

The server has no auth — anyone on the LAN can open the tool and use it with
their own browser storage. Nobody can see *your* projects, since those live in
your browser.
