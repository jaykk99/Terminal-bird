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
- **Saved-host import/export** — download all profiles as JSON (encrypted
  passwords stay encrypted inside the export), import on another device.
  Invalid entries are skipped and reported, never silently dropped.
- **Find in scrollback** — `Ctrl+F` in a terminal searches the buffer,
  Enter/Shift+Enter steps through matches with a live match count.
- **Latency graph** — the status bar shows a sparkline of recent round-trip
  ping samples next to the current latency.
- **Session quick-switch** — `Ctrl+K` opens a search over open sessions.
- **Connection audit log** — local-only record of connection attempts (host,
  user, time, outcome). Passwords are never recorded. Toggleable in the hub,
  clearable any time.

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

```bash
npm test         # vitest: crypto, profiles, audit log, server validation
npm run lint     # tsc --noEmit
```

## Deploy

### Docker

```bash
docker build -t terminal-bird .
docker run -p 3000:3000 -e PORT=3000 terminal-bird
```

The image builds the Vite frontend, bundles `server.ts`, and runs it via
`node dist/server.cjs`. A `HEALTHCHECK` probes `GET /api/health`.

### Render

`render.yaml` is a Render Blueprint: one-click deploy of the Docker service
with `healthCheckPath: /api/health`. Socket.IO works on Render web services
with no extra config — no sticky sessions needed since the app keeps session
state in a single instance.

## Reverse proxy (HTTPS)

The app itself speaks plain HTTP. Always terminate TLS in front of it in
production — SSH credentials travel browser → your server. The proxy must
forward WebSocket upgrades (Socket.IO).

**nginx:**

```nginx
server {
    listen 443 ssl;
    server_name ssh.example.com;

    ssl_certificate     /etc/ssl/certs/ssh.example.com.crt;
    ssl_certificate_key /etc/ssl/private/ssh.example.com.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;  # keep idle SSH sockets alive
    }
}
```

**Caddy (automatic HTTPS):**

```caddy
ssh.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy forwards the `Upgrade` header by default, so Socket.IO works with no
extra directives.

## Security notes

- Credentials travel between your browser and **your own server only**.
  Always serve over HTTPS (reverse proxy) in production — never expose the
  plain-HTTP server to the internet.
- No API keys required. Nothing is logged or persisted server-side.
- Profiles live in the browser that created them; the server never sees
  your passphrase.
