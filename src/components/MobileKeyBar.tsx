interface KeyDef {
  label: string;
  seq: string;
  wide?: boolean;
}

/** On-screen special keys for touch devices where the OS keyboard
 *  lacks Esc/Ctrl/arrows. */
export const MOBILE_KEYS: KeyDef[] = [
  { label: 'Esc', seq: '\x1b' },
  { label: 'Tab', seq: '\t' },
  { label: 'Ctrl', seq: '', wide: true }, // sticky modifier handled by parent
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: '←', seq: '\x1b[D' },
  { label: '→', seq: '\x1b[C' },
  { label: '|', seq: '|' },
  { label: '~', seq: '~' },
  { label: '/', seq: '/' },
  { label: '-', seq: '-' },
  { label: 'PgUp', seq: '\x1b[5~' },
  { label: 'PgDn', seq: '\x1b[6~' },
];

export function MobileKeyBar({
  onKey,
  ctrlActive,
  onToggleCtrl,
}: {
  onKey: (seq: string) => void;
  ctrlActive: boolean;
  onToggleCtrl: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-2 bg-[#111] border-t border-white/10 overflow-x-auto shrink-0">
      {MOBILE_KEYS.map((k) =>
        k.label === 'Ctrl' ? (
          <button
            key={k.label}
            type="button"
            onClick={onToggleCtrl}
            className={`shrink-0 px-3 py-2 rounded-lg text-xs font-mono border transition-colors ${
              ctrlActive
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-white/5 border-white/10 text-white/70'
            }`}
          >
            Ctrl
          </button>
        ) : (
          <button
            key={k.label}
            type="button"
            onClick={() => onKey(k.seq)}
            className="shrink-0 px-3 py-2 rounded-lg text-xs font-mono bg-white/5 border border-white/10 text-white/70 active:bg-white/20"
          >
            {k.label}
          </button>
        ),
      )}
      <span className="shrink-0 text-[10px] text-white/30 pl-1">
        {ctrlActive ? 'Ctrl active — tap a letter key' : ''}
      </span>
    </div>
  );
}
