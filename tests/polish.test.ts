import 'fake-indexeddb/auto';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import { normalizeRecord } from '../src/db/migrate';
import { addChapter, addSubject, addSubjectQuestions, setChapterStatus, updateChapter } from '../src/db/repo';
import { questionsForSubject } from '../src/lib/questions';
import { computeConsistency, computeStreak, streakLock, streakThresholdMs } from '../src/lib/streak';
import { CHAPTER_MILESTONES, autoChapterStatus, chapterProgress, subjectProgress } from '../src/lib/syllabus';
import { MINUTE, addDays } from '../src/lib/time';
import { formatHourShort, formatTime12h, formatTimeRange12h, from12hParts, to12hParts } from '../src/lib/timeFormat';
import { handleBack, pushBackHandler } from '../src/native/backButton';
import { parseHash } from '../src/state/UIProvider';
import type { ChapterStatus } from '../src/types';

const RUNS = { numRuns: 300 };

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('12-hour time of day', () => {
  it('formats strings, timestamps and ranges in 12-hour form', () => {
    expect(formatTime12h('13:00')).toBe('1:00 PM');
    expect(formatTime12h('00:05')).toBe('12:05 AM');
    expect(formatTime12h('12:00')).toBe('12:00 PM');
    expect(formatTime12h('10:41')).toBe('10:41 AM');
    expect(formatTime12h(new Date(2026, 9, 29, 16, 30).getTime())).toBe('4:30 PM');
    expect(formatTimeRange12h('13:00', '20:00')).toBe('1:00 PM – 8:00 PM');
    expect(formatTime12h('25:00')).toBe('');
    expect([6, 8, 10, 12, 14, 16, 18, 20, 22, 0].map(formatHourShort)).toEqual(['6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p', '12a']);
  });

  it('the 12-hour picker round-trips every time of day', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }), (h, m) => {
        const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const p = to12hParts(hhmm);
        expect(p.hour).toBeGreaterThanOrEqual(1);
        expect(p.hour).toBeLessThanOrEqual(12);
        expect(from12hParts(p.hour, p.minute, p.period)).toBe(hhmm);
      }),
      RUNS,
    );
  });
});

describe('Four-stage chapter pipeline', () => {
  const arbChecks = fc.record({ theoryDone: fc.boolean(), referenceBookDone: fc.boolean(), pyqDone: fc.boolean(), revisionDone: fc.boolean() });
  const arbStatus = fc.constantFrom<ChapterStatus>('not_started', 'ongoing', 'practice_pending', 'completed');

  it('the automatic status follows the milestones', () => {
    fc.assert(
      fc.property(arbStatus, arbChecks, (prev, c) => {
        const s = autoChapterStatus(prev, c);
        if (c.theoryDone && c.referenceBookDone && c.pyqDone) expect(s).toBe('completed');
        else if (c.theoryDone) expect(s).toBe('practice_pending');
        else if (c.referenceBookDone || c.pyqDone || c.revisionDone) expect(s).toBe('ongoing');
        else expect(s).toBe(prev === 'completed' || prev === 'practice_pending' ? 'ongoing' : prev);
      }),
      RUNS,
    );
  });

  it('progress weights are 25, 35, 25 and 15, and Completed counts at least 85', () => {
    expect(CHAPTER_MILESTONES.map((m) => m.weight)).toEqual([25, 35, 25, 15]);
    fc.assert(
      fc.property(arbStatus, arbChecks, (status, c) => {
        const p = chapterProgress({ ...c, status });
        const raw = (c.theoryDone ? 25 : 0) + (c.referenceBookDone ? 35 : 0) + (c.pyqDone ? 25 : 0) + (c.revisionDone ? 15 : 0);
        expect(p).toBe(status === 'completed' ? Math.max(85, raw) : raw);
      }),
      RUNS,
    );
    expect(subjectProgress([])).toBe(0);
    expect(subjectProgress([{ status: 'ongoing', theoryDone: true, referenceBookDone: false, pyqDone: false, revisionDone: false }, { status: 'completed', theoryDone: true, referenceBookDone: true, pyqDone: true, revisionDone: true }])).toBe(63);
  });

  it('old chapters map practiceDone to Reference Book and start with PYQs unticked', () => {
    expect(normalizeRecord('chapters', { id: 'c', updatedAt: 1, subjectId: 's', title: 'Optics', practiceDone: true, theoryDone: true })).toMatchObject({ referenceBookDone: true, pyqDone: false, theoryDone: true });
    const c = normalizeRecord('chapters', { id: 'c', updatedAt: 1, subjectId: 's', title: 'Optics', status: 'practice_pending' })!;
    expect(c).toMatchObject({ status: 'practice_pending', referenceBookDone: false });
    expect(c).not.toHaveProperty('practiceDone');
  });

  it('ticking milestones moves the status; a manual status stays until the next tick', async () => {
    const s = await addSubject('Physics', '#F5A35C');
    const c = await addChapter(s.id, 'Optics');
    const get = async () => (await db.chapters.get(c.id))!;
    await updateChapter(c.id, { theoryDone: true });
    expect((await get()).status).toBe('practice_pending');
    expect((await get()).lastStudiedAt).not.toBeNull();
    await updateChapter(c.id, { referenceBookDone: true });
    expect((await get()).status).toBe('practice_pending');
    await updateChapter(c.id, { pyqDone: true });
    expect((await get()).status).toBe('completed');
    await setChapterStatus(c.id, 'ongoing');
    expect((await get()).status).toBe('ongoing');
    await updateChapter(c.id, { title: 'Ray optics' });
    expect((await get()).status).toBe('ongoing');
    await updateChapter(c.id, { pyqDone: false });
    expect((await get()).status).toBe('practice_pending');
  });

  it('general subject practice counts for the subject only', async () => {
    const s = await addSubject('Maths', '#6FA8DC');
    expect(await addSubjectQuestions(s.id, 50)).toBe(50);
    expect(await addSubjectQuestions(s.id, 50)).toBe(100);
    expect(await addSubjectQuestions(s.id, -500)).toBe(0);
    await addSubjectQuestions(s.id, 25);
    const logs = await db.questionLogs.toArray();
    expect(questionsForSubject(logs, s.id)).toBe(25);
    expect(logs.every((l) => l.taskId === null && l.chapterId === null)).toBe(true);
  });
});

describe('Streak threshold', () => {
  it('a day needs the chosen share of the daily goal, never less than 15 minutes', () => {
    expect(streakThresholdMs(300, 80)).toBe(240 * MINUTE);
    expect(streakThresholdMs(240, 75)).toBe(180 * MINUTE);
    expect(streakThresholdMs(240, 80)).toBe(192 * MINUTE);
    expect(streakThresholdMs(240, 100)).toBe(240 * MINUTE);
    expect(streakThresholdMs(240, 10)).toBe(120 * MINUTE);
    expect(streakThresholdMs(10, 80)).toBe(15 * MINUTE);
  });

  it('a 30-minute day no longer counts against a 4-hour goal; rest days still pause', () => {
    const today = '2026-10-29';
    const t = streakThresholdMs(240, 80);
    const totals = new Map([
      [today, 200 * MINUTE],
      [addDays(today, -1), 30 * MINUTE],
      [addDays(today, -2), 250 * MINUTE],
    ]);
    expect(computeStreak(totals, new Set(), today, t)).toBe(1);
    expect(computeStreak(totals, new Set([addDays(today, -1)]), today, t)).toBe(2);
    expect(computeStreak(totals, new Set(), today)).toBe(3);
    expect(computeConsistency(totals, new Set(), today, 30, t)).toBe(7);
  });

  it('lock-in reports what is left, locked, or rest', () => {
    expect(streakLock(23 * MINUTE, 192 * MINUTE, 80, false)).toEqual({ state: 'needed', remainingMs: 169 * MINUTE, thresholdMs: 192 * MINUTE, percent: 80 });
    expect(streakLock(192 * MINUTE, 192 * MINUTE, 80, false)).toEqual({ state: 'locked', percent: 80 });
    expect(streakLock(0, 192 * MINUTE, 80, true)).toEqual({ state: 'rest' });
    expect(normalizeRecord('userSettings', { id: 'app', updatedAt: 1 })!.streakThresholdPercent).toBe(80);
    expect(normalizeRecord('userSettings', { id: 'app', updatedAt: 1, streakThresholdPercent: 20 })!.streakThresholdPercent).toBe(50);
  });
});

describe('Back button order', () => {
  it('closes the most recently opened layer first, and reports when nothing is open', () => {
    const closed: string[] = [];
    const a = pushBackHandler(() => closed.push('dialog'));
    pushBackHandler(() => closed.push('popover'));
    expect(handleBack()).toBe(true);
    expect(handleBack()).toBe(true);
    expect(closed).toEqual(['popover', 'dialog']);
    expect(handleBack()).toBe(false);
    a();
    expect(parseHash('')).toEqual({ view: 'dashboard', section: null });
  });
});
