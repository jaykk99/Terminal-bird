import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { io, Socket } from 'socket.io-client';
import { X, WifiOff, Terminal as TerminalIcon } from 'lucide-react';
import 'xterm/css/xterm.css';
import type { SshCredentials } from '../types';

interface TerminalViewProps {
  credentials: SshCredentials;
  onDisconnect: () => void;
}

export function TerminalView({ credentials, onDisconnect }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#0a0a0a',
        foreground: '#f3f4f6',
        cursor: '#f3f4f6',
        selectionBackground: '#2563eb40',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('init-ssh', {
        ...credentials,
        cols: term.cols,
        rows: term.rows,
      });
    });

    newSocket.on('ssh-ready', () => {
      setConnected(true);
      setError(null);
      term.focus();
    });

    newSocket.on('ssh-data', (data: string) => {
      term.write(data);
    });

    newSocket.on('ssh-error', (err: string) => {
      setError(err);
      setConnected(false);
    });

    newSocket.on('ssh-close', () => {
      setConnected(false);
      term.write('\r\n\x1b[31mConnection closed by remote host.\x1b[0m\r\n');
    });

    term.onData((data) => {
      newSocket.emit('ssh-data', data);
    });

    const handleResize = () => {
      fitAddon.fit();
      newSocket.emit('ssh-resize', { cols: term.cols, rows: term.rows });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      newSocket.disconnect();
      term.dispose();
    };
  }, [credentials]);

  return (
    <div className="flex flex-col h-screen max-h-screen bg-[#0a0a0a]">
      {/* Header bar */}
      <div className="h-14 bg-[#111] border-b border-white/10 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <TerminalIcon className="w-5 h-5 text-white/50" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white/90">
              {credentials.username}@{credentials.host}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : error ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} />
              <span className="text-xs text-white/40">
                {connected ? `Connected on port ${credentials.port}` : error ? 'Disconnected' : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>
        
        <button
          onClick={onDisconnect}
          className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
          title="Disconnect"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && !connected && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-3 flex items-start gap-3">
          <WifiOff className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-red-200">Connection Failed</span>
            <span className="text-sm text-red-200/70">{error}</span>
          </div>
        </div>
      )}

      {/* Terminal Container */}
      <div className="flex-1 w-full relative overflow-hidden p-2 pt-4">
        <div ref={terminalRef} className="absolute inset-0 pl-4 py-2" />
      </div>
    </div>
  );
}
