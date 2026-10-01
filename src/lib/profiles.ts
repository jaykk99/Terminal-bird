import type { ConnectionProfile } from '../types';

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
