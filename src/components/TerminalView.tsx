import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { io, Socket } from 'socket.io-client';
import {
  KeyRound,
  RotateCcw,
  Timer,
  WifiOff,
  Keyboard,
  X,
  Search,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import 'xterm/css/xterm.css';
import type { SshCredentials, SshErrorCode, SshErrorInfo } from '../types';
import { MobileKeyBar } from './MobileKeyBar';

export type SessionEventType = 'connected' | 'disconnected' | 'error';

interface TerminalViewProps {
  credentials: SshCredentials;
  active: boolean;
  onDisconnect: () => void;
  /** Session lifecycle events (used for the local audit log in App). */
  onEvent?: (type: SessionEventType, detail?: string) => void;
}

type Phase = 'connecting' | 'connected' | 'error' | 'closed';

const ERROR_ICONS: Record<SshErrorCode, typeof WifiOff> = {
  auth: KeyRound,
  unreachable: WifiOff,
  timeout: Timer,
  validation: WifiOff,
  rate_limited: Timer,
  unknown: WifiOff,
};

const ERROR_TITLES: Record<SshErrorCode, string> = {
  auth: 'Authentication Failed',
  unreachable: 'Host Unreachable',
  timeout: 'Connection Timed Out',
  validation: 'Invalid Connection',
  rate_limited: 'Too Many Attempts',
  unknown: 'Connection Failed',
};

export function TerminalView({ credentials, active, onDisconnect, onEvent }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [phase, setPhase] = useState<Phase>('connecting');
  const [error, setError] = useState<SshErrorInfo | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [latencyHist, setLatencyHist] = useState<number[]>([]);
  const [showKeys, setShowKeys] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  );
  const [ctrlActive, setCtrlActive] = useState(false);
  // Find-in-scrollback state
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findPos, setFindPos] = useState<{ index: number; total: number } | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const findHitsRef = useRef<{ row: number; col: number }[]>([]);
  const ctrlRef = useRef(false);
  const attemptRef = useRef(0);
  const phaseRef = useRef<Phase>('connecting');
  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const writeKey = useCallback((seq: string) => {
    const s = socketRef.current;
    const term = termRef.current;
    if (!s || !s.connected) return;
    if (ctrlRef.current && /^[a-zA-Z]$/.test(seq)) {
      // Ctrl+letter -> control character
      const ch = String.fromCharCode(seq.toUpperCase().charCodeAt(0) - 64);
      s.emit('ssh-data', ch);
      ctrlRef.current = false;
      setCtrlActive(false);
      term?.focus();
      return;
    }
    s.emit('ssh-data', seq);
    term?.focus();
  }, []);

  // ── Find in scrollback ─────────────────────────────────────────────────
  // Walks the xterm buffer for the query, jumps the viewport to each hit and
  // selects it. Ctrl+F opens the bar (wired via attachCustomKeyEventHandler),
  // Enter/Shift+Enter step through matches, Esc closes.

  const collectFindHits = useCallback((): { row: number; col: number }[] => {
    const term = termRef.current;
    const hits: { row: number; col: number }[] = [];
    if (!term || !findQuery) return hits;
    const q = findQuery.toLowerCase();
    const buf = term.buffer.active;
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i);
      if (!line) continue;
      const text = line.translateToString(true).toLowerCase();
      let idx = text.indexOf(q);
      while (idx !== -1) {
        hits.push({ row: i, col: idx });
        idx = text.indexOf(q, idx + q.length);
      }
    }
    return hits;
  }, [findQuery]);

  const jumpToHit = useCallback(
    (index: number) => {
      const term = termRef.current;
      const hits = findHitsRef.current;
      if (!term || hits.length === 0) {
        setFindPos(null);
        return;
      }
      const wrapped = ((index % hits.length) + hits.length) % hits.length;
      const hit = hits[wrapped];
      const buf = term.buffer.active;
      term.scrollLines(hit.row - Math.floor(term.rows / 2) - buf.viewportY);
      term.select(hit.col, hit.row, findQuery.length);
      setFindPos({ index: wrapped, total: hits.length });
    },
    [findQuery],
  );

  const runFind = useCallback(() => {
    findHitsRef.current = collectFindHits();
    jumpToHit(0);
  }, [collectFindHits, jumpToHit]);

  const findStep = useCallback(
    (dir: 1 | -1) => {
      if (!findPos) {
        runFind();
        return;
      }
      jumpToHit(findPos.index + dir);
    },
    [findPos, runFind, jumpToHit],
  );

  // Re-run the search as the query changes; clear the selection on close.
  useEffect(() => {
    if (findOpen) {
      runFind();
      findInputRef.current?.focus();
    } else {
      termRef.current?.clearSelection();
      setFindPos(null);
    }
  }, [findOpen, runFind]);

  const connect = useCallback(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;

    attemptRef.current += 1;
    setPhaseBoth('connecting');
    setError(null);
    term.clear();
    term.writeln('\x1b[90mConnecting…\x1b[0m');

    socketRef.current?.disconnect();
    const s = io({ reconnection: false });
    socketRef.current = s;

    s.on('connect', () => {
      fit.fit();
      s.emit('init-ssh', {
        host: credentials.host,
        port: credentials.port,
        username: credentials.username,
        password: credentials.password,
        cols: term.cols,
        rows: term.rows,
      });
    });

    s.on('ssh-ready', () => {
      setPhaseBoth('connected');
      setError(null);
      term.clear();
      term.focus();
      onEvent?.('connected');
    });

    s.on('ssh-data', (data: string) => {
      term.write(data);
    });

    s.on('ssh-error', (info: SshErrorInfo | string) => {
      const normalized: SshErrorInfo =
        typeof info === 'string' ? { code: 'unknown', message: info } : info;
      setError(normalized);
      setPhaseBoth('error');
      term.writeln(`\r\n\x1b[31m${normalized.message}\x1b[0m`);
      onEvent?.('error', normalized.code);
    });

    s.on('ssh-close', () => {
      setPhaseBoth('closed');
      term.writeln('\r\n\x1b[31mConnection closed by remote host.\x1b[0m\r\n');
      onEvent?.('disconnected');
    });

    s.on('disconnect', (reason) => {
      if (phaseRef.current !== 'error' && reason !== 'io client disconnect') {
        setPhaseBoth('closed');
        onEvent?.('disconnected');
      }
    });

    // Round-trip latency via socket.io's own ping/pong.
    s.on('ping', () => {
      const t0 = performance.now();
      const onPong = () => {
        const ms = Math.round(performance.now() - t0);
        setLatency(ms);
        setLatencyHist((prev) => [...prev.slice(-29), ms]);
        s.off('pong', onPong);
      };
      s.on('pong', onPong);
    });
  }, [credentials, onEvent]);

  // One-time xterm setup.
  useEffect(() => {
    if (!terminalRef.current || termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      allowTransparency: false,
      theme: {
        background: '#0b0e14',
        foreground: '#e6e9ef',
        cursor: '#e6e9ef',
        cursorAccent: '#0b0e14',
        selectionBackground: '#2563eb55',
        black: '#0b0e14',
        red: '#ff5f56',
        green: '#5af78e',
        yellow: '#f3f99d',
        blue: '#57c7ff',
        magenta: '#ff6ac1',
        cyan: '#9aedfe',
        white: '#f1f1f0',
        brightBlack: '#686868',
        brightRed: '#ff5f56',
        brightGreen: '#5af78e',
        brightYellow: '#f3f99d',
        brightBlue: '#57c7ff',
        brightMagenta: '#ff6ac1',
        brightCyan: '#9aedfe',
        brightWhite: '#f1f1f0',
      },
      fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", Menlo, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.25,
      scrollback: 5000,
      convertEol: false,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Ctrl/Cmd+F opens find-in-scrollback instead of the browser's find.
    term.attachCustomKeyEventHandler((e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        setFindOpen(true);
        return false;
      }
      return true;
    });

    term.onData((data) => {
      if (ctrlRef.current && /^[a-zA-Z]$/.test(data)) {
        const ch = String.fromCharCode(data.toUpperCase().charCodeAt(0) - 64);
        socketRef.current?.emit('ssh-data', ch);
        ctrlRef.current = false;
        setCtrlActive(false);
        return;
      }
      socketRef.current?.emit('ssh-data', data);
    });

    return () => {
      socketRef.current?.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Connect on mount.
  useEffect(() => {
    if (termRef.current && attemptRef.current === 0) connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refit when the tab becomes visible again.
  useEffect(() => {
    if (active && fitRef.current && termRef.current) {
      requestAnimationFrame(() => {
        try {
          fitRef.current!.fit();
          socketRef.current?.emit('ssh-resize', {
            cols: termRef.current!.cols,
            rows: termRef.current!.rows,
          });
        } catch {
          /* terminal not laid out yet */
        }
      });
    }
  }, [active]);

  // Window resize -> refit.
  useEffect(() => {
    const handleResize = () => {
      if (!active || !fitRef.current || !termRef.current) return;
      try {
        fitRef.current.fit();
        socketRef.current?.emit('ssh-resize', {
          cols: termRef.current.cols,
          rows: termRef.current.rows,
        });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [active ]);

  const ErrIcon = error ? ERROR_ICONS[error.code] : WifiOff;

  /** Render a latency history as a 56x16 sparkline polyline. */
  const sparkPoints = (hist: number[]): string => {
    if (hist.length < 2) return '';
    const min = Math.min(...hist);
    const max = Math.max(...hist);
    const span = Math.max(1, max - min);
    return hist
      .map((v, i) => {
        const x = (i / (hist.length - 1)) * 56;
        const y = 15 - ((v - min) / span) * 14;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };
  const statusColor =
    phase === 'connected' ? 'bg-green-500' : phase === 'error' ? 'bg-red-500' : phase === 'closed' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse';
  const statusText =
    phase === 'connected'
      ? `Connected · ${credentials.port}`
      : phase === 'connecting'
        ? 'Connecting…'
        : phase === 'closed'
          ? 'Closed'
          : 'Failed';

  return (
    <div className={`flex-col h-full bg-[#0b0e14] ${active ? 'flex' : 'hidden'}`}>
      {/* Terminal surface */}
      <div className="flex-1 w-full relative overflow-hidden">
        <div ref={terminalRef} className="absolute inset-0 px-3 py-2" />
        {/* Find in scrollback */}
        {findOpen && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-[#161b22] border border-white/15 rounded-lg px-2 py-1.5 shadow-xl">
            <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <input
              ref={findInputRef}
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  findStep(e.shiftKey ? -1 : 1);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setFindOpen(false);
                }
              }}
              placeholder="Find in scrollback"
              className="w-40 bg-transparent text-xs text-white placeholder-white/30 focus:outline-none"
            />
            {findPos && findQuery && (
              <span className="text-[11px] text-white/40 font-mono shrink-0">
                {findPos.index + 1}/{findPos.total}
              </span>
            )}
            <button
              onClick={() => findStep(-1)}
              className="p-1 text-white/40 hover:text-white/80 rounded"
              title="Previous match (Shift+Enter)"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => findStep(1)}
              className="p-1 text-white/40 hover:text-white/80 rounded"
              title="Next match (Enter)"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setFindOpen(false)}
              className="p-1 text-white/40 hover:text-white/80 rounded"
              title="Close (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {/* reconnect overlay */}
        {(phase === 'error' || phase === 'closed') && (
          <button
            onClick={connect}
            className="absolute bottom-4 right-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reconnect
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (phase === 'error') && (
        <div className="bg-red-500/10 border-t border-red-500/20 px-4 py-3 flex items-start gap-3 shrink-0">
          <ErrIcon className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-red-200">{ERROR_TITLES[error.code]}</span>
            <span className="text-sm text-red-200/70 break-words">{error.message}</span>
            {error.code === 'auth' && (
              <button onClick={onDisconnect} className="text-left text-xs text-red-300/80 underline mt-1 w-fit">
                Edit credentials
              </button>
            )}
          </div>
          <button onClick={() => setError(null)} className="ml-auto p-1 text-red-300/60 hover:text-red-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mobile special-key bar */}
      {showKeys && (
        <MobileKeyBar
          onKey={writeKey}
          ctrlActive={ctrlActive}
          onToggleCtrl={() => {
            ctrlRef.current = !ctrlRef.current;
            setCtrlActive(ctrlRef.current);
            termRef.current?.focus();
          }}
        />
      )}

      {/* Status bar */}
      <div className="h-9 bg-[#111] border-t border-white/10 flex items-center justify-between px-3 shrink-0 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
          <span className="text-white/70 truncate font-mono">
            {credentials.username}@{credentials.host}
          </span>
          <span className="text-white/30">{statusText}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {latency !== null && phase === 'connected' && (
            <>
              {latencyHist.length > 1 && (
                <svg width="56" height="16" className="opacity-70" aria-hidden="true">
                  <polyline
                    points={sparkPoints(latencyHist)}
                    fill="none"
                    stroke="#5af78e"
                    strokeWidth="1.5"
                  />
                </svg>
              )}
              <span className="text-white/30 font-mono">{latency}ms</span>
            </>
          )}
          <button
            onClick={() => setShowKeys((v) => !v)}
            className={`p-1.5 rounded-md transition-colors ${showKeys ? 'text-blue-400 bg-blue-500/10' : 'text-white/40 hover:text-white/70'}`}
            title="Toggle special-key bar"
          >
            <Keyboard className="w-4 h-4" />
          </button>
          <button
            onClick={connect}
            className="p-1.5 rounded-md text-white/40 hover:text-white/70 transition-colors"
            title="Reconnect"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
