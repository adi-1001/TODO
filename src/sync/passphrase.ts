import { normalizePassphrase } from './cryptoUtils';

/**
 * The Sync Encryption Passphrase, kept in this device's localStorage under its own key. It is
 * never part of synced data, backups, the cloud, or the preferences object that other code
 * reads. Other tabs on the device pick up changes through the storage event.
 */

export const PASSPHRASE_KEY = 'study-space:sync-passphrase';
export const MIN_PASSPHRASE_LENGTH = 8;
export const RECOMMENDED_PASSPHRASE_LENGTH = 12;

let memory: string | null = null;

export function getPassphrase(): string | null {
  try {
    const v = localStorage.getItem(PASSPHRASE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return memory;
  }
}

export function storePassphrase(passphrase: string | null): void {
  const clean = passphrase === null ? null : normalizePassphrase(passphrase) || null;
  memory = clean;
  try {
    if (clean) localStorage.setItem(PASSPHRASE_KEY, clean);
    else localStorage.removeItem(PASSPHRASE_KEY);
  } catch {
    /* kept in memory for this session only */
  }
}

/** Calls `fn` when another tab on this device changes the passphrase. */
export function onPassphraseChangedElsewhere(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (e: StorageEvent) => {
    if (e.key === PASSPHRASE_KEY) fn();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
