# Terminal-bird

A web SSH client: connect to your servers from the browser with a full
xterm.js terminal. Self-hosted, keyless — your SSH credentials are entered
per session in the browser and never stored.

## How it works

- `server.ts` — Express + Socket.IO backend. Spawns `ssh2` connections and
  bridges them to the browser over WebSockets. `POST /api/verify` tests
  credentials before opening a shell.
- `src/` — React 19 + Vite + Tailwind frontend: connection form, then a
  full-screen xterm.js terminal with resize support.

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
  plain-HTTP dev server to the internet.
- No API keys required. Nothing is logged or persisted.
