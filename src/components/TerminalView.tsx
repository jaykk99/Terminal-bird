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
} from 'lucide-react';
import 'xterm/css/xterm.css';
import type { SshCredentials, SshErrorCode, SshErrorInfo } from '../types';
import { MobileKeyBar } from './MobileKeyBar';

interface TerminalViewProps {
  credentials: SshCredentials;
  active: boolean;
  onDisconnect: () => void;
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

export function TerminalView({ credentials, active, onDisconnect }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [phase, setPhase] = useState<Phase>('connecting');
  const [error, setError] = useState<SshErrorInfo | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [showKeys, setShowKeys] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  );
  const [ctrlActive, setCtrlActive] = useState(false);
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
    });

    s.on('ssh-close', () => {
      setPhaseBoth('closed');
      term.writeln('\r\n\x1b[31mConnection closed by remote host.\x1b[0m\r\n');
    });

    s.on('disconnect', (reason) => {
      if (phaseRef.current !== 'error' && reason !== 'io client disconnect') {
        setPhaseBoth('closed');
      }
    });

    // Round-trip latency via socket.io's own ping/pong.
    s.on('ping', () => {
      const t0 = performance.now();
      const onPong = () => {
        setLatency(Math.round(performance.now() - t0));
        s.off('pong', onPong);
      };
      s.on('pong', onPong);
    });
  }, [credentials]);

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
            <span className="text-white/30 font-mono">{latency}ms</span>
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
