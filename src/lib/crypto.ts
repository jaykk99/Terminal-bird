import type { EncryptedSecret } from '../types';

const TE = new TextEncoder();
const TD = new TextDecoder();

function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', TE.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt a secret with a passphrase (AES-256-GCM + PBKDF2-SHA256). */
export async function encryptSecret(plain: string, passphrase: string): Promise<EncryptedSecret> {
  if (!passphrase) throw new Error('A passphrase is required to encrypt.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, TE.encode(plain));
  return {
    version: 1,
    ciphertext: b64encode(new Uint8Array(ct)),
    salt: b64encode(salt),
    iv: b64encode(iv),
  };
}

/** Decrypt a payload. Throws on wrong passphrase or tampered data. */
export async function decryptSecret(payload: EncryptedSecret, passphrase: string): Promise<string> {
  if (payload.version !== 1) throw new Error('Unsupported encryption version.');
  const key = await deriveKey(passphrase, b64decode(payload.salt));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(payload.iv) as BufferSource },
    key,
    b64decode(payload.ciphertext),
  );
  return TD.decode(plain);
}

export function isEncryptedSecret(v: unknown): v is EncryptedSecret {
  return (
    !!v &&
    typeof v === 'object' &&
    (v as EncryptedSecret).version === 1 &&
    typeof (v as EncryptedSecret).ciphertext === 'string' &&
    typeof (v as EncryptedSecret).salt === 'string' &&
    typeof (v as EncryptedSecret).iv === 'string'
  );
}
