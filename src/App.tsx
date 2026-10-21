/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionHub } from './components/ConnectionHub';
import { TerminalView, type SessionEventType } from './components/TerminalView';
import { TabBar } from './components/TabBar';
import { recordAudit } from './lib/audit';
import type { SessionTab, SshCredentials } from './types';

function newTabId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [tabs, setTabs] = useState<SessionTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showHub, setShowHub] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherQuery, setSwitcherQuery] = useState('');
  const passphraseRef = useRef<string | null>(null);

  const getPassphrase = useCallback(() => passphraseRef.current, []);
  const setPassphrase = useCallback((p: string | null) => {
    passphraseRef.current = p;
  }, []);

  const openSession = useCallback((creds: SshCredentials) => {
    const id = newTabId();
    const tab: SessionTab = {
      id,
      label: `${creds.username}@${creds.host}`,
      creds,
      createdAt: Date.now(),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveId(id);
    setShowHub(false);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      setActiveId((cur) => {
        if (cur !== id) return cur;
        if (next.length === 0) {
          setShowHub(true);
          return null;
        }
        return next[next.length - 1].id;
      });
      return next;
    });
  }, []);

  // Keyboard shortcuts: Alt+1..9 switch tabs, Alt+N new, Alt+W close active,
  // Ctrl/Cmd+K opens the session quick-switcher.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        const t = e.target as HTMLElement | null;
        const typing =
          t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (!typing && tabs.length > 1) {
          e.preventDefault();
          setSwitcherQuery('');
          setSwitcherOpen(true);
        }
        return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === 'n') {
        e.preventDefault();
        setShowHub(true);
        return;
      }
      if (key === 'w' && activeId) {
        e.preventDefault();
        closeTab(activeId);
        return;
      }
      const n = parseInt(key, 10);
      if (n >= 1 && n <= 9 && tabs[n - 1]) {
        e.preventDefault();
        setActiveId(tabs[n - 1].id);
        setShowHub(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabs, activeId, closeTab]);

  /** Record session lifecycle events to the local audit log. */
  const handleSessionEvent = useCallback(
    (tab: SessionTab) => (type: SessionEventType, detail?: string) => {
      recordAudit({
        host: tab.creds.host,
        port: tab.creds.port,
        username: tab.creds.username,
        outcome: type,
        detail,
      });
    },
    [],
  );

  const filteredTabs = switcherQuery
    ? tabs.filter((t) =>
        `${t.label} ${t.creds.host} ${t.creds.username}`.toLowerCase().includes(switcherQuery.toLowerCase()),
      )
    : tabs;

  if (showHub || tabs.length === 0) {
    return (
      <>
        {tabs.length > 0 && (
          <div className="fixed top-0 left-0 right-0 z-40">
            <TabBar
              tabs={tabs}
              activeId={activeId}
              onSelect={(id) => {
                setActiveId(id);
                setShowHub(false);
              }}
              onClose={closeTab}
              onNew={() => setShowHub(true)}
            />
          </div>
        )}
        <div className={tabs.length > 0 ? 'pt-11' : ''}>
          <ConnectionHub onConnect={openSession} getPassphrase={getPassphrase} setPassphrase={setPassphrase} />
        </div>
      </>
    );
  }

  return (
    <div className="h-screen max-h-screen flex flex-col bg-[#0b0e14]">
      <TabBar
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={closeTab}
        onNew={() => setShowHub(true)}
      />
      <div className="flex-1 min-h-0 relative">
        {tabs.map((tab) => (
          <TerminalView
            key={tab.id}
            credentials={tab.creds}
            active={tab.id === activeId}
            onDisconnect={() => closeTab(tab.id)}
            onEvent={handleSessionEvent(tab)}
          />
        ))}
      </div>

      {/* Session quick-switcher (Ctrl/Cmd+K) */}
      {switcherOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 p-4"
          onClick={() => setSwitcherOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#161b22] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={switcherQuery}
              onChange={(e) => setSwitcherQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSwitcherOpen(false);
                else if (e.key === 'Enter' && filteredTabs.length > 0) {
                  setActiveId(filteredTabs[0].id);
                  setShowHub(false);
                  setSwitcherOpen(false);
                }
              }}
              placeholder="Search sessions…"
              className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none border-b border-white/10"
            />
            <div className="max-h-64 overflow-y-auto py-1">
              {filteredTabs.length === 0 && (
                <p className="px-4 py-3 text-xs text-white/30">No sessions match.</p>
              )}
              {filteredTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveId(t.id);
                    setShowHub(false);
                    setSwitcherOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    t.id === activeId ? 'bg-blue-600/15 text-white' : 'text-white/70 hover:bg-white/5'
                  }`}
                >
                  <span className="font-medium">{t.label}</span>
                  <span className="ml-2 text-xs text-white/30 font-mono">:{t.creds.port}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
