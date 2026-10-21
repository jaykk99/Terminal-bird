import type { ConnectionProfile } from '../types';
import { isEncryptedSecret } from './crypto';

const STORAGE_KEY = 'terminal-bird.profiles.v1';

function loadRaw(): ConnectionProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) =>
        p &&
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        typeof p.host === 'string' &&
        typeof p.username === 'string',
    );
  } catch {
    return [];
  }
}

function saveRaw(profiles: ConnectionProfile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    /* storage full or unavailable — profiles simply won't persist */
  }
}

export function listProfiles(): ConnectionProfile[] {
  return loadRaw().sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
}

export function saveProfile(profile: ConnectionProfile): ConnectionProfile[] {
  const all = loadRaw().filter((p) => p.id !== profile.id);
  all.push(profile);
  saveRaw(all);
  return listProfiles();
}

export function deleteProfile(id: string): ConnectionProfile[] {
  saveRaw(loadRaw().filter((p) => p.id !== id));
  return listProfiles();
}

export function touchProfile(id: string): ConnectionProfile[] {
  const all = loadRaw().map((p) => (p.id === id ? { ...p, lastUsed: Date.now() } : p));
  saveRaw(all);
  return listProfiles();
}

export function newProfileId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

export interface ProfileImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Serialize every saved profile (incl. encrypted passwords) as JSON. */
export function exportProfiles(): string {
  return JSON.stringify(
    {
      app: 'terminal-bird',
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles: loadRaw(),
    },
    null,
    2,
  );
}

function validateImportedProfile(p: unknown): string | null {
  if (!p || typeof p !== 'object') return 'not an object';
  const o = p as Record<string, unknown>;
  if (typeof o.name !== 'string' || !o.name.trim()) return 'missing name';
  if (typeof o.host !== 'string' || !o.host.trim()) return 'missing host';
  if (typeof o.username !== 'string' || !o.username.trim()) return 'missing username';
  const port = Number(String(o.port ?? '22').trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) return `bad port ${String(o.port)}`;
  if (o.encryptedPassword != null && !isEncryptedSecret(o.encryptedPassword)) {
    return 'bad encryptedPassword payload';
  }
  return null;
}

/**
 * Import profiles from an exportProfiles() JSON document (or a bare array).
 * Entries get fresh ids so imports never collide with existing profiles.
 * Invalid entries are skipped and reported; valid ones are still imported.
 */
export function importProfiles(jsonText: string): ProfileImportResult {
  const result: ProfileImportResult = { imported: 0, skipped: 0, errors: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    result.errors.push('Not valid JSON.');
    return result;
  }

  const list = Array.isArray(parsed)
    ? parsed
    : (parsed as { profiles?: unknown })?.profiles;
  if (!Array.isArray(list)) {
    result.errors.push('Expected a JSON array or {"profiles": [...]}.');
    return result;
  }

  const valid: ConnectionProfile[] = [];
  list.forEach((p, i) => {
    const err = validateImportedProfile(p);
    if (err) {
      result.skipped += 1;
      if (result.errors.length < 5) result.errors.push(`Entry ${i + 1}: ${err}.`);
      return;
    }
    const o = p as Record<string, any>;
    valid.push({
      id: newProfileId(),
      name: String(o.name).trim(),
      host: String(o.host).trim(),
      port: String(o.port ?? '22').trim(),
      username: String(o.username).trim(),
      encryptedPassword: o.encryptedPassword ?? null,
      createdAt: Date.now(),
    });
  });

  if (valid.length > 0) saveRaw([...loadRaw(), ...valid]);
  result.imported = valid.length;
  return result;
}
