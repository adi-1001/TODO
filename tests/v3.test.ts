import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { StudyDB, db } from '../src/db/db';
import { NO_FILTERS, NO_REPEAT } from '../src/db/defaults';
import { legacyQuestionLogs } from '../src/db/migrate';
import {
  addChapter,
  addChapterQuestions,
  addQuestions,
  addScheduleSlot,
  addSubject,
  addTask,
  applyRemote,
  clearDayOverride,
  createFixTasks,
  ensureTestOccurrences,
  importSnapshot,
  overrideSlotForDate,
  removeScheduleSlot,
  saveTest,
  saveTestResult,
  setScheduleDayActive,
  setTaskQuestions,
  type TaskInput,
  type TestInput,
} from '../src/db/repo';
import { cleanMetricIds, computeMetric, METRIC_OPTIONS, type MetricContext } from '../src/lib/metrics';
import { isQuestionUnit, questionSummary, questionsBy, questionsForChapter, questionsForSubject, questionsForTask, sumQuestions } from '../src/lib/questions';
import { classMsRemaining, effectiveSlots, scheduledBlocks, weekdayOf } from '../src/lib/schedule';
import { nextOccurrenceDate, pendingOccurrences } from '../src/lib/tests';
import { remindersOnDay, upcomingReminders } from '../src/lib/reminders';
import { MINUTE, addDays, atTime, dayKey } from '../src/lib/time';
import { validateSnapshot } from '../src/sync/snapshot';
import {
  breakMinutesFor,
  displayMs,
  elapsedMs,
  initialTimer,
  pause,
  phaseProgress,
  remainingMs,
  start,
  switchTask,
  tick,
} from '../src/timer/timerMachine';
import type { QuestionLog, ScheduleDay, ScheduleOverride, TestEvent } from '../src/types';
import { NOW, makeTask } from './arbitraries';

const RUNS = { numRuns: 300 };

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

function taskInput(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    title: 'Task',
    subjectId: 's1',
    chapterId: null,
    category: 'current',
    priority: 'normal',
    dueDate: null,
    targetMode: 'pomodoro',
    estimatedPomodoros: 2,
    pomodoroMinutes: 25,
    unitTarget: 10,
    unitLabel: 'Questions',
    repeat: { ...NO_REPEAT },
    reminderTime: null,
    filters: { ...NO_FILTERS },
    subtasks: [],
    ...overrides,
  };
}

const live = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);

/* ---------- P13: question totals ---------- */

const arbLogs: fc.Arbitrary<QuestionLog[]> = fc.array(
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 6 }),
    updatedAt: fc.integer({ min: 1, max: 100 }),
    deleted: fc.boolean(),
    day: fc.constantFrom('2026-10-26', '2026-10-27', '2026-10-28', '2026-10-01'),
    taskId: fc.constantFrom(null, 't1', 't2'),
    chapterId: fc.constantFrom(null, 'c1', 'c2'),
    subjectId: fc.constantFrom(null, 's1', 's2'),
    count: fc.integer({ min: -20, max: 40 }),
    createdAt: fc.constant(1),
  }),
  { maxLength: 30 },
);

describe('Questions practiced (P13)', () => {
  it('totals are sums of matching live logs and are never negative', () => {
    fc.assert(
      fc.property(arbLogs, (logs) => {
        const liveLogs = logs.filter((l) => !l.deleted);
        const raw = (pred: (l: QuestionLog) => boolean) => liveLogs.filter(pred).reduce((a, l) => a + l.count, 0);
        expect(sumQuestions(logs)).toBe(Math.max(0, raw(() => true)));
        expect(questionsForTask(logs, 't1')).toBe(Math.max(0, raw((l) => l.taskId === 't1')));
        expect(questionsForChapter(logs, 'c2')).toBe(Math.max(0, raw((l) => l.chapterId === 'c2')));
        expect(questionsForSubject(logs, 's1')).toBe(Math.max(0, raw((l) => l.subjectId === 's1')));
        for (const v of questionsBy(logs, (l) => l.taskId).values()) expect(v).toBeGreaterThanOrEqual(0);
        const s = questionSummary(logs, new Date(2026, 9, 28, 12).getTime());
        expect(s.today).toBe(Math.max(0, raw((l) => l.day === '2026-10-28')));
        expect(s.week).toBe(Math.max(0, raw((l) => l.day >= '2026-10-26' && l.day <= '2026-11-01')));
      }),
      RUNS,
    );
  });

  it('recognises question-word unit labels only', () => {
    for (const l of ['Questions', 'PYQs', 'problems', 'MCQ', 'Numericals', ' Question ']) expect(isQuestionUnit(l)).toBe(true);
    for (const l of ['Pages', 'Lectures', 'Chapters', '']) expect(isQuestionUnit(l)).toBe(false);
  });

  it('a task question counts for its chapter and subject, and minus never goes below zero', async () => {
    const subject = await addSubject('Maths', '#6FA8DC');
    const chapter = await addChapter(subject.id, 'Circles');
    const task = await addTask(taskInput({ subjectId: subject.id, chapterId: chapter.id }));
    expect(await addQuestions(task.id, 1)).toBe(1);
    expect(await addQuestions(task.id, 4)).toBe(5);
    expect(await addQuestions(task.id, -9)).toBe(0);
    expect(await setTaskQuestions(task.id, 7)).toBe(7);
    expect(await addChapterQuestions(chapter.id, 3)).toBe(10);

    const logs = await db.questionLogs.toArray();
    // One record per device, source and day: one for the task, one for the chapter adjustment.
    expect(logs).toHaveLength(2);
    expect(questionsForTask(logs, task.id)).toBe(7);
    expect(questionsForChapter(logs, chapter.id)).toBe(10);
    expect(questionsForSubject(logs, subject.id)).toBe(10);

    // The chapter total can be lowered by hand, but not below zero.
    expect(await addChapterQuestions(chapter.id, -50)).toBe(0);
  });

  it('two devices adding questions on the same day never overwrite each other', async () => {
    const task = await addTask(taskInput());
    await addQuestions(task.id, 3);
    const day = dayKey(Date.now());
    await applyRemote('questionLogs', [{ id: `q-otherdev-t.${task.id}-${day}`, updatedAt: Date.now() + 5, day, taskId: task.id, chapterId: null, subjectId: 's1', count: 4, createdAt: Date.now() }]);
    expect(questionsForTask(await db.questionLogs.toArray(), task.id)).toBe(7);
  });
});

/* ---------- P14: carrying over version 2 counts ---------- */

const v2Tasks = [
  { id: 'unit-q', updatedAt: 9, title: 'PYQs', subjectId: 's1', chapterId: 'c1', targetMode: 'unit', unitLabel: 'PYQs', unitTarget: 20, unitDone: 3, problemsSolved: 12, createdAt: NOW - 10 * 86_400_000, completedAt: null },
  { id: 'pages', updatedAt: 9, title: 'Notes', subjectId: 's1', chapterId: null, targetMode: 'unit', unitLabel: 'Pages', unitTarget: 30, unitDone: 5, problemsSolved: 2, createdAt: NOW - 5 * 86_400_000, completedAt: null },
  { id: 'plain', updatedAt: 9, title: 'Read', subjectId: 's2', chapterId: null, targetMode: 'pomodoro', problemsSolved: 0, createdAt: NOW, completedAt: null },
];
const v2Chapters = [{ id: 'c1', updatedAt: 9, subjectId: 's1', title: 'Circles', pastQuestionsSolved: 20, createdAt: NOW - 30 * 86_400_000 }];

describe('Carrying over version 2 question counts (P14)', () => {
  it('creates one deterministic log per counted task and chapter, dated to the record', () => {
    const logs = legacyQuestionLogs(v2Tasks, v2Chapters, 1);
    expect(logs.map((l) => [l.id, l.count])).toEqual([
      ['q-v2-task-unit-q', 12],
      ['q-v2-task-pages', 2],
      ['q-v2-chapter-c1', 20],
    ]);
    expect(logs[0]).toMatchObject({ chapterId: 'c1', subjectId: 's1', day: dayKey(v2Tasks[0].createdAt) });
    expect(logs[2]).toMatchObject({ taskId: null, subjectId: 's1' });
    expect(legacyQuestionLogs(v2Tasks, v2Chapters, 1)).toEqual(logs);
  });

  it('a version 2 backup converts its counts, and importing it twice does not double them', async () => {
    const backup = { app: 'study-space', version: 2, exportedAt: 1, tables: { tasks: v2Tasks, chapters: v2Chapters } };
    const s = validateSnapshot(backup);
    expect(s.tables.questionLogs).toHaveLength(3);
    expect(s.tables.tasks.find((t) => t.id === 'unit-q')!.unitDone).toBe(0);
    expect(s.tables.tasks.find((t) => t.id === 'pages')!.unitDone).toBe(5);
    await importSnapshot(s);
    await importSnapshot(validateSnapshot(backup));
    const logs = await db.questionLogs.toArray();
    expect(sumQuestions(logs)).toBe(34);
    expect(questionsForChapter(logs, 'c1')).toBe(32);
  });

  it('the database upgrade from version 3 carries the counts over and removes the old fields', async () => {
    const name = `upgrade3-${Math.random().toString(36).slice(2)}`;
    const v3 = new Dexie(name);
    v3.version(3).stores({
      subjects: 'id, updatedAt, order',
      tasks: 'id, updatedAt, column, dueDate, chapterId',
      focusSessions: 'id, updatedAt, createdAt, taskId',
      blocks: 'id, updatedAt, start',
      quickNotes: 'id, updatedAt, createdAt',
      days: 'id, updatedAt',
      goals: 'id, updatedAt',
      chapters: 'id, updatedAt, subjectId',
      hydrationLogs: 'id, updatedAt',
      reflectionQuestions: 'id, updatedAt, order',
      eveningReviews: 'id, updatedAt',
      userSettings: 'id, updatedAt',
      customAudioFiles: 'id, createdAt',
    });
    await v3.open();
    await v3.table('tasks').bulkAdd(v2Tasks);
    await v3.table('chapters').bulkAdd(v2Chapters);
    v3.close();

    const upgraded = new StudyDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(8);
    const logs = await upgraded.questionLogs.toArray();
    expect(logs.map((l) => l.id).sort()).toEqual(['q-v2-chapter-c1', 'q-v2-task-pages', 'q-v2-task-unit-q']);
    const unitQ = (await upgraded.tasks.get('unit-q'))! as unknown as Record<string, unknown>;
    expect(unitQ.unitDone).toBe(0);
    expect(unitQ).not.toHaveProperty('problemsSolved');
    expect((await upgraded.tasks.get('pages'))!.unitDone).toBe(5);
    expect(await upgraded.chapters.get('c1')).not.toHaveProperty('pastQuestionsSolved');
    upgraded.close();
    await Dexie.delete(name);
  });
});

/* ---------- P15 and P18: timer ---------- */

describe('Switching task mid-run (P15)', () => {
  it('keeps the displayed time and progress, and logs exactly the time so far', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('pomodoro', 'stopwatch', 'quickstart') as fc.Arbitrary<'pomodoro' | 'stopwatch' | 'quickstart'>,
        fc.integer({ min: 1, max: 60 * MINUTE }),
        fc.boolean(),
        fc.integer({ min: 0, max: 30 * MINUTE }),
        (mode, ranFor, paused, later) => {
          let s = start(initialTimer(), { mode, minutes: 50 }, 'a', NOW, 25);
          const t1 = NOW + ranFor;
          if (paused) s = pause(s, t1);
          const before = { display: displayMs(s, t1), progress: phaseProgress(s, t1), elapsed: elapsedMs(s, t1) };
          const { state, completed } = switchTask(s, 'b', t1);
          expect(state.taskId).toBe('b');
          expect(displayMs(state, t1)).toBe(before.display);
          expect(phaseProgress(state, t1)).toBeCloseTo(before.progress, 9);
          const logged = completed!.segments.reduce((a, g) => a + g.end - g.start, 0);
          expect(completed!.taskId).toBe('a');
          expect(logged).toBe(before.elapsed);
          // Time keeps counting for the new task from here.
          if (!paused) expect(elapsedMs(state, t1 + later)).toBe(before.elapsed + later);
          else expect(elapsedMs(state, t1 + later)).toBe(before.elapsed);
        },
      ),
      RUNS,
    );
  });

  it('a switched countdown still finishes at the original moment', () => {
    let s = start(initialTimer(), { mode: 'pomodoro', minutes: 25 }, 'a', NOW);
    s = switchTask(s, 'b', NOW + 10 * MINUTE).state;
    expect(remainingMs(s, NOW + 10 * MINUTE)).toBe(15 * MINUTE);
    const r = tick(s, NOW + 25 * MINUTE + 1000);
    expect(r.event).toBe('finished');
    expect(r.at).toBe(NOW + 25 * MINUTE);
    expect(r.completed!.segments).toEqual([{ start: NOW + 10 * MINUTE, end: NOW + 25 * MINUTE }]);
    expect(r.completed!.taskId).toBe('b');
  });

  it('outside an active focus run only the task changes', () => {
    const idle = initialTimer();
    expect(switchTask(idle, 'x', NOW)).toEqual({ state: { ...idle, taskId: 'x' }, completed: null });
  });
});

describe('Break length (P18)', () => {
  const settings = fc.record({ shortBreakMinutes: fc.integer({ min: 0, max: 30 }), longBreakMinutes: fc.integer({ min: 0, max: 60 }), longBreakEvery: fc.integer({ min: 1, max: 8 }) });
  it('follows the long-break cycle, then the 40-minute rule, then the short break', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 120 * MINUTE }), fc.integer({ min: 1, max: 30 }), settings, (focusMs, cycle, s) => {
        const b = breakMinutesFor(focusMs, cycle, s);
        if (cycle % s.longBreakEvery === 0) {
          expect(b).toEqual({ kind: 'long', minutes: s.longBreakMinutes });
        } else if (s.shortBreakMinutes === 0) {
          expect(b).toEqual({ kind: 'short', minutes: 0 });
        } else if (focusMs < 40 * MINUTE) {
          expect(b).toEqual({ kind: 'short', minutes: s.shortBreakMinutes });
        } else {
          expect(b.kind).toBe('short');
          expect(b.minutes).toBeGreaterThanOrEqual(s.shortBreakMinutes);
          expect(b.minutes).toBeLessThanOrEqual(Math.max(10, s.shortBreakMinutes));
          if (s.longBreakMinutes >= 10 && s.shortBreakMinutes <= 10) expect(b.minutes).toBe(10);
        }
      }),
      RUNS,
    );
  });

  it('default settings give 5 minutes after 25 and 10 after 50', () => {
    const d = { shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 };
    expect(breakMinutesFor(25 * MINUTE, 1, d)).toEqual({ kind: 'short', minutes: 5 });
    expect(breakMinutesFor(50 * MINUTE, 1, d)).toEqual({ kind: 'short', minutes: 10 });
    expect(breakMinutesFor(25 * MINUTE, 4, d)).toEqual({ kind: 'long', minutes: 15 });
  });
});

/* ---------- P16: schedule ---------- */

const arbSlot = fc
  .record({ a: fc.integer({ min: 0, max: 22 }), len: fc.integer({ min: 1, max: 4 }), label: fc.constantFrom('Class', 'Lab') })
  .map(({ a, len, label }, ) => ({ id: `s${a}${len}`, start: `${String(a).padStart(2, '0')}:00`, end: `${String(Math.min(23, a + len)).padStart(2, '0')}:${a + len > 23 ? '59' : '00'}`, label }));

describe('Weekly schedule (P16)', () => {
  it('uses the override when present, the active weekday otherwise, and nothing else', () => {
    fc.assert(
      fc.property(fc.array(arbSlot, { maxLength: 3 }), fc.array(arbSlot, { maxLength: 3 }), fc.boolean(), fc.boolean(), fc.integer({ min: 0, max: 20 }), (weekly, special, active, override, offset) => {
        const day = addDays('2026-10-26', offset);
        const days: ScheduleDay[] = [{ id: `weekday-${weekdayOf(day)}`, updatedAt: 1, weekday: weekdayOf(day), active, slots: weekly }];
        const overrides: ScheduleOverride[] = override ? [{ id: day, updatedAt: 1, date: day, slots: special }] : [];
        const got = effectiveSlots(day, days, overrides).map((s) => s.id);
        const want = (override ? special : active ? weekly : []).filter((s) => s.end > s.start).map((s) => s.id);
        expect(got.sort()).toEqual(want.sort());
        // A different weekday without an override has no classes.
        expect(effectiveSlots(addDays(day, 1), days, [])).toEqual([]);
      }),
      RUNS,
    );
  });

  it('scheduled blocks sit on the right day, and remaining class time counts only what is left', () => {
    const day = '2026-10-26';
    const days: ScheduleDay[] = [{ id: 'weekday-1', updatedAt: 1, weekday: 1, active: true, slots: [{ id: 'a', start: '13:00', end: '17:00', label: '' }] }];
    const blocks = scheduledBlocks(day, days, []);
    expect(blocks).toEqual([{ id: 'schedule-2026-10-26-a', updatedAt: 0, kind: 'class', label: 'Class', start: atTime(day, '13:00'), end: atTime(day, '17:00') }]);
    expect(classMsRemaining(blocks, atTime(day, '15:30'))).toBe(90 * MINUTE);
    expect(classMsRemaining(blocks, atTime(day, '18:00'))).toBe(0);
  });

  it('editing or removing a block for one date leaves the weekly schedule alone', async () => {
    const today = dayKey(Date.now());
    const wd = weekdayOf(today);
    expect(await addScheduleSlot(wd, { start: '13:00', end: '20:00', label: 'Coaching' })).toBe(true);
    expect(await addScheduleSlot(wd, { start: '21:00', end: '20:00', label: 'Bad' })).toBe(false);
    const slot = (await db.scheduleDays.get(`weekday-${wd}`))!.slots[0];
    await overrideSlotForDate(today, slot.id, { start: '15:00', end: '19:00', label: 'Coaching' });
    const all = async () => effectiveSlots(today, await db.scheduleDays.toArray(), await db.scheduleOverrides.toArray());
    expect((await all()).map((s) => [s.start, s.end])).toEqual([['15:00', '19:00']]);
    expect(effectiveSlots(addDays(today, 7), await db.scheduleDays.toArray(), await db.scheduleOverrides.toArray()).map((s) => s.start)).toEqual(['13:00']);
    await clearDayOverride(today);
    expect((await all()).map((s) => s.start)).toEqual(['13:00']);
    await setScheduleDayActive(wd, false);
    expect(await all()).toEqual([]);
    await setScheduleDayActive(wd, true);
    await removeScheduleSlot(wd, slot.id);
    expect(await all()).toEqual([]);
  });
});

/* ---------- P17: tests and deadlines ---------- */

const baseTest = (over: Partial<TestEvent>): TestEvent => ({
  id: 't',
  updatedAt: 1,
  title: 'Coaching Test',
  kind: 'coaching',
  date: '2026-10-01',
  repeatEveryDays: 21,
  seriesId: null,
  subjectIds: [],
  chapterIds: [],
  totalMarks: 300,
  targetPercent: 70,
  createdAt: 1,
  ...over,
});

describe('Repeating tests (P17)', () => {
  it('the next occurrence is never before today, steps by the interval, and is created once', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 1, max: 60 }), fc.integer({ min: 1, max: 400 }), (startOffset, every, ahead) => {
        const latest = addDays('2025-01-01', startOffset);
        const today = addDays(latest, ahead);
        const next = nextOccurrenceDate(latest, every, today);
        expect(next >= today).toBe(true);
        expect(addDays(next, -every) < today).toBe(true);
        const tests = [baseTest({ date: latest, repeatEveryDays: every })];
        const first = pendingOccurrences(tests, today);
        expect(first).toHaveLength(1);
        expect(first[0].id).toBe(`t@${next}`);
        const after = [...tests, { ...tests[0], id: first[0].id, seriesId: 't', date: next }];
        expect(pendingOccurrences(after, today)).toEqual([]);
      }),
      RUNS,
    );
  });

  it('tests without a repeat, or still ahead, create nothing', () => {
    expect(pendingOccurrences([baseTest({ repeatEveryDays: null })], '2026-12-01')).toEqual([]);
    expect(pendingOccurrences([baseTest({ date: '2026-12-01' })], '2026-11-01')).toEqual([]);
  });

  it('occurrences, results and fix tasks work against IndexedDB without duplicates', async () => {
    const subject = await addSubject('Physics', '#F5A35C');
    const ch = await addChapter(subject.id, 'Electrostatics');
    const input: TestInput = { title: 'Coaching 3-Week Test', kind: 'coaching', date: addDays(dayKey(Date.now()), -2), repeatEveryDays: 21, subjectIds: [subject.id], chapterIds: [ch.id], totalMarks: 300, targetPercent: 70 };
    const test = await saveTest(input);
    const today = dayKey(Date.now());
    expect(await ensureTestOccurrences(today)).toBe(1);
    expect(await ensureTestOccurrences(today)).toBe(0);
    const next = (await db.tests.get(`${test.id}@${addDays(today, 19)}`))!;
    expect(next).toMatchObject({ seriesId: test.id, chapterIds: [ch.id], title: 'Coaching 3-Week Test' });

    await saveTestResult(test.id, { scored: 189, total: 300, subjects: [], rank: 120, percentile: null, mistakes: { conceptual: 5, calculation: 7, timePressure: 3, guessed: 1 }, weakChapterIds: [ch.id], reflection: 'Recheck units.' });
    expect(await createFixTasks(test.id)).toBe(1);
    expect(await createFixTasks(test.id)).toBe(0);
    const fix = live(await db.tasks.toArray());
    expect(fix).toHaveLength(1);
    expect(fix[0]).toMatchObject({ title: 'Fix weak chapter: Electrostatics', chapterId: ch.id, subjectId: subject.id, category: 'current' });
  });

  it('test reminders fire the evening before and the morning of the test', () => {
    const tests = [baseTest({ id: 'x', date: '2026-10-29', repeatEveryDays: null })];
    expect(remindersOnDay([], tests, '2026-10-28').map((r) => [r.title, r.time])).toEqual([['Tomorrow: Coaching Test', '19:00']]);
    expect(remindersOnDay([], tests, '2026-10-29').map((r) => [r.title, r.time])).toEqual([['Today: Coaching Test', '07:00']]);
    const tasks = [makeTask({ id: 'r', reminderTime: '08:30' })];
    const upcoming = upcomingReminders(tasks, tests, atTime('2026-10-28', '12:00'), 3);
    expect(upcoming.map((r) => r.key)).toEqual(['test:x:eve', 'test:x:day', 'r:2026-10-29', 'r:2026-10-30']);
  });
});

/* ---------- Metrics ---------- */

describe('Overview metrics', () => {
  it('cleaning metric choices keeps 2 to 4 known ids in a fixed order and is idempotent', () => {
    const ids = METRIC_OPTIONS.map((m) => m.id);
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.constantFrom(...ids), fc.string()), { maxLength: 10 }), (raw) => {
        const once = cleanMetricIds(raw, ['questions', 'streak']);
        expect(once.length).toBeGreaterThanOrEqual(2);
        expect(once.length).toBeLessThanOrEqual(4);
        expect(cleanMetricIds(once, ['questions', 'streak'])).toEqual(once);
      }),
      RUNS,
    );
  });

  it('every metric produces a label, a value and a detail from an empty start', () => {
    const ctx: MetricContext = { day: '2026-10-28', now: atTime('2026-10-28', '12:00'), tasks: [], sessions: [], questionLogs: [], chapters: [], tests: [], dailyGoalMinutes: 300, streak: 0, consistency: 0, classMsLeft: 0, classMsTotal: 0, activeChapterId: null };
    for (const { id } of METRIC_OPTIONS) {
      const m = computeMetric(id, ctx);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.value.length).toBeGreaterThan(0);
      expect(m.detail.length).toBeGreaterThan(0);
    }
    expect(computeMetric('focusGoal', ctx)).toMatchObject({ value: '0h 0m', detail: 'of 5h 0m goal' });
  });
});
