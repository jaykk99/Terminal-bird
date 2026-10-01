import React, { useState } from 'react';
import {
  Server,
  User,
  Key,
  Hash,
  Loader2,
  AlertCircle,
  Bookmark,
  Trash2,
  Lock,
  ShieldCheck,
  ChevronRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import type {
  ConnectionProfile,
  SshCredentials,
  SshErrorCode,
  SshErrorInfo,
} from '../types';
import {
  listProfiles,
  saveProfile,
  deleteProfile,
  touchProfile,
  newProfileId,
} from '../lib/profiles';
import { encryptSecret, decryptSecret, isEncryptedSecret } from '../lib/crypto';

interface ConnectionHubProps {
  onConnect: (creds: SshCredentials) => void;
  getPassphrase: () => string | null;
  setPassphrase: (p: string | null) => void;
}

const ERROR_TITLES: Record<SshErrorCode, string> = {
  auth: 'Authentication failed',
  unreachable: 'Host unreachable',
  timeout: 'Connection timed out',
  validation: 'Check your input',
  rate_limited: 'Slow down',
  unknown: 'Connection failed',
};

const inputCls =
  'w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all sm:text-sm';

export function ConnectionHub({ onConnect, getPassphrase, setPassphrase }: ConnectionHubProps) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [saveProfileChecked, setSaveProfileChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SshErrorInfo | null>(null);
  const [profiles, setProfiles] = useState<ConnectionProfile[]>(() => listProfiles());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Passphrase modal state
  const [passModal, setPassModal] = useState<null | { mode: 'set' | 'unlock'; profile?: ConnectionProfile }>(null);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState<string | null>(null);
  const [passBusy, setPassBusy] = useState(false);

  const verify = async (creds: SshCredentials): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const data = await response.json();
      if (data.success) {
        return true;
      }
      setError({ code: (data.code as SshErrorCode) || 'unknown', message: data.error || 'Failed to connect' });
      return false;
    } catch (err: any) {
      setError({ code: 'unknown', message: err?.message || 'Could not reach the Terminal-bird server.' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const connectNow = async (creds: SshCredentials, profileId?: string) => {
    const ok = await verify(creds);
    if (ok) {
      if (profileId) setProfiles(touchProfile(profileId));
      onConnect(creds);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const creds: SshCredentials = {
      host: host.trim(),
      port: port.trim() || '22',
      username: username.trim(),
      password: password || undefined,
    };

    if (saveProfileChecked) {
      const pp = getPassphrase();
      let encryptedPassword = null;
      if (creds.password && pp) {
        try {
          encryptedPassword = await encryptSecret(creds.password, pp);
        } catch {
          setError({ code: 'unknown', message: 'Could not encrypt the password for storage.' });
          return;
        }
      }
      const profile: ConnectionProfile = {
        id: newProfileId(),
        name: profileName.trim() || `${creds.username}@${creds.host}`,
        host: creds.host,
        port: creds.port,
        username: creds.username,
        encryptedPassword,
        createdAt: Date.now(),
      };
      setProfiles(saveProfile(profile));
      setSaveProfileChecked(false);
      setProfileName('');
    }

    await connectNow(creds);
  };

  const connectProfile = async (profile: ConnectionProfile) => {
    let pw: string | undefined;
    if (profile.encryptedPassword && isEncryptedSecret(profile.encryptedPassword)) {
      const pp = getPassphrase();
      if (!pp) {
        setPassInput('');
        setPassError(null);
        setPassModal({ mode: 'unlock', profile });
        return;
      }
      try {
        pw = await decryptSecret(profile.encryptedPassword, pp);
      } catch {
        setPassInput('');
        setPassError(null);
        setPassModal({ mode: 'unlock', profile });
        return;
      }
    }
    await connectNow(
      { host: profile.host, port: profile.port, username: profile.username, password: pw },
      profile.id,
    );
  };

  const fillFromProfile = (profile: ConnectionProfile) => {
    setHost(profile.host);
    setPort(profile.port);
    setUsername(profile.username);
    setPassword('');
    setProfileName(profile.name);
  };

  const submitPassModal = async () => {
    setPassError(null);
    if (!passInput) {
      setPassError('Enter your passphrase.');
      return;
    }
    setPassBusy(true);
    try {
      if (passModal?.mode === 'set') {
        // Validate by round-trip
        const test = await encryptSecret('terminal-bird', passInput);
        await decryptSecret(test, passInput);
        setPassphrase(passInput);
        setPassModal(null);
        setPassInput('');
      } else if (passModal?.mode === 'unlock' && passModal.profile?.encryptedPassword) {
        const pw = await decryptSecret(passModal.profile.encryptedPassword, passInput);
        setPassphrase(passInput);
        const profile = passModal.profile;
        setPassModal(null);
        setPassInput('');
        await connectNow(
          { host: profile.host, port: profile.port, username: profile.username, password: pw },
          profile.id,
        );
      }
    } catch {
      setPassError('Wrong passphrase — try again.');
    } finally {
      setPassBusy(false);
    }
  };

  const passphraseSet = getPassphrase() !== null;

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-3xl z-10 grid gap-6 md:grid-cols-2">
        {/* Connect card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-blue-600/20 rounded-2xl flex items-center justify-center mb-3 border border-blue-500/20">
              <Server className="w-7 h-7 text-blue-400" />
            </div>
            <h2 className="text-xl font-medium text-white tracking-tight">New Connection</h2>
            <p className="text-white/50 text-sm mt-1 text-center">SSH from your browser, anywhere.</p>
          </div>

          {error && (
            <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-200">{ERROR_TITLES[error.code]}</p>
                <p className="text-sm text-red-200/70 leading-relaxed">{error.message}</p>
              </div>
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
                    autoComplete="off"
                    spellCheck={false}
                    className={inputCls}
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
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
                    inputMode="numeric"
                    placeholder="22"
                    className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all sm:text-sm"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
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
                  autoComplete="username"
                  spellCheck={false}
                  className={inputCls}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/60 ml-1 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Key className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={inputCls}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={saveProfileChecked}
                onChange={(e) => setSaveProfileChecked(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <span className="text-sm text-white/60">Save as profile</span>
            </label>

            {saveProfileChecked && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60 ml-1 uppercase tracking-wider">Profile name</label>
                <div className="relative">
                  <Bookmark className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={`${username || 'user'}@${host || 'host'}`}
                    className={inputCls}
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                </div>
                {!passphraseSet && password && (
                  <p className="text-xs text-amber-300/80 flex items-start gap-1.5 pt-1">
                    <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Set a passphrase to encrypt the saved password. Without one, the password won't be stored.
                  </p>
                )}
              </div>
            )}

            <button
              disabled={loading || !host.trim() || !username.trim()}
              type="submit"
              className="w-full !mt-6 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verifying…
                </>
              ) : (
                'Connect to Terminal'
              )}
            </button>
          </form>

          <button
            onClick={() => {
              if (passphraseSet) {
                setPassphrase(null);
              } else {
                setPassInput('');
                setPassError(null);
                setPassModal({ mode: 'set' });
              }
            }}
            className="mt-4 w-full flex items-center justify-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            {passphraseSet ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
                Profile encryption on — tap to lock
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                Set a passphrase to encrypt saved passwords
              </>
            )}
          </button>
        </div>

        {/* Saved profiles card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl flex flex-col">
          <h3 className="text-xl font-medium text-white tracking-tight mb-1">Saved Hosts</h3>
          <p className="text-white/50 text-sm mb-5">
            Stored only in this browser. Passwords are encrypted with your passphrase (AES-256-GCM).
          </p>

          {profiles.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
              <Bookmark className="w-8 h-8 text-white/20 mb-3" />
              <p className="text-sm text-white/40">No saved hosts yet.</p>
              <p className="text-xs text-white/30 mt-1">Tick "Save as profile" when you connect.</p>
            </div>
          ) : (
            <div className="flex-1 space-y-2 overflow-y-auto max-h-[420px] pr-1">
              {profiles.map((p) => (
                <div
                  key={p.id}
                  className="group bg-black/20 border border-white/10 rounded-xl p-3 flex items-center gap-3 hover:border-white/20 transition-colors"
                >
                  <button
                    onClick={() => connectProfile(p)}
                    disabled={loading}
                    className="flex-1 min-w-0 text-left flex items-center gap-3 disabled:opacity-50"
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-600/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                      <Server className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{p.name}</p>
                      <p className="text-xs text-white/40 font-mono truncate">
                        {p.username}@{p.host}:{p.port}
                        {p.encryptedPassword ? ' · 🔒' : ''}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
                  </button>
                  <button
                    onClick={() => fillFromProfile(p)}
                    className="p-1.5 text-white/30 hover:text-white/70 rounded-lg"
                    title="Fill form"
                  >
                    <User className="w-4 h-4" />
                  </button>
                  {confirmDelete === p.id ? (
                    <button
                      onClick={() => {
                        setProfiles(deleteProfile(p.id));
                        setConfirmDelete(null);
                      }}
                      className="p-1.5 text-red-400 hover:text-red-300 rounded-lg text-xs font-medium"
                      title="Confirm delete"
                    >
                      Sure?
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(p.id)}
                      className="p-1.5 text-white/30 hover:text-red-400 rounded-lg"
                      title="Delete profile"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Passphrase modal */}
      {passModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#161b22] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center">
                <Lock className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-medium">
                  {passModal.mode === 'set' ? 'Set encryption passphrase' : 'Unlock saved password'}
                </h3>
                <p className="text-xs text-white/40">
                  {passModal.mode === 'set'
                    ? 'Encrypts saved passwords in this browser.'
                    : `Decrypt the password for ${passModal.profile?.name}.`}
                </p>
              </div>
            </div>
            <input
              type="password"
              autoFocus
              placeholder="Passphrase"
              className="w-full bg-black/30 border border-white/10 rounded-xl py-2.5 px-4 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 sm:text-sm mb-3"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitPassModal();
                if (e.key === 'Escape') {
                  setPassModal(null);
                  setPassInput('');
                }
              }}
            />
            {passError && <p className="text-xs text-red-400 mb-3">{passError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPassModal(null);
                  setPassInput('');
                }}
                className="flex-1 py-2.5 rounded-xl text-sm text-white/60 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitPassModal}
                disabled={passBusy}
                className="flex-1 py-2.5 rounded-xl text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {passBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : passModal.mode === 'set' ? 'Set' : 'Unlock'}
              </button>
            </div>
            {passModal.mode === 'set' && (
              <p className="text-[11px] text-white/30 mt-3 leading-relaxed">
                The passphrase lives only in this page's memory. If you forget it, saved passwords can't be
                recovered — just re-save the profile.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
