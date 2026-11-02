/**
 * End-to-end encryption for cloud sync and backups, using only the browser's Web Crypto API.
 *
 * Sync key: PBKDF2-SHA-256 (100,000 iterations) over the passphrase, salted with the Sync ID,
 * gives 256 bits of key material. That runs once per passphrase and Sync ID. Each payload then
 * gets a fresh random 16-byte salt and 12-byte IV; HKDF-SHA-256 turns the key material and the
 * payload salt into that payload's AES-256-GCM key. Running PBKDF2 per record would take minutes
 * for a few thousand records on a phone; HKDF keeps per-record cost under a millisecond while
 * every payload still has its own salt and key.
 *
 * Each payload is bound to its table and record id as GCM additional data, so the server cannot
 * move a ciphertext to another record without decryption failing.
 *
 * Backups: PBKDF2 directly with a random salt stored in the file, so an encrypted backup opens
 * with the passphrase alone, on any device and under any Sync ID.
 */

/**
 * Web Crypto (crypto.subtle) exists only in secure contexts: https://, localhost, and the
 * Android app. Over http://192.168.x.x it is undefined, so every caller checks this first and
 * end-to-end encryption is unavailable on such a page.
 */
export function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && crypto !== null && typeof crypto.subtle === 'object' && crypto.subtle !== null && typeof crypto.subtle.importKey === 'function';
}

export const CRYPTO_UNAVAILABLE_MESSAGE = 'E2EE requires HTTPS or installed APK; running in local LAN mode';

/** Raised instead of a TypeError when Web Crypto is missing. */
export class CryptoUnavailableError extends Error {
  constructor() {
    super(CRYPTO_UNAVAILABLE_MESSAGE);
    this.name = 'CryptoUnavailableError';
  }
}

function subtle(): SubtleCrypto {
  if (!cryptoAvailable()) throw new CryptoUnavailableError();
  return crypto.subtle;
}

export const PBKDF2_ITERATIONS = 100_000;
export const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const HKDF_INFO = 'study-space aes-256-gcm v1';
const BACKUP_AAD = 'study-space backup v1';

export interface EncryptedEnvelope {
  encrypted: true;
  v: 1;
  iv: string;
  salt: string;
  ciphertext: string;
}

export interface EncryptedBackup extends EncryptedEnvelope {
  app: 'study-space';
  kind: 'encrypted-backup';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
}

/** Raised when a payload cannot be decrypted: wrong passphrase, or changed or damaged data. */
export class DecryptError extends Error {
  constructor(message = 'The data could not be decrypted with this passphrase.') {
    super(message);
    this.name = 'DecryptError';
  }
}

/** Key material for one passphrase and Sync ID. Never leaves memory and cannot be exported. */
export interface SyncKey {
  hkdf: CryptoKey;
  /** Short public fingerprint, used to keep separate push marks per key. Reveals nothing about the key. */
  fingerprint: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Plain ArrayBuffer copy, accepted by every Web Crypto implementation. */
function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function random(n: number): Uint8Array {
  // getRandomValues works in every context; subtle() has already been checked by the caller.
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Leading and trailing spaces are ignored, and equivalent Unicode forms match. */
export function normalizePassphrase(passphrase: string): string {
  return passphrase.normalize('NFKC').trim();
}

async function pbkdf2Bits(passphrase: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const base = await subtle().importKey('raw', buf(enc.encode(normalizePassphrase(passphrase))), 'PBKDF2', false, ['deriveBits']);
  return subtle().deriveBits({ name: 'PBKDF2', salt: buf(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, base, 256);
}

/** Derives the sync key material from the passphrase, with the Sync ID as the salt namespace. */
export async function deriveSyncKey(passphrase: string, syncId: string): Promise<SyncKey> {
  const bits = await pbkdf2Bits(passphrase, enc.encode(`study-space:sync:v1:${syncId.trim()}`));
  const hkdf = await subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  // A one-way fingerprint of the key material, labelled so it cannot be confused with any key.
  const digest = new Uint8Array(await subtle().digest('SHA-256', buf(new Uint8Array([...enc.encode('study-space fingerprint:'), ...new Uint8Array(bits)]))));
  const fingerprint = [...digest.subarray(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { hkdf, fingerprint };
}

function payloadKey(key: SyncKey, salt: Uint8Array): Promise<CryptoKey> {
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(enc.encode(HKDF_INFO)) }, key.hkdf, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export function isEnvelope(v: unknown): v is EncryptedEnvelope {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.encrypted === true && typeof o.iv === 'string' && typeof o.salt === 'string' && typeof o.ciphertext === 'string';
}

/** Additional data that ties a cloud payload to its place. */
export function recordAad(table: string, recordId: string): string {
  return `study-space/${table}/${recordId}`;
}

/** Encrypts a JSON value for upload: fresh salt, fresh IV, AES-256-GCM. */
export async function encryptPayload(key: SyncKey, value: unknown, aad: string): Promise<EncryptedEnvelope> {
  const salt = random(SALT_BYTES);
  const iv = random(IV_BYTES);
  const aes = await payloadKey(key, salt);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(enc.encode(aad)) }, aes, buf(enc.encode(JSON.stringify(value))));
  return { encrypted: true, v: ENVELOPE_VERSION, iv: toBase64(iv), salt: toBase64(salt), ciphertext: toBase64(new Uint8Array(ct)) };
}

/** Decrypts a downloaded payload. Throws DecryptError for a wrong passphrase or changed data. */
export async function decryptPayload(key: SyncKey, envelope: EncryptedEnvelope, aad: string): Promise<unknown> {
  if (envelope.v !== ENVELOPE_VERSION) throw new DecryptError(`Encrypted data version ${String(envelope.v)} is not supported.`);
  // Missing Web Crypto is not a wrong passphrase: report it as such, outside the try below.
  subtle();
  let plain: ArrayBuffer;
  try {
    const aes = await payloadKey(key, fromBase64(envelope.salt));
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: buf(fromBase64(envelope.iv)), additionalData: buf(enc.encode(aad)) }, aes, buf(fromBase64(envelope.ciphertext)));
  } catch {
    throw new DecryptError();
  }
  try {
    return JSON.parse(dec.decode(plain)) as unknown;
  } catch {
    throw new DecryptError('The decrypted data is not valid.');
  }
}

/* ---------- Encrypted backups ---------- */

export function isEncryptedBackup(v: unknown): v is EncryptedBackup {
  return isEnvelope(v) && (v as unknown as Record<string, unknown>).kind === 'encrypted-backup';
}

/** Encrypts a backup's JSON text with the passphrase. Returns the text of a `.enc.json` file. */
export async function encryptBackup(json: string, passphrase: string): Promise<string> {
  const salt = random(SALT_BYTES);
  const iv = random(IV_BYTES);
  const aes = await subtle().importKey('raw', await pbkdf2Bits(passphrase, salt), 'AES-GCM', false, ['encrypt']);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(enc.encode(BACKUP_AAD)) }, aes, buf(enc.encode(json)));
  const file: EncryptedBackup = {
    app: 'study-space',
    kind: 'encrypted-backup',
    encrypted: true,
    v: ENVELOPE_VERSION,
    kdf: 'PBKDF2-SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ct)),
  };
  return JSON.stringify(file);
}

/** Opens an encrypted backup. Throws DecryptError when the passphrase does not match. */
export async function decryptBackup(file: EncryptedBackup, passphrase: string): Promise<string> {
  if (file.v !== ENVELOPE_VERSION || file.kdf !== 'PBKDF2-SHA-256' || file.iterations !== PBKDF2_ITERATIONS) {
    throw new DecryptError('This encrypted backup uses settings this version cannot open.');
  }
  subtle();
  try {
    const aes = await subtle().importKey('raw', await pbkdf2Bits(passphrase, fromBase64(file.salt)), 'AES-GCM', false, ['decrypt']);
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: buf(fromBase64(file.iv)), additionalData: buf(enc.encode(BACKUP_AAD)) }, aes, buf(fromBase64(file.ciphertext)));
    return dec.decode(plain);
  } catch {
    throw new DecryptError('This passphrase does not open this backup.');
  }
}
