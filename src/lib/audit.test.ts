import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordAudit,
  listAudit,
  clearAudit,
  isAuditEnabled,
  setAuditEnabled,
} from './audit';

beforeEach(() => {
  localStorage.clear();
});

describe('audit log', () => {
  it('records and lists entries newest-first', () => {
    recordAudit({ host: 'a.example', port: '22', username: 'root', outcome: 'verify-ok' });
    recordAudit({ host: 'b.example', port: '2222', username: 'u', outcome: 'verify-fail' });
    const entries = listAudit();
    expect(entries).toHaveLength(2);
    const hosts = entries.map((e) => e.host).sort();
    expect(hosts).toEqual(['a.example', 'b.example']);
    expect(entries[0].ts).toBeGreaterThanOrEqual(entries[1].ts);
    expect(entries.every((e) => e.ts > 0)).toBe(true);
  });

  it('stores no passwords', () => {
    recordAudit({ host: 'h', port: '22', username: 'u', outcome: 'connected' });
    const raw = localStorage.getItem('terminal-bird.audit.v1')!;
    expect(raw).not.toContain('password');
  });

  it('caps at 200 entries', () => {
    for (let i = 0; i < 250; i++) {
      recordAudit({ host: `h${i}`, port: '22', username: 'u', outcome: 'connected' });
    }
    expect(listAudit()).toHaveLength(200);
  });

  it('stops recording when disabled', () => {
    setAuditEnabled(false);
    expect(isAuditEnabled()).toBe(false);
    recordAudit({ host: 'h', port: '22', username: 'u', outcome: 'connected' });
    expect(listAudit()).toHaveLength(0);
    setAuditEnabled(true);
    recordAudit({ host: 'h', port: '22', username: 'u', outcome: 'connected' });
    expect(listAudit()).toHaveLength(1);
  });

  it('clears the log', () => {
    recordAudit({ host: 'h', port: '22', username: 'u', outcome: 'connected' });
    clearAudit();
    expect(listAudit()).toHaveLength(0);
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem('terminal-bird.audit.v1', 'not-json');
    expect(listAudit()).toEqual([]);
  });
});
