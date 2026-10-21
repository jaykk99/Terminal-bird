import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, isEncryptedSecret } from './crypto';
import type { EncryptedSecret } from '../types';

describe('encryptSecret / decryptSecret (AES-256-GCM + PBKDF2)', () => {
  it('round-trips a password', async () => {
    const payload = await encryptSecret('s3cr3t-p@ss', 'correct horse');
    expect(isEncryptedSecret(payload)).toBe(true);
    expect(await decryptSecret(payload, 'correct horse')).toBe('s3cr3t-p@ss');
  });

  it('produces different ciphertexts for the same plaintext (random salt/iv)', async () => {
    const a = await encryptSecret('same', 'pp');
    const b = await encryptSecret('same', 'pp');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.salt).not.toBe(b.salt);
  });

  it('throws on a wrong passphrase', async () => {
    const payload = await encryptSecret('secret', 'right');
    await expect(decryptSecret(payload, 'wrong')).rejects.toThrow();
  });

  it('throws on tampered ciphertext (GCM auth)', async () => {
    const payload = await encryptSecret('secret', 'pp');
    const tampered: EncryptedSecret = {
      ...payload,
      ciphertext: payload.ciphertext.slice(0, -4) + 'AAAA',
    };
    await expect(decryptSecret(tampered, 'pp')).rejects.toThrow();
  });

  it('throws when encrypting without a passphrase', async () => {
    await expect(encryptSecret('x', '')).rejects.toThrow();
  });

  it('rejects unknown encryption versions', async () => {
    const payload = await encryptSecret('x', 'pp');
    await expect(
      decryptSecret({ ...payload, version: 2 } as any, 'pp'),
    ).rejects.toThrow(/version/i);
  });

  it('handles unicode passwords', async () => {
    const payload = await encryptSecret('pässwörd-🔑', 'pp');
    expect(await decryptSecret(payload, 'pp')).toBe('pässwörd-🔑');
  });
});

describe('isEncryptedSecret', () => {
  it('validates the payload shape', async () => {
    const payload = await encryptSecret('x', 'pp');
    expect(isEncryptedSecret(payload)).toBe(true);
    expect(isEncryptedSecret(null)).toBe(false);
    expect(isEncryptedSecret({})).toBe(false);
    expect(isEncryptedSecret({ ...payload, version: 2 })).toBe(false);
    expect(isEncryptedSecret({ ...payload, ciphertext: 42 })).toBe(false);
  });
});
