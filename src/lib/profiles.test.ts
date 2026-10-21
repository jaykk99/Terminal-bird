import { describe, it, expect, beforeEach } from 'vitest';
import {
  listProfiles,
  saveProfile,
  deleteProfile,
  touchProfile,
  exportProfiles,
  importProfiles,
  newProfileId,
} from './profiles';
import type { ConnectionProfile } from '../types';

const make = (over: Partial<ConnectionProfile> = {}): ConnectionProfile => ({
  id: newProfileId(),
  name: 'test-host',
  host: 'example.com',
  port: '22',
  username: 'root',
  createdAt: Date.now(),
  ...over,
});

beforeEach(() => {
  localStorage.clear();
});

describe('profile CRUD', () => {
  it('saves and lists profiles', () => {
    expect(listProfiles()).toHaveLength(0);
    saveProfile(make({ name: 'a' }));
    saveProfile(make({ name: 'b' }));
    const names = listProfiles().map((p) => p.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
  });

  it('replaces a profile with the same id', () => {
    const p = make({ name: 'old' });
    saveProfile(p);
    saveProfile({ ...p, name: 'new' });
    const all = listProfiles();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('new');
  });

  it('deletes by id', () => {
    const p = make();
    saveProfile(p);
    expect(deleteProfile(p.id)).toHaveLength(0);
  });

  it('sorts by lastUsed descending', () => {
    const a = make({ name: 'a' });
    const b = make({ name: 'b' });
    saveProfile(a);
    saveProfile(b);
    touchProfile(a.id);
    expect(listProfiles()[0].id).toBe(a.id);
  });

  it('skips malformed rows on load', () => {
    localStorage.setItem(
      'terminal-bird.profiles.v1',
      JSON.stringify([{ id: 'x' }, make({ name: 'good' }), null]),
    );
    const all = listProfiles();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('good');
  });
});

describe('export / import', () => {
  it('round-trips profiles through JSON', () => {
    saveProfile(make({ name: 'prod', encryptedPassword: null }));
    const json = exportProfiles();
    localStorage.clear();
    const r = importProfiles(json);
    expect(r).toEqual({ imported: 1, skipped: 0, errors: [] });
    const all = listProfiles();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('prod');
  });

  it('accepts a bare array', () => {
    const r = importProfiles(JSON.stringify([make({ name: 'x' })]));
    expect(r.imported).toBe(1);
  });

  it('imports valid entries and reports skipped ones', () => {
    const r = importProfiles(
      JSON.stringify({
        profiles: [make({ name: 'ok' }), { name: '', host: 'h' }, { host: 'h2', username: 'u', port: '99999' }],
      }),
    );
    expect(r.imported).toBe(1);
    expect(r.skipped).toBe(2);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(listProfiles()).toHaveLength(1);
  });

  it('rejects non-JSON and wrong shapes', () => {
    expect(importProfiles('nope').errors).toHaveLength(1);
    expect(importProfiles('{"foo":1}').errors).toHaveLength(1);
  });

  it('assigns fresh ids so imports never collide with existing profiles', () => {
    const p = make({ name: 'orig' });
    saveProfile(p);
    const r = importProfiles(exportProfiles());
    expect(r.imported).toBe(1);
    const ids = listProfiles().map((x) => x.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('rejects bad encryptedPassword payloads', () => {
    const r = importProfiles(
      JSON.stringify([{ name: 'n', host: 'h', username: 'u', encryptedPassword: { version: 9 } }]),
    );
    expect(r.imported).toBe(0);
    expect(r.skipped).toBe(1);
  });
});
