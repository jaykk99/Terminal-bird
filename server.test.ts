import { describe, it, expect } from 'vitest';
import { validateConnectionInput, classifySshError } from './server';

describe('validateConnectionInput', () => {
  it('accepts a valid connection', () => {
    const r = validateConnectionInput({ host: 'example.com', port: '22', username: 'root', password: 'x' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ host: 'example.com', port: 22, username: 'root', password: 'x' });
    }
  });

  it('accepts IPv4, IPv6, numeric ports, trims whitespace', () => {
    const v4 = validateConnectionInput({ host: ' 10.0.0.1 ', port: 2222, username: 'u' });
    expect(v4.ok).toBe(true);
    const v6 = validateConnectionInput({ host: '::1', port: '22', username: 'u' });
    expect(v6.ok).toBe(true);
  });

  it('rejects missing or invalid hosts', () => {
    for (const host of ['', '   ', 'not a host!', 'http://x.com', '-bad-.com']) {
      const r = validateConnectionInput({ host, port: '22', username: 'u' });
      expect(r.ok).toBe(false);
    }
  });

  it('rejects missing or invalid usernames', () => {
    expect(validateConnectionInput({ host: 'h.com', port: '22', username: '' }).ok).toBe(false);
    expect(validateConnectionInput({ host: 'h.com', port: '22', username: 'bad user!' }).ok).toBe(false);
    expect(validateConnectionInput({ host: 'h.com', port: '22', username: 'a'.repeat(33) }).ok).toBe(false);
    const ok = validateConnectionInput({ host: 'h.com', port: '22', username: 'good_user-1.x' });
    expect(ok.ok).toBe(true);
  });

  it('rejects out-of-range ports', () => {
    for (const port of ['0', '65536', 'abc', '', '-1', '22.5']) {
      expect(validateConnectionInput({ host: 'h.com', port, username: 'u' }).ok).toBe(false);
    }
    expect(validateConnectionInput({ host: 'h.com', port: '1', username: 'u' }).ok).toBe(true);
    expect(validateConnectionInput({ host: 'h.com', port: '65535', username: 'u' }).ok).toBe(true);
  });

  it('rejects non-object bodies and overlong passwords', () => {
    expect(validateConnectionInput(null).ok).toBe(false);
    expect(validateConnectionInput('x').ok).toBe(false);
    expect(
      validateConnectionInput({ host: 'h.com', port: '22', username: 'u', password: 'x'.repeat(1025) }).ok,
    ).toBe(false);
  });

  it('omits the password key when none is given', () => {
    const r = validateConnectionInput({ host: 'h.com', port: '22', username: 'u' });
    expect(r.ok).toBe(true);
    if (r.ok) expect('password' in r.value).toBe(false);
  });
});

describe('classifySshError', () => {
  it('classifies authentication failures without leaking credential values', () => {
    const fakePassword = 'Sup3rSecretPw123!';
    const info = classifySshError({
      level: 'client-authentication',
      message: `All configured authentication methods failed for user root with ${fakePassword}`,
    });
    expect(info.code).toBe('auth');
    expect(info.message).not.toContain(fakePassword);
  });

  it('classifies DNS failures', () => {
    expect(classifySshError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND nope' }).code).toBe('unreachable');
  });

  it('classifies refused connections', () => {
    const info = classifySshError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' });
    expect(info.code).toBe('unreachable');
    expect(info.message).toMatch(/nothing is listening/i);
  });

  it('classifies timeouts', () => {
    expect(classifySshError({ level: 'client-timeout' }).code).toBe('timeout');
  });

  it('classifies resets as unreachable', () => {
    expect(classifySshError({ code: 'ECONNRESET' }).code).toBe('unreachable');
  });

  it('falls back to unknown for unrecognized errors', () => {
    const info = classifySshError({ message: 'something weird happened' });
    expect(info.code).toBe('unknown');
    expect(typeof info.message).toBe('string');
  });

  it('handles null/undefined input', () => {
    expect(classifySshError(null).code).toBe('unknown');
    expect(classifySshError(undefined).code).toBe('unknown');
  });
});
