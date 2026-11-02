import { TABLE_NAMES, type Syncable, type TableName } from '../types';
import { PUSH_MARK_KEY } from '../db/db';
import { resolveTable } from '../db/migrate';
import { allRecords, applyRemote, exportSnapshot, importSnapshot, recordsSince, setChangeListener } from '../db/repo';
import { parseSnapshot } from './snapshot';
import { cloudConfigured, createSupabaseAdapter, type CloudAdapter, type CloudRow } from './supabaseAdapter';
import { sha256Bytes, toHex } from '../lib/sha256';
import {
  CryptoUnavailableError,
  DecryptError,
  cryptoAvailable,
  decryptBackup,
  decryptPayload,
  deriveSyncKey,
  encryptBackup,
  encryptPayload,
  isEncryptedBackup,
  isEnvelope,
  normalizePassphrase,
  recordAad,
  type SyncKey,
} from './cryptoUtils';
import { getPassphrase, onPassphraseChangedElsewhere, storePassphrase } from './passphrase';
import { isTimerState, type TimerState } from '../timer/timerMachine';

export type SyncStatus = 'local' | 'connecting' | 'cloud' | 'error' | 'paused';
export type PauseReason = 'passphrase-mismatch' | 'passphrase-needed' | 'crypto-unavailable';

export const PAUSE_MESSAGES: Record<PauseReason, string> = {
  'passphrase-mismatch': 'Sync paused: Encryption passphrase does not match cloud data.',
  'passphrase-needed': 'Sync paused: The cloud data is encrypted. Enter the Sync Encryption Passphrase used on your other device.',
  'crypto-unavailable':
    'Sync paused: encrypted cloud data cannot be opened here. E2EE requires HTTPS or the installed APK; this page is in local LAN mode. Your data on this device is safe and the app works normally.',
};

export interface SyncInfo {
  code: string;
  status: SyncStatus;
  cloudAvailable: boolean;
  message: string | null;
  lastSyncedAt: number | null;
  /** A Sync Encryption Passphrase is set on this device. */
  encrypted: boolean;
  /** Why sync is paused, when status is 'paused'. Local data is untouched while paused. */
  pauseReason: PauseReason | null;
  /** Records in the cloud still stored without encryption (the server function needs the update in README). */
  plainRemaining: number;
  /** Web Crypto exists on this page. False on http:// LAN addresses: end-to-end encryption is off. */
  cryptoAvailable: boolean;
}

export interface PassphraseResult {
  ok: boolean;
  message: string | null;
}

type LocalMessage =
  | { type: 'records'; table: string; records: unknown[]; from: string }
  | { type: 'timer'; state: unknown; from: string };

/** One cloud item to read: a row from a pull, or a live item from another device. */
interface Incoming {
  table: string;
  id: string | null;
  data: unknown;
}

interface Decoded {
  byTable: Map<string, unknown[]>;
  /** Rows stored without encryption. */
  plain: number;
  /** Encrypted rows were found but this device has no passphrase. */
  needKey: boolean;
  /** Encrypted rows did not open with this device's passphrase. */
  failed: boolean;
}

const TAB_ID = Math.random().toString(36).slice(2);
const RETRY_DELAYS = [5_000, 15_000, 60_000];
const DECRYPT_BATCH = 64;

/**
 * SHA-256 of the Sync ID, so the raw ID never leaves the device. Without Web Crypto (an
 * http:// LAN page) the same hash is computed in JavaScript, so the device joins the same room.
 */
export async function roomId(code: string): Promise<string> {
  const data = new TextEncoder().encode(`study-space:${code}`);
  if (!cryptoAvailable()) return toHex(sha256Bytes(data));
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}

function readMarks(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PUSH_MARK_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function writeMark(markKey: string, value: number): void {
  try {
    const marks = readMarks();
    marks[markKey] = value;
    localStorage.setItem(PUSH_MARK_KEY, JSON.stringify(marks));
  } catch {
    /* without storage the next connect pushes everything again, which is safe */
  }
}

/**
 * Push marks are kept per room and per key: turning encryption on, or changing the passphrase,
 * starts a new mark at zero, so every record is uploaded again in the new form.
 */
function markKeyFor(room: string, key: SyncKey | null): string {
  return key ? `${room}#${key.fingerprint}` : room;
}

/** Records from any source go through table-name mapping and normalization before they are written. */
async function applyIncoming(rawTable: string, records: unknown[]): Promise<void> {
  const table = resolveTable(rawTable);
  if (table) await applyRemote(table, records);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Turns cloud items into records. Nothing is applied here, so a wrong passphrase can stop
 * everything before any local data changes. Plain rows are accepted (data written before
 * encryption was turned on, or by a device without a passphrase); encrypted rows need the
 * passphrase and must all open.
 */
async function decodeItems(items: Incoming[], key: SyncKey | null): Promise<Decoded> {
  const out: Decoded = { byTable: new Map(), plain: 0, needKey: false, failed: false };
  const add = (table: string, record: unknown) => {
    const list = out.byTable.get(table) ?? [];
    list.push(record);
    out.byTable.set(table, list);
  };
  const encrypted: Incoming[] = [];
  for (const item of items) {
    if (isEnvelope(item.data) && item.id) encrypted.push(item);
    else {
      out.plain++;
      add(item.table, item.data);
    }
  }
  if (encrypted.length === 0) return out;
  if (!key) return { ...out, needKey: true };
  for (let i = 0; i < encrypted.length; i += DECRYPT_BATCH) {
    const batch = encrypted.slice(i, i + DECRYPT_BATCH);
    try {
      const records = await Promise.all(batch.map((it) => decryptPayload(key, it.data as never, recordAad(it.table, it.id!))));
      batch.forEach((it, j) => add(it.table, records[j]));
    } catch (e) {
      if (e instanceof DecryptError) return { ...out, failed: true };
      throw e;
    }
  }
  return out;
}

function rowsToIncoming(rows: CloudRow[]): Incoming[] {
  return rows.map((r) => ({ table: String(r.table_name), id: r.record_id, data: r.data }));
}

/** Live items are plain records, or `{ id, data: envelope }` when the sender encrypts. */
function liveToIncoming(table: string, items: unknown[]): Incoming[] {
  return items.map((it) => (isObj(it) && typeof it.id === 'string' && isEnvelope(it.data) ? { table, id: it.id, data: it.data } : { table, id: null, data: it }));
}

/** Raised when an encrypted backup needs a passphrase, or the one given does not open it. */
export class BackupPassphraseError extends Error {
  constructor(public reason: 'needed' | 'wrong') {
    super(reason === 'needed' ? 'This backup is encrypted. Enter the passphrase it was made with.' : 'This passphrase does not open this backup.');
    this.name = 'BackupPassphraseError';
  }
}

export interface SyncEngineOptions {
  cloudAvailable?: boolean;
  createAdapter?: () => Promise<CloudAdapter>;
}

export class SyncEngine {
  private info: SyncInfo;
  private listeners = new Set<(info: SyncInfo) => void>();
  private timerListeners = new Set<(state: TimerState) => void>();
  private channel: BroadcastChannel | null = null;
  private cloud: CloudAdapter | null = null;
  /** The key the current cloud connection uses, or null for plain sync. */
  private key: SyncKey | null = null;
  private keyCache: { id: string; key: SyncKey } | null = null;
  private room = '';
  private queue = new Map<TableName, Map<string, Syncable>>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryIndex = 0;
  private needsResync = false;
  private generation = 0;
  private createAdapter: () => Promise<CloudAdapter>;

  constructor(options: SyncEngineOptions = {}) {
    this.createAdapter = options.createAdapter ?? createSupabaseAdapter;
    this.info = {
      code: '',
      status: 'local',
      cloudAvailable: options.cloudAvailable ?? cloudConfigured(),
      message: null,
      lastSyncedAt: null,
      encrypted: getPassphrase() !== null,
      pauseReason: null,
      plainRemaining: 0,
      cryptoAvailable: cryptoAvailable(),
    };
    setChangeListener((table, records) => this.notify(table, records));
    onPassphraseChangedElsewhere(() => void this.start(this.info.code));
  }

  getInfo(): SyncInfo {
    return this.info;
  }

  subscribe(fn: (info: SyncInfo) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onTimer(fn: (state: TimerState) => void): () => void {
    this.timerListeners.add(fn);
    return () => this.timerListeners.delete(fn);
  }

  private set(partial: Partial<SyncInfo>): void {
    this.info = { ...this.info, ...partial };
    for (const fn of this.listeners) fn(this.info);
  }

  /** The key for the stored passphrase and the current Sync ID, derived once and cached. */
  private async loadKey(code: string): Promise<SyncKey | null> {
    const passphrase = getPassphrase();
    if (!passphrase) return null;
    const id = `${code}\u0000${passphrase}`;
    if (this.keyCache?.id === id) return this.keyCache.key;
    const key = await deriveSyncKey(passphrase, code);
    this.keyCache = { id, key };
    return key;
  }

  async start(code: string): Promise<void> {
    const clean = code.trim();
    const gen = ++this.generation;
    await this.stopCloud();
    this.channel?.close();
    this.channel = null;
    this.key = null;
    this.set({ code: clean, status: 'local', message: null, pauseReason: null, plainRemaining: 0, encrypted: getPassphrase() !== null });
    if (!clean) return;

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`study-space:${clean}`);
      this.channel.onmessage = (ev: MessageEvent<LocalMessage>) => void this.onLocalMessage(ev.data);
    }
    if (!this.info.cloudAvailable) return;
    this.room = await roomId(clean);
    if (gen !== this.generation) return;
    await this.connectCloud(gen);
  }

  private async onLocalMessage(msg: LocalMessage): Promise<void> {
    if (!msg || msg.from === TAB_ID) return;
    if (msg.type === 'records' && Array.isArray(msg.records)) {
      await applyIncoming(msg.table, msg.records);
    } else if (msg.type === 'timer' && isTimerState(msg.state)) {
      for (const fn of this.timerListeners) fn(msg.state);
    }
  }

  postTimer(state: TimerState): void {
    this.channel?.postMessage({ type: 'timer', state, from: TAB_ID } satisfies LocalMessage);
  }

  /** Called by the repository for every local write. Tabs on this device get plain records. */
  notify(table: TableName, records: Syncable[]): void {
    this.channel?.postMessage({ type: 'records', table, records, from: TAB_ID } satisfies LocalMessage);
    if (!this.cloud || this.info.status !== 'cloud') {
      if (this.info.cloudAvailable) this.needsResync = true;
      return;
    }
    let m = this.queue.get(table);
    if (!m) this.queue.set(table, (m = new Map()));
    for (const r of records) m.set(r.id, r);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), 400);
  }

  /** Rows for upload, encrypted when a key is given. The cloud sees only table, id and time in the clear. */
  private async encodeRows(table: string, records: Syncable[], key: SyncKey | null): Promise<CloudRow[]> {
    if (!key) return records.map((r) => ({ table_name: table, record_id: r.id, data: r, updated_at: r.updatedAt }));
    const out: CloudRow[] = [];
    for (let i = 0; i < records.length; i += DECRYPT_BATCH) {
      const batch = records.slice(i, i + DECRYPT_BATCH);
      const envelopes = await Promise.all(batch.map((r) => encryptPayload(key, r, recordAad(table, r.id))));
      batch.forEach((r, j) => out.push({ table_name: table, record_id: r.id, data: envelopes[j], updated_at: r.updatedAt }));
    }
    return out;
  }

  private async flush(): Promise<void> {
    this.flushTimer = null;
    const cloud = this.cloud;
    const key = this.key;
    if (!cloud) return;
    const batches = [...this.queue.entries()];
    this.queue.clear();
    const rows: CloudRow[] = [];
    try {
      for (const [table, map] of batches) {
        const encoded = await this.encodeRows(table, [...map.values()], key);
        cloud.broadcast(table, key ? encoded.map((r) => ({ id: r.record_id, data: r.data })) : encoded.map((r) => r.data));
        rows.push(...encoded);
      }
      if (rows.length === 0) return;
      await cloud.push(rows);
      if (!this.needsResync) {
        const mark = markKeyFor(this.room, key);
        writeMark(mark, Math.max(...rows.map((r) => r.updated_at), readMarks()[mark] ?? 0));
      }
      this.set({ lastSyncedAt: Date.now() });
    } catch (e) {
      this.needsResync = true;
      this.fail(e);
    }
  }

  /** Decodes items from the cloud and applies them, or pauses sync without touching local data. */
  private async receive(gen: number, items: Incoming[], key: SyncKey | null): Promise<Decoded | null> {
    const decoded = await decodeItems(items, key);
    if (gen !== this.generation) return null;
    if (decoded.needKey || decoded.failed) {
      this.pause(gen, !cryptoAvailable() ? 'crypto-unavailable' : decoded.failed ? 'passphrase-mismatch' : 'passphrase-needed');
      return null;
    }
    for (const [table, records] of decoded.byTable) await applyIncoming(table, records);
    return decoded;
  }

  private async connectCloud(gen: number): Promise<void> {
    this.set({ status: 'connecting', message: null, pauseReason: null });
    try {
      // With a passphrase set but no Web Crypto (http:// LAN page), uploading plain data would
      // undo the encryption the other devices rely on, so cloud sync waits here instead.
      if (getPassphrase() !== null && !cryptoAvailable()) {
        this.pause(gen, 'crypto-unavailable');
        return;
      }
      const key = await this.loadKey(this.info.code);
      if (gen !== this.generation) return;
      this.key = key;
      const cloud = await this.createAdapter();
      await cloud.connect(this.room, {
        onRecords: (table, items) => {
          if (gen === this.generation) void this.receive(gen, liveToIncoming(table, items), this.key).catch((e) => this.fail(e));
        },
        onDisconnect: (reason) => {
          if (gen === this.generation) this.fail(new Error(reason));
        },
      });
      if (gen !== this.generation) {
        await cloud.disconnect();
        return;
      }
      this.cloud = cloud;

      // Pull and check the whole room first. A passphrase that does not match stops here,
      // before anything is written locally or uploaded.
      const decoded = await this.receive(gen, rowsToIncoming(await cloud.pullAll()), key);
      if (!decoded) return;

      await this.pushSinceMark(cloud, key);
      // Rows stored in the clear before encryption was turned on are replaced by the push
      // above when the server function is current. Count any that remain.
      const plainRemaining = key && decoded.plain > 0 ? (await cloud.pullAll()).filter((r) => !isEnvelope(r.data)).length : 0;
      if (gen !== this.generation) return;
      this.retryIndex = 0;
      this.set({ status: 'cloud', message: null, lastSyncedAt: Date.now(), plainRemaining });
      // Writes that happened while the first push was in flight were not queued.
      if (this.needsResync) await this.pushSinceMark(cloud, key);
    } catch (e) {
      if (gen === this.generation) this.fail(e);
    }
  }

  private async pushSinceMark(cloud: CloudAdapter, key: SyncKey | null): Promise<void> {
    this.needsResync = false;
    const markKey = markKeyFor(this.room, key);
    const mark = readMarks()[markKey] ?? 0;
    const outgoing: CloudRow[] = [];
    for (const table of TABLE_NAMES) outgoing.push(...(await this.encodeRows(table, await recordsSince(table, mark), key)));
    if (outgoing.length === 0) return;
    await cloud.push(outgoing);
    writeMark(markKey, Math.max(mark, ...outgoing.map((r) => r.updated_at)));
  }

  /** Stops cloud sync until the passphrase changes. No retry: retrying cannot fix a passphrase. */
  private pause(gen: number, reason: PauseReason): void {
    if (gen !== this.generation) return;
    this.queue.clear();
    this.needsResync = true;
    this.set({ status: 'paused', pauseReason: reason, message: PAUSE_MESSAGES[reason] });
    void this.stopCloud();
  }

  private fail(e: unknown): void {
    if (this.info.status === 'paused') return;
    const message = e instanceof Error ? e.message : String(e);
    this.set({ status: 'error', message });
    void this.stopCloud();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = RETRY_DELAYS[Math.min(this.retryIndex, RETRY_DELAYS.length - 1)];
    this.retryIndex++;
    const gen = this.generation;
    this.retryTimer = setTimeout(() => {
      if (gen === this.generation) void this.connectCloud(gen);
    }, delay);
  }

  private async stopCloud(): Promise<void> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.retryTimer = null;
    this.flushTimer = null;
    const cloud = this.cloud;
    this.cloud = null;
    if (cloud) await cloud.disconnect().catch(() => undefined);
  }

  /** Reconnect now instead of waiting for the next retry. */
  retry(): void {
    this.retryIndex = 0;
    void this.start(this.info.code);
  }

  /* ---------- Encryption passphrase ---------- */

  /** True when saving `next` would change the passphrase of a synced, encrypted room. */
  wouldReencrypt(next: string): boolean {
    const clean = normalizePassphrase(next);
    const current = getPassphrase();
    return cryptoAvailable() && this.info.status === 'cloud' && this.key !== null && current !== null && clean !== '' && clean !== current;
  }

  /**
   * Sets, changes or forgets this device's passphrase. While synced with an encrypted room,
   * a new passphrase re-encrypts the cloud data (see reencrypt). Otherwise the passphrase is
   * stored and sync reconnects, which checks it against the cloud data.
   */
  async setPassphrase(next: string | null): Promise<PassphraseResult> {
    const clean = next === null ? null : normalizePassphrase(next) || null;
    if (clean !== null && this.wouldReencrypt(clean)) return this.reencrypt(clean);
    storePassphrase(clean);
    await this.start(this.info.code);
    return { ok: true, message: null };
  }

  /**
   * Re-encrypts the room with a new passphrase without losing anything:
   * 1. pull and merge with the old key, then push local changes, so the cloud and this device
   *    hold the same versions;
   * 2. upload every record encrypted with the new key;
   * 3. pull again and check every row opens with the new key.
   * If the check fails (a server function from before this feature keeps the old copies), the
   * old passphrase stays and the cloud keeps opening with it.
   */
  private async reencrypt(next: string): Promise<PassphraseResult> {
    const code = this.info.code;
    const oldKey = this.key;
    const gen = ++this.generation;
    await this.stopCloud();
    this.set({ status: 'connecting', message: 'Re-encrypting cloud data with the new passphrase.' });
    let cloud: CloudAdapter | null = null;
    try {
      cloud = await this.createAdapter();
      await cloud.connect(this.room, { onRecords: () => undefined, onDisconnect: () => undefined });
      const before = await decodeItems(rowsToIncoming(await cloud.pullAll()), oldKey);
      if (before.failed || before.needKey) throw new DecryptError();
      for (const [table, records] of before.byTable) await applyIncoming(table, records);
      await this.pushSinceMark(cloud, oldKey);

      const newKey = await deriveSyncKey(next, code);
      const all: CloudRow[] = [];
      for (const table of TABLE_NAMES) all.push(...(await this.encodeRows(table, await allRecords(table), newKey)));
      if (all.length) await cloud.push(all);

      const after = await decodeItems(rowsToIncoming(await cloud.pullAll()), newKey);
      await cloud.disconnect();
      cloud = null;
      if (after.failed || after.needKey) {
        await this.start(code);
        return {
          ok: false,
          message: 'The cloud kept the copies made with the old passphrase, so the passphrase was not changed. Update the study_sync_push function in Supabase (see README), then try again.',
        };
      }
      writeMark(markKeyFor(this.room, newKey), Math.max(0, ...all.map((r) => r.updated_at)));
      storePassphrase(next);
      this.keyCache = { id: `${code}\u0000${normalizePassphrase(next)}`, key: newKey };
      await this.start(code);
      return { ok: true, message: 'Cloud data is now encrypted with the new passphrase. Enter it on your other devices.' };
    } catch (e) {
      if (cloud) await cloud.disconnect().catch(() => undefined);
      if (gen === this.generation) await this.start(code);
      return { ok: false, message: e instanceof DecryptError ? PAUSE_MESSAGES['passphrase-mismatch'] : `The passphrase was not changed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /* ---------- Backups ---------- */

  /** A backup as JSON text; encrypted with the device passphrase when `encrypted` is true. */
  async exportJson(encrypted = false): Promise<string> {
    const json = JSON.stringify(await exportSnapshot());
    if (!encrypted) return json;
    if (!cryptoAvailable()) throw new CryptoUnavailableError();
    const passphrase = getPassphrase();
    if (!passphrase) throw new BackupPassphraseError('needed');
    return encryptBackup(json, passphrase);
  }

  /**
   * Imports a plain or encrypted backup. Encrypted backups open with `passphrase`, or else the
   * device passphrase. Throws BackupPassphraseError when neither opens it.
   */
  async importJson(text: string, passphrase?: string): Promise<number> {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* parseSnapshot reports invalid JSON */
    }
    if (isEncryptedBackup(parsed)) {
      if (!cryptoAvailable()) throw new CryptoUnavailableError();
      const p = passphrase?.trim() ? passphrase : getPassphrase();
      if (!p) throw new BackupPassphraseError('needed');
      try {
        return await importSnapshot(parseSnapshot(await decryptBackup(parsed, p)));
      } catch (e) {
        if (e instanceof DecryptError) throw new BackupPassphraseError('wrong');
        throw e;
      }
    }
    return importSnapshot(parseSnapshot(text));
  }
}

export const syncEngine = new SyncEngine();
