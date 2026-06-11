import React, { useState } from 'react';
import { Server, User, Key, Hash, LayoutTemplate, Loader2, AlertCircle } from 'lucide-react';
import type { SshCredentials } from '../types';

interface ConnectionFormProps {
  onConnect: (creds: SshCredentials) => void;
}

export function ConnectionForm({ onConnect }: ConnectionFormProps) {
  const [creds, setCreds] = useState<SshCredentials>({
    host: '',
    port: '22',
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds)
      });
      
      const data = await response.json();
      
      if (data.success) {
        onConnect(creds);
      } else {
        setError(data.error || 'Failed to connect');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mb-4 border border-white/5">
          <LayoutTemplate className="w-8 h-8 text-white/90" />
        </div>
        <h2 className="text-2xl font-medium text-white tracking-tight">Connect to Server</h2>
        <p className="text-white/50 text-sm mt-2 text-center">Enter your SSH credentials to establish a secure terminal session.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-200 leading-relaxed">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-white/60 ml-1 uppercase tracking-wider">Host</label>
            <div className="relative">
              <Server className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                required
                type="text"
                placeholder="192.168.1.1"
                className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all sm:text-sm"
                value={creds.host}
                onChange={e => setCreds(c => ({ ...c, host: e.target.value }))}
              />
            </div>
          </div>
          <div className="col-span-1 space-y-1.5">
            <label className="text-xs font-medium text-white/60 ml-1 uppercase tracking-wider">Port</label>
            <div className="relative">
              <Hash className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                required
                type="text"
                placeholder="22"
                className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all sm:text-sm"
                value={creds.port}
                onChange={e => setCreds(c => ({ ...c, port: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/60 ml-1 uppercase tracking-wider">Username</label>
          <div className="relative">
            <User className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              required
              type="text"
              placeholder="root"
              className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all sm:text-sm"
              value={creds.username}
              onChange={e => setCreds(c => ({ ...c, username: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/60 ml-1 uppercase tracking-wider">Password</label>
          <div className="relative">
            <Key className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              placeholder="••••••••"
              className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all sm:text-sm"
              value={creds.password}
              onChange={e => setCreds(c => ({ ...c, password: e.target.value }))}
            />
          </div>
        </div>

        <button
          disabled={loading || !creds.host || !creds.username}
          type="submit"
          className="w-full !mt-8 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Verifying...
            </>
          ) : (
            'Connect to Terminal'
          )}
        </button>
      </form>
    </div>
  );
}
