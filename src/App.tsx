/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { ConnectionForm } from './components/ConnectionForm';
import { TerminalView } from './components/TerminalView';
import type { SshCredentials } from './types';

export default function App() {
  const [credentials, setCredentials] = useState<SshCredentials | null>(null);

  if (credentials) {
    return (
      <TerminalView 
        credentials={credentials} 
        onDisconnect={() => setCredentials(null)} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>
      
      <div className="relative w-full z-10 p-2 sm:p-0">
        <ConnectionForm onConnect={setCredentials} />
      </div>
    </div>
  );
}
