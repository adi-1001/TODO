// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Reproduces opening the app on a phone over http://192.168.x.x after using earlier versions:
 * the database is at version 4 and holds records saved before newer fields existed, and the page
 * is not a secure context, so crypto.subtle and crypto.randomUUID are missing.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 86_400_000;
const now = Date.now();

async function seedLegacyDatabase() {
  const legacy = new Dexie('study-space');
  legacy.version(4).stores({
    subjects: 'id, updatedAt, order',
    tasks: 'id, updatedAt, column, dueDate, chapterId',
    blocks: 'id, updatedAt, start',
    days: 'id, updatedAt',
    goals: 'id, updatedAt',
    chapters: 'id, updatedAt, subjectId',
    focusSessions: 'id, updatedAt, createdAt, taskId',
    quickNotes: 'id, updatedAt, createdAt',
    hydrationLogs: 'id, updatedAt',
    reflectionQuestions: 'id, updatedAt, order',
    eveningReviews: 'id, updatedAt',
    userSettings: 'id, updatedAt',
    customAudioFiles: 'id, createdAt',
    questionLogs: 'id, updatedAt, day, taskId, chapterId',
    scheduleDays: 'id, updatedAt',
    scheduleOverrides: 'id, updatedAt',
    tests: 'id, updatedAt, date',
    testResults: 'id, updatedAt',
  });
  await legacy.open();
  // Settings saved by version 2: no overview or review cards, no lastBackupAt.
  await legacy.table('userSettings').put({ id: 'app', updatedAt: 5, displayName: 'Asha', dailyGoalMinutes: 240, hydrationGoal: 8, defaultPomodoroMinutes: 25, clockStyle: 'flip' });
  await legacy.table('subjects').put({ id: 's1', updatedAt: 5, name: 'Maths', color: '#6FA8DC', order: 0 });
  // A chapter without lastStudiedAt, and with an old field that no longer exists.
  await legacy.table('chapters').put({ id: 'c1', updatedAt: 5, subjectId: 's1', title: 'Circles', order: 0, status: 'completed', theoryDone: true, practiceDone: true, revisionDone: true, pastQuestionsSolved: 4, createdAt: 1 });
  // A task missing several later fields.
  await legacy.table('tasks').put({ id: 't1', updatedAt: 5, title: 'Circle theorems', subjectId: 's1', chapterId: 'c1', category: 'current', column: 'current', priority: 'normal', estimatedPomodoros: 2, createdAt: 1 });
  for (let i = 0; i < 3; i++) {
    const start = now - (i + 1) * DAY;
    await legacy.table('focusSessions').put({ id: `run-${start}`, updatedAt: 5, taskId: 't1', subjectId: 's1', chapterId: 'c1', segments: [{ start, end: start + 25 * 60_000 }], plannedMinutes: 25, createdAt: start });
  }
  // A schedule day and a test with list fields missing.
  await legacy.table('scheduleDays').put({ id: 'weekday-1', updatedAt: 5, weekday: 1, active: true });
  await legacy.table('tests').put({ id: 'x1', updatedAt: 5, title: 'Unit test', date: '2099-01-01' });
  await legacy.table('questionLogs').put({ id: 'q1', updatedAt: 5, taskId: 't1', chapterId: 'c1', subjectId: 's1', count: 3 });
  legacy.close();

  // Device state saved by an older version, plus one value that is not valid JSON.
  localStorage.setItem('study-space:timer', JSON.stringify({ status: 'idle', phase: 'focus', mode: 'pomodoro', minutes: 25, taskId: null, segments: [], runningSince: null, targetMs: 1500000, phaseMs: 1500000, quickStartPending: false, breakKind: null, cycle: 0 }));
  localStorage.setItem('study-space:prefs', '{"theme":"dark","syncId":"study-cedar-comet-iris-4821","timer":{"mode":"pomodoro"}}');
  localStorage.setItem('study-space:sync-passphrase', 'correct horse battery staple');
  localStorage.setItem('study-space:reminders-fired', '{not json');
}

function insecureContext() {
  // An http:// page on the LAN: no SubtleCrypto and no randomUUID.
  Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: undefined });
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: undefined });
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  window.scrollTo = (() => undefined) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = () => undefined;
}

async function flush(ms = 80) {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });
  }
}

const errors: unknown[] = [];
let root: Root;

beforeAll(async () => {
  window.addEventListener('error', (e) => errors.push(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => errors.push(e.reason));
  insecureContext();
  await seedLegacyDatabase();
  const { ensureBuiltinQuestions } = await import('../src/db/repo');
  await ensureBuiltinQuestions();
  const { default: App } = await import('../src/App');
  const el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(<App />));
  await flush();
});

afterAll(() => {
  act(() => root.unmount());
});

const text = () => document.body.textContent ?? '';

describe('Startup with old data in a non-secure context', () => {
  it('renders the dashboard with the old records instead of a blank screen', () => {
    expect(document.querySelector('[role="alert"] h1')).toBeNull();
    expect(text()).toContain('Circle theorems');
    expect(text()).toContain('Questions Practiced Today');
    expect(text()).toContain('Tests and Deadlines');
  });

  it('every main view renders with the old records', async () => {
    for (const label of ['Syllabus Tracker', 'Detailed Report', 'Evening Review', 'Settings', 'Dashboard']) {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === label)!;
      act(() => b.click());
      await flush();
      expect(document.querySelector('[role="alert"] h1'), label).toBeNull();
    }
    const clock = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Clock' || x.textContent?.trim() === 'Clock')!;
    act(() => clock.click());
    await flush();
    expect(document.querySelector('[aria-label="Full-screen clock"]')).not.toBeNull();
    expect(document.querySelector('[role="alert"] h1')).toBeNull();
  });

  it('old records were upgraded with the missing fields', async () => {
    const { db } = await import('../src/db/db');
    expect(db.verno).toBeGreaterThanOrEqual(5);
    const s = (await db.userSettings.get('app'))!;
    expect(Array.isArray(s.overviewMetrics)).toBe(true);
    expect(s.lastBackupAt).toBeNull();
    expect((await db.chapters.get('c1'))!.lastStudiedAt).toBeNull();
    expect((await db.tasks.get('t1'))!.subtasks).toEqual([]);
    expect((await db.scheduleDays.get('weekday-1'))!.slots).toEqual([]);
    expect((await db.tests.get('x1'))!.chapterIds).toEqual([]);
  });

  it('Settings explains that end-to-end encryption needs HTTPS here, and nothing threw', async () => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Settings')!;
    act(() => b.click());
    await flush();
    expect(text()).toContain('E2EE requires HTTPS or installed APK; running in local LAN mode');
    expect(errors).toEqual([]);
  });
});
