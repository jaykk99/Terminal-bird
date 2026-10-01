import { Plus, X, Terminal as TerminalIcon } from 'lucide-react';
import type { SessionTab } from '../types';

interface TabBarProps {
  tabs: SessionTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function TabBar({ tabs, activeId, onSelect, onClose, onNew }: TabBarProps) {
  return (
    <div className="h-11 bg-[#0d1117] border-b border-white/10 flex items-stretch shrink-0 overflow-x-auto">
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className={`group flex items-center gap-2 pl-3 pr-1.5 border-r border-white/10 cursor-pointer min-w-[140px] max-w-[220px] shrink-0 ${
              isActive ? 'bg-[#161b22] text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
            onClick={() => onSelect(tab.id)}
            title={`${tab.label} (Alt+${i + 1})`}
          >
            <TerminalIcon className="w-3.5 h-3.5 shrink-0 text-white/40" />
            <span className="text-xs font-mono truncate flex-1">{tab.label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
              title="Close session"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
      <button
        onClick={onNew}
        className="flex items-center gap-1.5 px-3 text-white/40 hover:text-white/80 hover:bg-white/5 text-xs shrink-0"
        title="New session (Alt+N)"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">New</span>
      </button>
    </div>
  );
}
