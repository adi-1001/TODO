// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import { NO_FILTERS, NO_REPEAT } from '../src/db/defaults';
import { addTask, exportSnapshot } from '../src/db/repo';
import {
  DecryptError,
  PBKDF2_ITERATIONS,
  decryptBackup,
  decryptPayload,
  deriveSyncKey,
  encryptBackup,
  encryptPayload,
  fromBase64,
  isEncryptedBackup,
  isEnvelope,
  recordAad,
} from '../src/sync/cryptoUtils';
import { PASSPHRASE_KEY, storePassphrase } from '../src/sync/passphrase';
import { BackupPassphraseError, PAUSE_MESSAGES, SyncEngine } from '../src/sync/syncEngine';
import type { CloudAdapter, CloudRow } from '../src/sync/supabaseAdapter';
import type { Task } from '../src/types';

const SYNC_ID = 'study-cedar-comet-iris-4821';

/**
 * In-memory stand-in for the Supabase room. `push` follows study_sync_push: a row is replaced
 * when the incoming updated_at is newer, or (current SQL only) when it is equal, different,
 * and encrypted.
 */
class FakeServer {
  rows = new Map<string, CloudRow>();
  currentSql = true;
  adapter(): CloudAdapter {
    return {
      connect: async () => undefined,
      pullAll: async () => [...this.rows.values()].map((r) => structuredClone(r)),
      push: async (rows) => {
        for (const r of rows) {
          const k = `${r.table_name}/${r.record_id}`;
          const s = this.rows.get(k);
          const enc = isEnvelope(r.data);
          const replace = !s || s.updated_at < r.updated_at || (this.currentSql && s.updated_at === r.updated_at && enc && JSON.stringify(s.data) !== JSON.stringify(r.data));
          if (replace) this.rows.set(k, structuredClone(r));
        }
      },
      broadcast: () => undefined,
      disconnect: async () => undefined,
    };
  }
  /** Everything the server can read, as one string. */
  visibleText(): string {
    return JSON.stringify([...this.rows.values()]);
  }
}

function task(id: string, title: string, updatedAt: number): Task {
  return {
    id,
    updatedAt,
    title,
    subjectId: 's1',
    chapterId: null,
    category: 'current',
    column: 'current',
    priority: 'normal',
    dueDate: null,
    targetMode: 'pomodoro',
    estimatedPomodoros: 2,
    pomodoroMinutes: 25,
    unitTarget: 10,
    unitLabel: 'Questions',
    unitDone: 0,
    subtasks: [],
    quickRevision: false,
    savedSubtasks: null,
    savedEstimate: null,
    kind: null,
    targetQuestions: null,
    filters: { ...NO_FILTERS },
    mesh: 0,
    repeat: { ...NO_REPEAT },
    reminderTime: null,
    seriesId: null,
    createdAt: 1,
    completedAt: null,
  };
}

async function serverRowFor(server: FakeServer, t: Task, passphrase: string | null): Promise<void> {
  const data = passphrase ? await encryptPayload(await deriveSyncKey(passphrase, SYNC_ID), t, recordAad('tasks', t.id)) : t;
  server.rows.set(`tasks/${t.id}`, { table_name: 'tasks', record_id: t.id, data, updated_at: t.updatedAt });
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  localStorage.clear();
});

describe('Web Crypto helpers', () => {
  it('encrypts with a fresh salt and IV each time, and opens only with the same key and place', async () => {
    const key = await deriveSyncKey('correct horse battery staple', SYNC_ID);
    const value = { id: 't1', title: 'Gauss Law', updatedAt: 5 };
    const a = await encryptPayload(key, value, recordAad('tasks', 't1'));
    const b = await encryptPayload(key, value, recordAad('tasks', 't1'));
    expect(a).toMatchObject({ encrypted: true, v: 1 });
    expect(Object.keys(a).sort()).toEqual(['ciphertext', 'encrypted', 'iv', 'salt', 'v']);
    expect(fromBase64(a.iv)).toHaveLength(12);
    expect(fromBase64(a.salt)).toHaveLength(16);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(JSON.stringify(a)).not.toContain('Gauss');
    expect(await decryptPayload(key, a, recordAad('tasks', 't1'))).toEqual(value);

    // Wrong passphrase, other Sync ID, moved to another record, or changed ciphertext: all refused.
    const wrong = await deriveSyncKey('correct horse battery stapler', SYNC_ID);
    const otherRoom = await deriveSyncKey('correct horse battery staple', 'another-sync-id-0000');
    await expect(decryptPayload(wrong, a, recordAad('tasks', 't1'))).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptPayload(otherRoom, a, recordAad('tasks', 't1'))).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptPayload(key, a, recordAad('tasks', 't2'))).rejects.toBeInstanceOf(DecryptError);
    const bytes = fromBase64(a.ciphertext);
    bytes[0] ^= 1;
    await expect(decryptPayload(key, { ...a, ciphertext: btoa(String.fromCharCode(...bytes)) }, recordAad('tasks', 't1'))).rejects.toBeInstanceOf(DecryptError);
  });

  it('the same passphrase and Sync ID give the same key on every device', async () => {
    const one = await deriveSyncKey('  correct horse battery staple ', SYNC_ID);
    const two = await deriveSyncKey('correct horse battery staple', SYNC_ID);
    expect(one.fingerprint).toBe(two.fingerprint);
    const env = await encryptPayload(one, { x: 1 }, 'aad');
    expect(await decryptPayload(two, env, 'aad')).toEqual({ x: 1 });
    expect((await deriveSyncKey('correct horse battery staple', 'other-id-123456')).fingerprint).not.toBe(one.fingerprint);
  });

  it('encrypted backups open with the passphrase alone and refuse a wrong one', async () => {
    const text = await encryptBackup('{"app":"study-space"}', 'my backup passphrase');
    const file = JSON.parse(text);
    expect(isEncryptedBackup(file)).toBe(true);
    expect(file).toMatchObject({ app: 'study-space', kind: 'encrypted-backup', encrypted: true, v: 1, kdf: 'PBKDF2-SHA-256', iterations: PBKDF2_ITERATIONS });
    expect(await decryptBackup(file, 'my backup passphrase')).toBe('{"app":"study-space"}');
    await expect(decryptBackup(file, 'not it at all')).rejects.toBeInstanceOf(DecryptError);
  });
});

describe('Encrypted cloud sync', () => {
  it('uploads only ciphertext, and the passphrase never reaches the server or backups', async () => {
    const server = new FakeServer();
    storePassphrase('correct horse battery staple');
    await addTask({ title: 'Secret chapter notes', subjectId: 's1', chapterId: null, category: 'current', priority: 'normal', dueDate: null, targetMode: 'pomodoro', estimatedPomodoros: 1, pomodoroMinutes: 25, unitTarget: 10, unitLabel: 'Questions', repeat: { ...NO_REPEAT }, reminderTime: null, filters: { ...NO_FILTERS }, subtasks: [] });
    const engine = new SyncEngine({ cloudAvailable: true, createAdapter: async () => server.adapter() });
    await engine.start(SYNC_ID);
    expect(engine.getInfo()).toMatchObject({ status: 'cloud', encrypted: true, pauseReason: null });
    expect(server.rows.size).toBeGreaterThan(0);
    for (const r of server.rows.values()) expect(isEnvelope(r.data)).toBe(true);
    expect(server.visibleText()).not.toContain('Secret chapter notes');
    expect(server.visibleText()).not.toContain('correct horse');
    expect(JSON.stringify(await exportSnapshot())).not.toContain('correct horse');
    expect(localStorage.getItem(PASSPHRASE_KEY)).toBe('correct horse battery staple');
  });

  it('a second device with the right passphrase reads the data', async () => {
    const server = new FakeServer();
    await serverRowFor(server, task('remote-1', 'From my PC', 50), 'correct horse battery staple');
    storePassphrase('correct horse battery staple');
    const engine = new SyncEngine({ cloudAvailable: true, createAdapter: async () => server.adapter() });
    await engine.start(SYNC_ID);
    expect(engine.getInfo().status).toBe('cloud');
    expect((await db.tasks.get('remote-1'))?.title).toBe('From my PC');
  });

  it('a wrong passphrase pauses sync and changes nothing here or in the cloud', async () => {
    const server = new FakeServer();
    await serverRowFor(server, task('remote-1', 'From my PC', 50), 'correct horse battery staple');
    await db.tasks.put(task('local-1', 'Only on this phone', 60));
    const before = server.visibleText();
    storePassphrase('a different passphrase');
    const engine = new SyncEngine({ cloudAvailable: true, createAdapter: async () => server.adapter() });
    await engine.start(SYNC_ID);
    expect(engine.getInfo()).toMatchObject({ status: 'paused', pauseReason: 'passphrase-mismatch', message: PAUSE_MESSAGES['passphrase-mismatch'] });
    expect(PAUSE_MESSAGES['passphrase-mismatch']).toBe('Sync paused: Encryption passphrase does not match cloud data.');
    expect(await db.tasks.get('remote-1')).toBeUndefined();
    expect((await db.tasks.get('local-1'))?.title).toBe('Only on this phone');
    expect(server.visibleText()).toBe(before);

    // Entering the right passphrase resumes and merges both ways.
    await engine.setPassphrase('correct horse battery staple');
    expect(engine.getInfo().status).toBe('cloud');
    expect((await db.tasks.get('remote-1'))?.title).toBe('From my PC');
    expect(server.rows.has('tasks/local-1')).toBe(true);
  });

  it('a device without a passphrase pauses instead of uploading plain data to an encrypted room', async () => {
    const server = new FakeServer();
    await serverRowFor(server, task('remote-1', 'From my PC', 50), 'correct horse battery staple');
    await db.tasks.put(task('local-1', 'Private', 60));
    const engine = new SyncEngine({ cloudAvailable: true, createAdapter: async () => server.adapter() });
    await engine.start(SYNC_ID);
    expect(engine.getInfo()).toMatchObject({ status: 'paused', pauseReason: 'passphrase-needed' });
    expect(server.rows.has('tasks/local-1')).toBe(false);
  });

  it('turning encryption on replaces the plain copies already in the cloud', async () => {
    const server = new FakeServer();
    const t = task('plain-1', 'Uploaded before encryption', 40);
    await db.tasks.put(t);
    await serverRowFor(server, t, null);
    storePassphrase('correct horse battery staple');
    const engine = new SyncEngine({ cloudAvailable: true, createAdapter: async () => server.adapter() });
    await engine.start(SYNC_ID);
    expect(engine.getInfo()).toMatchObject({ status: 'cloud', plainRemaining: 0 });
    expect(isEnvelope(server.rows.get('tasks/plain-1')!.data)).toBe(true);
    expect(server.visibleText()).not.toContain('Uploaded before encryption');
  });

  it('with the old server function the plain copies are counted and reported', async () => {
    const server = new FakeServer();
    server.currentSql = false;
    const t = task('plain-1', 'Uploaded before encryption', 40);
    await db.tasks.put(t);
    await serverRowFor(server, t, null);
    storePassphrase('correct horse battery staple');
    const engine = new SyncEngine({ cloudAvailable: true, createAdapter: async () => server.adapter() });
    await engine.start(SYNC_ID);
    expect(engine.getInfo()).toMatchObject({ status: 'cloud', plainRemaining: 1 });
  });

  it('changing the passphrase re-encrypts everything, and keeps the old one if the server cannot', async () => {
    const server = new FakeServer();
    await db.tasks.put(task('local-1', 'Mine', 60));
    await serverRowFor(server, task('remote-1', 'From my PC', 50), 'first passphrase here');
    storePassphrase('first passphrase here');
    const engine = new SyncEngine({ cloudAvailable: true, createAdapter: async () => server.adapter() });
    await engine.start(SYNC_ID);
    expect(engine.wouldReencrypt('second passphrase here')).toBe(true);

    // Old server function: nothing changes and the first passphrase still works.
    server.currentSql = false;
    const refused = await engine.setPassphrase('second passphrase here');
    expect(refused.ok).toBe(false);
    expect(localStorage.getItem(PASSPHRASE_KEY)).toBe('first passphrase here');
    expect(engine.getInfo().status).toBe('cloud');

    // Current server function: every row opens with the new passphrase only.
    server.currentSql = true;
    const done = await engine.setPassphrase('second passphrase here');
    expect(done.ok).toBe(true);
    expect(localStorage.getItem(PASSPHRASE_KEY)).toBe('second passphrase here');
    expect(engine.getInfo().status).toBe('cloud');
    const newKey = await deriveSyncKey('second passphrase here', SYNC_ID);
    const oldKey = await deriveSyncKey('first passphrase here', SYNC_ID);
    for (const r of server.rows.values()) {
      expect(await decryptPayload(newKey, r.data as never, recordAad(String(r.table_name), r.record_id))).toMatchObject({ id: r.record_id });
      await expect(decryptPayload(oldKey, r.data as never, recordAad(String(r.table_name), r.record_id))).rejects.toBeInstanceOf(DecryptError);
    }
    expect(server.rows.has('tasks/remote-1') && server.rows.has('tasks/local-1')).toBe(true);
  });
});

describe('Encrypted backups through the engine', () => {
  it('exports .enc.json with the device passphrase and imports it with or without asking', async () => {
    const engine = new SyncEngine({ cloudAvailable: false });
    await db.tasks.put(task('t1', 'Rotational Motion', 10));
    await expect(engine.exportJson(true)).rejects.toBeInstanceOf(BackupPassphraseError);
    storePassphrase('correct horse battery staple');
    const text = await engine.exportJson(true);
    expect(text).not.toContain('Rotational Motion');
    expect(isEncryptedBackup(JSON.parse(text))).toBe(true);

    await db.tasks.clear();
    expect(await engine.importJson(text)).toBeGreaterThan(0);
    expect((await db.tasks.get('t1'))?.title).toBe('Rotational Motion');

    // On a device with no passphrase (or another one), the passphrase is asked for.
    await db.tasks.clear();
    storePassphrase(null);
    await expect(engine.importJson(text)).rejects.toMatchObject({ reason: 'needed' });
    await expect(engine.importJson(text, 'wrong passphrase')).rejects.toMatchObject({ reason: 'wrong' });
    await engine.importJson(text, 'correct horse battery staple');
    expect((await db.tasks.get('t1'))?.title).toBe('Rotational Motion');

    // Plain backups still work as before.
    expect(JSON.parse(await engine.exportJson(false)).app).toBe('study-space');
  });
});
