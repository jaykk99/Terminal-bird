export interface SshCredentials {
  host: string;
  port: string;
  username: string;
  password?: string;
}

export type SshErrorCode =
  | 'auth'
  | 'unreachable'
  | 'timeout'
  | 'validation'
  | 'rate_limited'
  | 'unknown';

export interface SshErrorInfo {
  code: SshErrorCode;
  message: string;
}

/** AES-256-GCM encrypted payload. Stored in localStorage; the passphrase
 *  only ever lives in memory for the page session. */
export interface EncryptedSecret {
  version: 1;
  ciphertext: string; // base64
  salt: string; // base64
  iv: string; // base64
}

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: string;
  username: string;
  /** Present only when the user saved the password with a passphrase. */
  encryptedPassword?: EncryptedSecret | null;
  createdAt: number;
  lastUsed?: number;
}

export interface SessionTab {
  id: string;
  label: string;
  creds: SshCredentials;
  createdAt: number;
}
