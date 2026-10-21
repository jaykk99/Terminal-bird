import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Client } from 'ssh2';
import path from 'path';

const app = express();
app.disable('x-powered-by');
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e6,
});
const PORT = parseInt(process.env.PORT || '3000', 10);

// ---------------------------------------------------------------------------
// Connection input validation
// ---------------------------------------------------------------------------

const MAX_HOST_LEN = 253;
const MAX_USERNAME_LEN = 32;
const MAX_PASSWORD_LEN = 1024;
const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.?$/;
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV6_RE = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
const USERNAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.\-]*$/;

export interface ValidatedConnection {
  host: string;
  port: number;
  username: string;
  password?: string;
}

export function validateConnectionInput(body: any): { ok: true; value: ValidatedConnection } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Request body must be a JSON object.' };

  const host = typeof body.host === 'string' ? body.host.trim() : '';
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const portRaw = typeof body.port === 'string' ? body.port.trim() : String(body.port ?? '');
  const password = typeof body.password === 'string' ? body.password : undefined;

  if (!host) return { ok: false, error: 'Host is required.' };
  if (host.length > MAX_HOST_LEN) return { ok: false, error: 'Host is too long.' };
  if (!(HOSTNAME_RE.test(host) || IPV4_RE.test(host) || IPV6_RE.test(host))) {
    return { ok: false, error: 'Host must be a valid hostname or IP address.' };
  }

  if (!username) return { ok: false, error: 'Username is required.' };
  if (username.length > MAX_USERNAME_LEN) return { ok: false, error: 'Username is too long.' };
  if (!USERNAME_RE.test(username)) return { ok: false, error: 'Username contains invalid characters.' };

  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'Port must be an integer between 1 and 65535.' };
  }

  if (password !== undefined && password.length > MAX_PASSWORD_LEN) {
    return { ok: false, error: 'Password is too long.' };
  }

  return { ok: true, value: { host, port, username, ...(password ? { password } : {}) } };
}

// ---------------------------------------------------------------------------
// Error classification — turns ssh2 noise into actionable messages.
// Passwords/credentials are never echoed back in error text.
// ---------------------------------------------------------------------------

export type SshErrorCode = 'auth' | 'unreachable' | 'timeout' | 'validation' | 'rate_limited' | 'unknown';

export interface SshErrorInfo {
  code: SshErrorCode;
  message: string;
}

export function classifySshError(err: any): SshErrorInfo {
  const message = err && (err.message || err.reason) ? String(err.message || err.reason) : '';
  const level = err && err.level ? String(err.level) : '';
  const code = err && err.code ? String(err.code) : '';

  if (level === 'client-authentication' || /authentication methods failed|no more auth methods|All configured authentication/i.test(message)) {
    return {
      code: 'auth',
      message: 'Authentication failed — wrong username or password. Check your credentials and try again.',
    };
  }
  if (code === 'ENOTFOUND' || /getaddrinfo|ENOTFOUND/i.test(message)) {
    return { code: 'unreachable', message: 'Could not resolve the host. Check the hostname or IP address.' };
  }
  if (code === 'ECONNREFUSED' || /ECONNREFUSED/i.test(message)) {
    return {
      code: 'unreachable',
      message: 'Connection refused. The host is reachable but nothing is listening on that port — is SSH running there?',
    };
  }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || /host unreachable|network unreachable/i.test(message)) {
    return { code: 'unreachable', message: 'Host unreachable. Check the address and your network path to it.' };
  }
  if (level === 'client-timeout' || /timed out|timeout/i.test(message)) {
    return {
      code: 'timeout',
      message: 'Connection timed out. The host may be down, firewalled, or blocking SSH from this network.',
    };
  }
  if (code === 'ECONNRESET' || code === 'EPIPE' || /ECONNRESET|EPIPE|socket hang up/i.test(message)) {
    return {
      code: 'unreachable',
      message: 'Connection reset before the SSH handshake. The host may not be running SSH on that port, or a firewall is interfering.',
    };
  }
  if (level === 'protocol' || /before handshake|handshake/i.test(message)) {
    return {
      code: 'unreachable',
      message: 'Connection lost before the SSH handshake. The host may not be running SSH, or a firewall is blocking it.',
    };
  }
  return { code: 'unknown', message: 'Connection failed. The host may be unavailable or SSH may not be running on that port.' };
}

// ---------------------------------------------------------------------------
// Rate limiter for /api/verify (brute-force oracle protection)
// ---------------------------------------------------------------------------

const VERIFY_LIMIT = 15; // attempts
const VERIFY_WINDOW_MS = 60_000;
const verifyAttempts = new Map<string, { count: number; resetAt: number }>();

function verifyRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = verifyAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    verifyAttempts.set(ip, { count: 1, resetAt: now + VERIFY_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > VERIFY_LIMIT;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of verifyAttempts) {
    if (now > entry.resetAt) verifyAttempts.delete(ip);
  }
}, VERIFY_WINDOW_MS).unref();

// ---------------------------------------------------------------------------
// SSH connection factory with sane timeouts + keepalive
// ---------------------------------------------------------------------------

const READY_TIMEOUT_MS = 10_000;
const KEEPALIVE_INTERVAL_MS = 15_000;
const KEEPALIVE_MAX_MISSES = 3;

function sshConnectOptions(value: ValidatedConnection) {
  return {
    host: value.host,
    port: value.port,
    username: value.username,
    ...(value.password ? { password: value.password } : {}),
    readyTimeout: READY_TIMEOUT_MS,
    keepaliveInterval: KEEPALIVE_INTERVAL_MS,
    keepaliveCountMax: KEEPALIVE_MAX_MISSES,
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

app.use(express.json({ limit: '16kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '1.1.0' });
});

// Verify endpoint: tests credentials without opening a shell.
app.post('/api/verify', (req, res) => {
  const ip = req.ip || 'unknown';
  if (verifyRateLimited(ip)) {
    res.status(429).json({
      success: false,
      code: 'rate_limited',
      error: 'Too many verification attempts. Wait a minute and try again.',
    });
    return;
  }

  const validation = validateConnectionInput(req.body);
  if (validation.ok === false) {
    res.status(400).json({ success: false, code: 'validation', error: validation.error });
    return;
  }

  const conn = new Client();
  let responded = false;
  const respond = (status: number, payload: object) => {
    if (responded) return;
    responded = true;
    try {
      conn.end();
    } catch {
      /* already closed */
    }
    res.status(status).json(payload);
  };

  conn
    .on('ready', () => {
      respond(200, { success: true });
    })
    .on('timeout', () => {
      const info = classifySshError({ level: 'client-timeout' });
      respond(400, { success: false, code: info.code, error: info.message });
    })
    .on('error', (err) => {
      const info = classifySshError(err);
      respond(400, { success: false, code: info.code, error: info.message });
    })
    .connect(sshConnectOptions(validation.value));

  // Hard upper bound so a hung connect can never leave the request dangling.
  setTimeout(() => {
    respond(504, {
      success: false,
      code: 'timeout',
      error: 'Connection timed out. The host may be down, firewalled, or blocking SSH from this network.',
    });
  }, READY_TIMEOUT_MS + 5_000).unref();
});

// ---------------------------------------------------------------------------
// Socket.IO SSH bridging
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  let conn: Client | null = null;
  let stream: any = null;
  let sshConnected = false;

  const cleanup = () => {
    if (conn) {
      try {
        conn.end();
      } catch {
        /* already closed */
      }
      conn = null;
    }
    stream = null;
    sshConnected = false;
  };

  const fail = (info: SshErrorInfo) => {
    socket.emit('ssh-error', info);
    cleanup();
  };

  const wireStream = () => {
    if (stream && !(stream as any).__tbWired) {
      (stream as any).__tbWired = true;
      stream
        .on('data', (d: any) => {
          socket.emit('ssh-data', d.toString('utf-8'));
        })
        .on('close', () => {
          socket.emit('ssh-close');
          cleanup();
        });
    }
  };

  socket.on('init-ssh', (data) => {
    if (sshConnected || conn) {
      fail({ code: 'unknown', message: 'A session is already active on this connection.' });
      return;
    }

    const validation = validateConnectionInput(data);
    if (validation.ok === false) {
      fail({ code: 'validation', message: validation.error });
      return;
    }

    const colsRaw = data && data.cols;
    const rowsRaw = data && data.rows;
    const termCols = Number.isInteger(colsRaw) && colsRaw > 0 && colsRaw <= 500 ? colsRaw : 80;
    const termRows = Number.isInteger(rowsRaw) && rowsRaw > 0 && rowsRaw <= 200 ? rowsRaw : 24;

    conn = new Client();
    conn
      .on('ready', () => {
        conn!.shell({ term: 'xterm-256color', cols: termCols, rows: termRows }, (err, s) => {
          if (err) {
            fail(classifySshError(err));
            return;
          }
          stream = s;
          sshConnected = true;
          wireStream();
          socket.emit('ssh-ready');
        });
      })
      .on('timeout', () => {
        fail(classifySshError({ level: 'client-timeout' }));
      })
      .on('error', (err) => {
        // 'error' can fire both before and during a session; report and tear down.
        if (!sshConnected) {
          fail(classifySshError(err));
        } else {
          socket.emit('ssh-error', classifySshError(err));
          cleanup();
        }
      })
      .connect(sshConnectOptions(validation.value));
  });

  socket.on('ssh-data', (d) => {
    if (stream && typeof d === 'string' && d.length <= 65536) stream.write(d);
  });

  socket.on('ssh-resize', (size) => {
    const c = size && size.cols;
    const r = size && size.rows;
    if (stream && Number.isInteger(c) && Number.isInteger(r) && c > 0 && c <= 500 && r > 0 && r <= 200) {
      stream.setWindow(r, c, 0, 0);
    }
  });

  socket.on('disconnect', () => {
    cleanup();
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    // The asterisk needs to be compatible with express 4/5 depending on version
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Skipped under test (TB_NO_LISTEN=1) so the exported validators and error
// classifier can be unit-tested without binding a port.
if (process.env.TB_NO_LISTEN !== '1') {
  startServer();
}
