# Terminal-bird

A web SSH client: connect to your servers from the browser with a full
xterm.js terminal. Self-hosted, keyless — your SSH credentials are entered
per session in the browser and never leave your own server.

## Features

- **Tabbed sessions** — open multiple SSH sessions side by side; switch with
  `Alt+1…9`, `Alt+N` for a new session, `Alt+W` to close the active one.
- **Saved hosts** — connection profiles stored only in your browser's
  localStorage. Passwords are encrypted at rest with AES-256-GCM
  (PBKDF2-SHA256, 100k iterations) under a passphrase that lives only in
  the page's memory — forget the passphrase and saved passwords can't be
  recovered, by design. Without a passphrase, passwords are never stored.
- **Mobile-friendly** — on-screen special-key bar (Esc, Tab, arrows, PgUp/Dn,
  sticky Ctrl) auto-shown on touch devices; responsive layout; per-session
  reconnect and a live latency readout in the status bar.
- **Hardened backend** — strict input validation (host/port/username),
  classified errors (auth failure vs unreachable vs timeout vs reset),
  10s connect timeouts, SSH keepalive (15s), and rate limiting on the
  verify endpoint (15 attempts/min per IP). Credentials are never logged.

## How it works

- `server.ts` — Express + Socket.IO backend. Spawns `ssh2` connections and
  bridges them to the browser over WebSockets. `POST /api/verify` tests
  credentials before opening a shell; `GET /api/health` is a liveness probe.
- `src/` — React 19 + Vite + Tailwind frontend:
  - `components/ConnectionHub.tsx` — connect form + saved-host manager +
    passphrase unlock modal.
  - `components/TerminalView.tsx` — xterm.js terminal with fit, resize,
    mobile key bar, latency, and reconnect.
  - `components/TabBar.tsx` — multi-session tabs.
  - `lib/crypto.ts` — AES-GCM passphrase encryption for saved passwords.
  - `lib/profiles.ts` — localStorage profile store.

## Run

```bash
npm install
npm run dev      # vite middleware + socket.io on :3000
# production:
npm run build
npm start        # serves dist/ + API on $PORT (default 3000)
```

Set `PORT` to change the listen port.

## Security notes

- Credentials travel between your browser and **your own server only**.
  Always serve over HTTPS (reverse proxy) in production — never expose the
  plain-HTTP server to the internet.
- No API keys required. Nothing is logged or persisted server-side.
- Profiles live in the browser that created them; the server never sees
  your passphrase.
