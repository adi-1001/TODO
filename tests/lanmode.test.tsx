// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import fc from 'fast-check';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/db';
import { NO_FILTERS, NO_REPEAT } from '../src/db/defaults';
import { sha256Bytes, toHex } from '../src/lib/sha256';
import { newId } from '../src/lib/ids';
import { parseHash } from '../src/state/UIProvider';
import { storePassphrase } from '../src/sync/passphrase';
import { CryptoUnavailableError, cryptoAvailable, isEnvelope } from '../src/sync/cryptoUtils';
import { SyncEngine, roomId } from '../src/sync/syncEngine';
import type { CloudAdapter, CloudRow } from '../src/sync/supabaseAdapter';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const realSubtle = globalThis.crypto.subtle;
const realUUID = globalThis.crypto.randomUUID;

function setSecure(secure: boolean) {
  Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: secure ? realSubtle : undefined });
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: secure ? realUUID : undefined });
}

function fakeServer() {
  const rows = new Map<string, CloudRow>();
  const adapter: CloudAdapter = {
    connect: async () => undefined,
    pullAll: async () => [...rows.values()],
    push: async (list) => {
      for (const r of list) {
        const k = `${r.table_name}/${r.record_id}`;
        const s = rows.get(k);
        if (!s || s.updated_at < r.updated_at) rows.set(k, r);
      }
    },
    broadcast: () => undefined,
    disconnect: async () => undefined,
  };
  return { rows, adapter };
}

async function addLocalTask() {
  await db.tasks.put({
    id: 't1',
    updatedAt: 10,
    title: 'Circle theorems',
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
  });
}

beforeEach(async () => {
  setSecure(true);
  await Promise.all(db.tables.map((t) => t.clear()));
  localStorage.clear();
});

describe('Pages without Web Crypto (http://192.168.x.x)', () => {
  it('the JavaScript SHA-256 matches crypto.subtle, so both join the same sync room', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 300 }), async (bytes) => {
        const native = new Uint8Array(await realSubtle.digest('SHA-256', bytes));
        expect(toHex(sha256Bytes(bytes))).toBe(toHex(native));
      }),
      { numRuns: 200 },
    );
    const secureRoom = await roomId('study-cedar-comet-iris-4821');
    setSecure(false);
    expect(await roomId('study-cedar-comet-iris-4821')).toBe(secureRoom);
  });

  it('ids still work without randomUUID, and crypto is reported as missing', () => {
    setSecure(false);
    expect(cryptoAvailable()).toBe(false);
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    expect(ids.size).toBe(500);
  });

  it('plain sync still runs when no passphrase is set', async () => {
    setSecure(false);
    const { rows, adapter } = fakeServer();
    await addLocalTask();
    const engine = new SyncEngine({ cloudAvailable: true, createAdapter: async () => adapter });
    await engine.start('study-cedar-comet-iris-4821');
    expect(engine.getInfo()).toMatchObject({ status: 'cloud', cryptoAvailable: false });
    expect(rows.has('tasks/t1')).toBe(true);
  });

  it('with a passphrase set, sync pauses instead of uploading plain data, and nothing throws', async () => {
    setSecure(false);
    storePassphrase('correct horse battery staple');
    const { rows, adapter } = fakeServer();
    await addLocalTask();
    const engine = new SyncEngine({ cloudAvailable: true, createAdapter: async () => adapter });
    await engine.start('study-cedar-comet-iris-4821');
    expect(engine.getInfo()).toMatchObject({ status: 'paused', pauseReason: 'crypto-unavailable' });
    expect(rows.size).toBe(0);
    expect(engine.wouldReencrypt('another passphrase here')).toBe(false);
    await expect(engine.exportJson(true)).rejects.toBeInstanceOf(CryptoUnavailableError);
    expect(JSON.parse(await engine.exportJson(false)).app).toBe('study-space');
  });

  it('encrypted cloud data is reported as needing HTTPS, not as a wrong passphrase', async () => {
    const { rows, adapter } = fakeServer();
    rows.set('tasks/t9', { table_name: 'tasks', record_id: 't9', data: { encrypted: true, v: 1, iv: 'AAAA', salt: 'AAAA', ciphertext: 'AAAA' }, updated_at: 5 });
    expect(isEnvelope(rows.get('tasks/t9')!.data)).toBe(true);
    setSecure(false);
    const engine = new SyncEngine({ cloudAvailable: true, createAdapter: async () => adapter });
    await engine.start('study-cedar-comet-iris-4821');
    expect(engine.getInfo()).toMatchObject({ status: 'paused', pauseReason: 'crypto-unavailable' });
  });
});

describe('Routing', () => {
  it('every form of the root address opens the Dashboard', () => {
    for (const h of ['', '#', '#/', '#//', '#/unknown', '#/?x=1', undefined, null]) expect(parseHash(h as string)).toEqual({ view: 'dashboard', section: null });
    expect(parseHash('#/settings/sync')).toEqual({ view: 'settings', section: 'sync' });
    expect(parseHash('#/syllabus/tests?from=widget')).toEqual({ view: 'syllabus', section: 'tests' });
  });
});

describe('Error boundary', () => {
  function Broken(): never {
    throw new TypeError("Cannot read properties of undefined (reading 'map')");
  }

  it('shows the error and stack instead of a blank page, and Reset keeps study data and the Sync ID', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, pathname: '/', reload } });
    localStorage.setItem('study-space:prefs', JSON.stringify({ theme: 'dark', syncId: 'study-cedar-comet-iris-4821', timer: { mode: 'test' } }));
    localStorage.setItem('study-space:timer', '{"status":"broken"}');
    localStorage.setItem('study-space:sync-passphrase', 'kept passphrase');
    await addLocalTask();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() =>
      root.render(
        <ErrorBoundary scope="app">
          <Broken />
        </ErrorBoundary>,
      ),
    );
    const card = el.querySelector('[role="alert"]')!;
    expect(card.textContent).toContain("TypeError: Cannot read properties of undefined (reading 'map')");
    expect(card.textContent).toContain('Component stack');
    expect(card.textContent).toContain('Broken');

    const reset = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Reset View State and Reload')!;
    act(() => reset.click());
    expect(reload).toHaveBeenCalled();
    expect(localStorage.getItem('study-space:timer')).toBeNull();
    expect(JSON.parse(localStorage.getItem('study-space:prefs')!)).toEqual({ theme: 'dark', syncId: 'study-cedar-comet-iris-4821' });
    expect(localStorage.getItem('study-space:sync-passphrase')).toBe('kept passphrase');
    expect(await db.tasks.get('t1')).toBeDefined();

    // The hard reset asks first.
    const hard = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Hard Reset Local Database')!;
    act(() => hard.click());
    expect(el.textContent).toContain('This cannot be undone');
    expect([...el.querySelectorAll('button')].some((b) => b.textContent === 'Delete local database and reload')).toBe(true);

    act(() => root.unmount());
    spy.mockRestore();
  });
});
