/**
 * src/lib/audit.ts — connection audit log.
 *
 * A local-only record of connection attempts: what was connected to, when,
 * and what happened. Lives in this browser's localStorage (last 200 entries)
 * and is never sent anywhere. Passwords are never recorded — only host, port,
 * username, and the outcome.
 */

export type AuditOutcome =
  | 'verify-ok'
  | 'verify-fail'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface AuditEntry {
  ts: number;
  host: string;
  port: string;
  username: string;
  profileName?: string;
  outcome: AuditOutcome;
  /** Classified error code (auth/unreachable/timeout/…) when relevant. */
  detail?: string;
}

const STORAGE_KEY = 'terminal-bird.audit.v1';
const ENABLED_KEY = 'terminal-bird.audit.enabled';
const MAX_ENTRIES = 200;

export function isAuditEnabled(): boolean {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function setAuditEnabled(v: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, v ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

export function recordAudit(entry: Omit<AuditEntry, 'ts'>): void {
  if (!isAuditEnabled()) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: AuditEntry[] = raw ? JSON.parse(raw) : [];
    list.push({ ...entry, ts: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

export function listAudit(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((e) => e && typeof e.ts === 'number' && typeof e.host === 'string')
      .sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

export function clearAudit(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
