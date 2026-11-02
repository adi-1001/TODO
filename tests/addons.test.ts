import 'fake-indexeddb/auto';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import { NO_FILTERS, NO_REPEAT } from '../src/db/defaults';
import { normalizeRecord } from '../src/db/migrate';
import {
  addChapter,
  addChapterQuestions,
  addQuestions,
  addSession,
  addSubject,
  addTask,
  completeTask,
  recordBackup,
  scheduleBrushUp,
  setChapterStatus,
  updateChapter,
} from '../src/db/repo';
import { BACKUP_INTERVAL_DAYS, backupDue, backupReminderText } from '../src/lib/backupReminder';
import { BRUSH_UP_DAYS, brushUpDays, chaptersWithOpenBrushUp, lastStudiedByChapter } from '../src/lib/decay';
import { DAY, MINUTE, addDays, dayKey } from '../src/lib/time';
import {
  breaksAfter,
  displayMs,
  elapsedMs,
  initialTimer,
  normalizeSelection,
  normalizeTimerState,
  pause,
  start,
  switchSection,
  switchTask,
  testLaps,
  tick,
} from '../src/timer/timerMachine';
import type { Chapter, FocusSession } from '../src/types';
import { NOW } from './arbitraries';

const RUNS = { numRuns: 300 };

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

function chapter(over: Partial<Chapter>): Chapter {
  return { id: 'c', updatedAt: 1, subjectId: 's', title: 'Optics', order: 0, status: 'completed', theoryDone: true, referenceBookDone: true, pyqDone: true, revisionDone: false, lastStudiedAt: null, targetQuestions: null, createdAt: 1, ...over };
}

function session(over: Partial<FocusSession>): FocusSession {
  return { id: 'x', updatedAt: 1, taskId: null, subjectId: 's', chapterId: 'c', category: null, quickRevision: false, mode: 'pomodoro', status: 'completed', segments: [], start: 0, end: 0, durationMs: 0, plannedMinutes: 25, createdAt: 0, ...over };
}

/* ---------- Revision decay ---------- */

describe('Revision decay', () => {
  it('needs a brush-up only when finished or revised and 14 or more days have passed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('not_started', 'ongoing', 'completed') as fc.Arbitrary<Chapter['status']>,
        fc.boolean(),
        fc.option(fc.integer({ min: 0, max: 60 }), { nil: null }),
        (status, revisionDone, daysAgo) => {
          const today = '2026-10-28';
          const last = daysAgo === null ? null : new Date(2026, 9, 28 - daysAgo, 15).getTime();
          const got = brushUpDays(chapter({ status, revisionDone }), last, today);
          const eligible = status === 'completed' || revisionDone;
          if (!eligible || daysAgo === null || daysAgo < BRUSH_UP_DAYS) expect(got).toBeNull();
          else expect(got).toBe(daysAgo);
        },
      ),
      RUNS,
    );
  });

  it('last studied is the later of the stored time and the latest counted session', () => {
    const chapters = [chapter({ id: 'a', lastStudiedAt: 100 }), chapter({ id: 'b', lastStudiedAt: null }), chapter({ id: 'c', lastStudiedAt: 900 })];
    const sessions = [
      session({ id: '1', chapterId: 'a', end: 500 }),
      session({ id: '2', chapterId: 'b', end: 300 }),
      session({ id: '3', chapterId: 'c', end: 800 }),
      session({ id: '4', chapterId: 'b', end: 9999, status: 'failed_strict' }),
    ];
    const m = lastStudiedByChapter(chapters, sessions);
    expect(m.get('a')).toBe(500);
    expect(m.get('b')).toBe(300);
    expect(m.get('c')).toBe(900);
    expect(lastStudiedByChapter([chapter({ id: 'z' })], []).get('z')).toBeNull();
  });

  it('old chapter records gain lastStudiedAt as null', () => {
    expect(normalizeRecord('chapters', { id: 'c', updatedAt: 1, subjectId: 's', title: 'Optics' })).toMatchObject({ lastStudiedAt: null });
  });

  it('studying moves lastStudiedAt forward: sessions, questions, Revision Done, Completed, finished tasks', async () => {
    const subject = await addSubject('Physics', '#F5A35C');
    const read = async (id: string) => (await db.chapters.get(id))!.lastStudiedAt;

    const c1 = await addChapter(subject.id, 'Optics');
    expect(await read(c1.id)).toBeNull();
    await updateChapter(c1.id, { revisionDone: true });
    expect(await read(c1.id)).not.toBeNull();

    const c2 = await addChapter(subject.id, 'Waves');
    await setChapterStatus(c2.id, 'completed');
    expect(await read(c2.id)).not.toBeNull();

    const c3 = await addChapter(subject.id, 'Gravitation');
    await addChapterQuestions(c3.id, 2);
    const afterQuestions = await read(c3.id);
    expect(afterQuestions).not.toBeNull();
    // A minus, or a second tap within 10 minutes, does not rewrite the chapter.
    await addChapterQuestions(c3.id, -1);
    await addChapterQuestions(c3.id, 1);
    expect(await read(c3.id)).toBe(afterQuestions);

    const c4 = await addChapter(subject.id, 'Fluids');
    const task = await addTask({ title: 'Fluids set', subjectId: subject.id, chapterId: c4.id, category: 'current', priority: 'normal', dueDate: null, targetMode: 'pomodoro', estimatedPomodoros: 1, pomodoroMinutes: 25, unitTarget: 10, unitLabel: 'Questions', repeat: { ...NO_REPEAT }, reminderTime: null, filters: { ...NO_FILTERS }, subtasks: [] });
    await addQuestions(task.id, 1);
    expect(await read(c4.id)).not.toBeNull();

    const c5 = await addChapter(subject.id, 'Heat');
    const t5 = await addTask({ title: 'Heat', subjectId: subject.id, chapterId: c5.id, category: 'current', priority: 'normal', dueDate: null, targetMode: 'pomodoro', estimatedPomodoros: 1, pomodoroMinutes: 25, unitTarget: 10, unitLabel: 'Questions', repeat: { ...NO_REPEAT }, reminderTime: null, filters: { ...NO_FILTERS }, subtasks: [] });
    const end = NOW - 2 * DAY;
    await addSession({ phase: 'focus', mode: 'pomodoro', taskId: t5.id, segments: [{ start: end - 25 * MINUTE, end }], targetMs: 25 * MINUTE, breakKind: null, sectionSubjectId: null });
    expect(await read(c5.id)).toBe(end);
    await completeTask(t5.id);
    expect(await read(c5.id)!).toBeGreaterThan(end);
  });

  it('a brush-up is a 25-minute Quick Revision task in Pending Topics, created once', async () => {
    const subject = await addSubject('Physics', '#F5A35C');
    const c = await addChapter(subject.id, 'Units and Measurement');
    const a = (await scheduleBrushUp(c.id))!;
    const b = (await scheduleBrushUp(c.id))!;
    expect(b.id).toBe(a.id);
    expect(a).toMatchObject({ title: 'Brush-up: Units and Measurement', category: 'pending', column: 'pending', chapterId: c.id, subjectId: subject.id, quickRevision: true, estimatedPomodoros: 1, pomodoroMinutes: 25 });
    expect(a.subtasks.map((s) => s.label)).toEqual(['Summary', 'Formula Sheet', 'Past Questions']);
    expect(chaptersWithOpenBrushUp(await db.tasks.toArray()).has(c.id)).toBe(true);

    // Finishing it resets the clock: the chapter is no longer due.
    await db.chapters.update(c.id, { status: 'completed', lastStudiedAt: Date.now() - 30 * DAY });
    expect(brushUpDays((await db.chapters.get(c.id))!, (await db.chapters.get(c.id))!.lastStudiedAt, dayKey(Date.now()))).toBe(30);
    await completeTask(a.id);
    const after = (await db.chapters.get(c.id))!;
    expect(brushUpDays(after, after.lastStudiedAt, dayKey(Date.now()))).toBeNull();
    expect(chaptersWithOpenBrushUp(await db.tasks.toArray()).has(c.id)).toBe(false);
  });
});

/* ---------- Test Mode ---------- */

describe('Test Mode timer', () => {
  it('defaults to 180 minutes, allows 1 to 600, and never ends in a break', () => {
    expect(normalizeSelection({ mode: 'test', minutes: Number.NaN })).toEqual({ mode: 'test', minutes: 180 });
    expect(normalizeSelection({ mode: 'test', minutes: 900 })).toEqual({ mode: 'test', minutes: 600 });
    expect(normalizeSelection({ mode: 'test', minutes: 60 })).toEqual({ mode: 'test', minutes: 60 });
    const s = start(initialTimer(), { mode: 'test', minutes: 180 }, null, NOW);
    expect(s).toMatchObject({ mode: 'test', targetMs: 180 * MINUTE, sectionSubjectId: null, laps: {} });
    expect(breaksAfter(s)).toBe(false);
    expect(breaksAfter(start(initialTimer(), { mode: 'pomodoro', minutes: 25 }, null, NOW))).toBe(true);
  });

  it('section laps add up to the elapsed time and the countdown is unchanged by switching', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ after: fc.integer({ min: 0, max: 20 * MINUTE }), to: fc.constantFrom(null, 'phy', 'chem', 'maths'), pauseIt: fc.boolean() }), { maxLength: 12 }),
        (steps) => {
          let s = start(initialTimer(), { mode: 'test', minutes: 600 }, null, NOW);
          let t = NOW;
          let logged = 0;
          for (const step of steps) {
            t += step.after;
            if (step.pauseIt && s.status === 'running') s = pause(s, t);
            const before = displayMs(s, t);
            const r = switchSection(s, step.to, t);
            if (r.completed) logged += r.completed.segments.reduce((a, g) => a + g.end - g.start, 0);
            s = r.state;
            expect(displayMs(s, t)).toBe(before);
          }
          const laps = testLaps(s, t);
          expect(laps.reduce((a, l) => a + l.ms, 0)).toBe(elapsedMs(s, t));
          expect(logged).toBeLessThanOrEqual(elapsedMs(s, t));
        },
      ),
      RUNS,
    );
  });

  it('a piece is logged with its section, and finishing at zero keeps the last section', () => {
    let s = start(initialTimer(), { mode: 'test', minutes: 60 }, null, NOW);
    s = switchSection(s, 'phy', NOW).state;
    const r1 = switchSection(s, 'chem', NOW + 25 * MINUTE);
    expect(r1.completed).toMatchObject({ mode: 'test', sectionSubjectId: 'phy', segments: [{ start: NOW, end: NOW + 25 * MINUTE }] });
    s = r1.state;
    // Switching the task keeps the section and still counts the time for it.
    s = switchTask(s, 'task-1', NOW + 40 * MINUTE).state;
    const end = tick(s, NOW + 61 * MINUTE);
    expect(end.event).toBe('finished');
    expect(end.at).toBe(NOW + 60 * MINUTE);
    expect(end.completed).toMatchObject({ sectionSubjectId: 'chem', taskId: 'task-1' });
    expect(testLaps(s, NOW + 60 * MINUTE)).toEqual([
      { subjectId: 'chem', ms: 35 * MINUTE },
      { subjectId: 'phy', ms: 25 * MINUTE },
    ]);
    // Other modes ignore section changes.
    const p = start(initialTimer(), { mode: 'pomodoro', minutes: 25 }, null, NOW);
    expect(switchSection(p, 'phy', NOW + MINUTE).state).toBe(p);
  });

  it('a timer saved before Test Mode existed gets the new fields', () => {
    const old = { ...initialTimer() } as Record<string, unknown>;
    delete old.laps;
    delete old.sectionSubjectId;
    expect(normalizeTimerState(old as never)).toMatchObject({ laps: {}, sectionSubjectId: null });
  });

  it('a section session is saved under its subject, not the task subject', async () => {
    const task = await addTask({ title: 'Mock paper', subjectId: 'maths', chapterId: 'ch-1', category: 'current', priority: 'normal', dueDate: null, targetMode: 'pomodoro', estimatedPomodoros: 1, pomodoroMinutes: 25, unitTarget: 10, unitLabel: 'Questions', repeat: { ...NO_REPEAT }, reminderTime: null, filters: { ...NO_FILTERS }, subtasks: [] });
    const s = await addSession({ phase: 'focus', mode: 'test', taskId: task.id, segments: [{ start: NOW, end: NOW + 40 * MINUTE }], targetMs: 180 * MINUTE, breakKind: null, sectionSubjectId: 'physics' });
    expect(s).toMatchObject({ mode: 'test', subjectId: 'physics', chapterId: null, taskId: task.id });
    const same = await addSession({ phase: 'focus', mode: 'test', taskId: task.id, segments: [{ start: NOW + 50 * MINUTE, end: NOW + 70 * MINUTE }], targetMs: 180 * MINUTE, breakKind: null, sectionSubjectId: 'maths' });
    expect(same).toMatchObject({ subjectId: 'maths', chapterId: 'ch-1' });
  });
});

/* ---------- Backup reminder ---------- */

describe('Backup reminder', () => {
  it('shows after 3 sessions with no backup, or more than 7 days after the last one', () => {
    fc.assert(
      fc.property(fc.option(fc.integer({ min: 0, max: 30 * DAY }), { nil: null }), fc.integer({ min: 0, max: 10 }), (ago, sessions) => {
        const r = backupDue(ago === null ? null : NOW - ago, sessions, NOW);
        if (ago === null) {
          expect(r).toEqual({ due: sessions >= 3, days: null });
        } else {
          expect(r.due).toBe(ago > BACKUP_INTERVAL_DAYS * DAY);
          expect(r.days).toBe(Math.floor(ago / DAY));
        }
      }),
      RUNS,
    );
    expect(backupReminderText(9)).toBe('It has been 9 days since your last local backup.');
    expect(backupReminderText(null)).toBe('You have not saved a local backup yet.');
  });

  it('saving a backup records the time in synced settings', async () => {
    await recordBackup(NOW);
    expect((await db.userSettings.get('app'))!.lastBackupAt).toBe(NOW);
    expect(backupDue(NOW, 10, NOW + 3 * DAY).due).toBe(false);
    expect(backupDue(NOW, 10, NOW + 8 * DAY).due).toBe(true);
    expect(addDays('2026-10-28', 7)).toBe('2026-11-04');
  });
});
