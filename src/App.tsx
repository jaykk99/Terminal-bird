/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionHub } from './components/ConnectionHub';
import { TerminalView } from './components/TerminalView';
import { TabBar } from './components/TabBar';
import type { SessionTab, SshCredentials } from './types';

function newTabId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [tabs, setTabs] = useState<SessionTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showHub, setShowHub] = useState(true);
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

  // Keyboard shortcuts: Alt+1..9 switch tabs, Alt+N new, Alt+W close active.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
          />
        ))}
      </div>
    </div>
  );
}
