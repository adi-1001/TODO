import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  categorySplit,
  countedSessions,
  dayGridSegments,
  failedSessions,
  focusMsByChapter,
  focusMsByTask,
  dailySubjectStacks,
  dailyTotals,
  focusByDay,
  focusMsInRange,
  largestRemainderPercent,
  monthGoalStats,
  periodFor,
  sessionMs,
  shiftPeriod,
  subjectBreakdown,
  summaryMetrics,
  totalFocusMs,
  type PeriodMode,
} from '../src/lib/stats';
import { DAY, HOUR, addDays, dayEnd, dayKey, dayStart, lastNDays } from '../src/lib/time';
import { NOW, SUBJECTS, arbCompletedTasks, arbSessions, makeTask } from './arbitraries';

const RUNS = { numRuns: 200 };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const arbRange = fc
  .tuple(fc.integer({ min: 0, max: 70 * DAY }), fc.integer({ min: 0, max: 70 * DAY }))
  .map(([a, b]) => ({ from: NOW + 2 * DAY - Math.max(a, b), to: NOW + 2 * DAY - Math.min(a, b) }));

describe('Report aggregation: subject bars and donut', () => {
  it('subject totals always add up to the range total', () => {
    fc.assert(
      fc.property(arbSessions, arbRange, (sessions, { from, to }) => {
        const rows = subjectBreakdown(sessions, SUBJECTS, from, to);
        expect(sum(rows.map((r) => r.ms))).toBe(focusMsInRange(sessions, from, to));
      }),
      RUNS,
    );
  });

  it('displayed percentages sum to exactly 100 when there is any focus', () => {
    fc.assert(
      fc.property(arbSessions, arbRange, (sessions, { from, to }) => {
        const rows = subjectBreakdown(sessions, SUBJECTS, from, to);
        const total = focusMsInRange(sessions, from, to);
        for (const r of rows) {
          expect(r.pct).toBeGreaterThanOrEqual(0);
          expect(r.pct).toBeLessThanOrEqual(100);
          expect(Number.isInteger(r.pct)).toBe(true);
          expect(r.ms).toBeGreaterThan(0);
        }
        if (total > 0) expect(sum(rows.map((r) => r.pct))).toBe(100);
        else expect(rows).toHaveLength(0);
      }),
      RUNS,
    );
  });

  it('each subject appears once and rows are ordered by time', () => {
    fc.assert(
      fc.property(arbSessions, arbRange, (sessions, { from, to }) => {
        const rows = subjectBreakdown(sessions, SUBJECTS, from, to);
        expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
        for (let i = 1; i < rows.length; i++) expect(rows[i - 1].ms).toBeGreaterThanOrEqual(rows[i].ms);
      }),
      RUNS,
    );
  });

  it('largest-remainder percentages sum to 100 and stay within 1 of the exact share', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 10_000_000 }), { maxLength: 12 }), (values) => {
        const pcts = largestRemainderPercent(values);
        const total = sum(values);
        expect(pcts).toHaveLength(values.length);
        if (total === 0) {
          expect(pcts.every((p) => p === 0)).toBe(true);
          return;
        }
        expect(sum(pcts)).toBe(100);
        values.forEach((v, i) => expect(Math.abs(pcts[i] - (v * 100) / total)).toBeLessThan(1));
      }),
      RUNS,
    );
  });

  it('the Current vs. Pending split adds up to the range total', () => {
    fc.assert(
      fc.property(arbSessions, arbRange, (sessions, { from, to }) => {
        const s = categorySplit(sessions, from, to);
        expect(s.current + s.pending + s.other).toBe(focusMsInRange(sessions, from, to));
        const pcts = largestRemainderPercent([s.current, s.pending, s.other]);
        if (s.current + s.pending + s.other > 0) expect(sum(pcts)).toBe(100);
      }),
      RUNS,
    );
  });
});

describe('Report aggregation: six summary metrics', () => {
  it('today <= this week <= total, for focus time and for completed tasks', () => {
    fc.assert(
      fc.property(arbSessions, arbCompletedTasks, (sessions, tasks) => {
        const m = summaryMetrics(sessions, tasks, NOW);
        expect(m.todayMs).toBeLessThanOrEqual(m.weekMs);
        expect(m.weekMs).toBeLessThanOrEqual(m.totalMs);
        expect(m.todayCompleted).toBeLessThanOrEqual(m.weekCompleted);
        expect(m.weekCompleted).toBeLessThanOrEqual(m.totalCompleted);
      }),
      RUNS,
    );
  });

  it('total focus equals the sum of counted sessions: deleted and Strict Mode failures are ignored', () => {
    fc.assert(
      fc.property(arbSessions, (sessions) => {
        const expected = sum(sessions.filter((s) => !s.deleted && s.status === 'completed').map(sessionMs));
        expect(summaryMetrics(sessions, [], NOW).totalMs).toBe(expected);
        expect(totalFocusMs(sessions)).toBe(expected);
      }),
      RUNS,
    );
  });

  it('today and week totals match the matching ranges and the subject bars for those ranges', () => {
    fc.assert(
      fc.property(arbSessions, (sessions) => {
        const today = dayKey(NOW);
        const m = summaryMetrics(sessions, [], NOW);
        const todayRows = subjectBreakdown(sessions, SUBJECTS, dayStart(today), dayEnd(today));
        expect(sum(todayRows.map((r) => r.ms))).toBe(m.todayMs);
        const week = periodFor('weekly', today);
        expect(focusMsInRange(sessions, week.from, week.to)).toBe(m.weekMs);
      }),
      RUNS,
    );
  });

  it('completed counts match the live completed tasks', () => {
    fc.assert(
      fc.property(arbCompletedTasks, (tasks) => {
        const live = tasks.filter((t) => !t.deleted && t.column === 'completed');
        const today = dayKey(NOW);
        const m = summaryMetrics([], tasks, NOW);
        expect(m.totalCompleted).toBe(live.length);
        expect(m.todayCompleted).toBe(live.filter((t) => dayKey(t.completedAt!) === today).length);
      }),
      RUNS,
    );
  });
});

describe('Strict Mode failures', () => {
  it('a failed session never changes any total, bar, split, day total or per-chapter time', () => {
    fc.assert(
      fc.property(arbSessions, arbRange, (sessions, { from, to }) => {
        const counted = countedSessions(sessions);
        const today = dayKey(NOW);
        expect(focusMsInRange(sessions, from, to)).toBe(focusMsInRange(counted, from, to));
        expect(subjectBreakdown(sessions, SUBJECTS, from, to)).toEqual(subjectBreakdown(counted, SUBJECTS, from, to));
        expect(categorySplit(sessions, from, to)).toEqual(categorySplit(counted, from, to));
        expect([...focusByDay(sessions)]).toEqual([...focusByDay(counted)]);
        expect(summaryMetrics(sessions, [], NOW)).toEqual(summaryMetrics(counted, [], NOW));
        expect([...focusMsByChapter(sessions, [])]).toEqual([...focusMsByChapter(counted, [])]);
        expect([...focusMsByTask(sessions)]).toEqual([...focusMsByTask(counted)]);
        const grid = dayGridSegments(sessions, [today]).get(today)!;
        expect(grid.every((p) => p.status === 'completed')).toBe(true);
      }),
      RUNS,
    );
  });

  it('the records grid shows failed runs only when asked, and every piece keeps its status', () => {
    fc.assert(
      fc.property(arbSessions, (sessions) => {
        const days = lastNDays(dayKey(NOW), 14);
        const withFailed = dayGridSegments(sessions, days, { includeFailed: true });
        const counted = dayGridSegments(sessions, days);
        let failedPieces = 0;
        for (const d of days) {
          const all = withFailed.get(d)!;
          failedPieces += all.filter((p) => p.status === 'failed_strict').length;
          expect(all.filter((p) => p.status === 'completed')).toEqual(counted.get(d));
        }
        const expectedFailed = failedSessions(sessions).some((s) => s.segments.some((seg) => seg.end > seg.start));
        if (failedPieces > 0) expect(expectedFailed).toBe(true);
      }),
      RUNS,
    );
  });

  it('chapter time comes from the session chapter, else from its task chapter', () => {
    fc.assert(
      fc.property(arbSessions, (sessions) => {
        const tasks = [makeTask({ id: 't1', chapterId: 'c9' })];
        const byChapter = focusMsByChapter(sessions, tasks);
        const expected = new Map<string, number>();
        for (const s of countedSessions(sessions)) {
          const k = s.chapterId ?? (s.taskId === 't1' ? 'c9' : null);
          if (k) expected.set(k, (expected.get(k) ?? 0) + sessionMs(s));
        }
        expect(new Map(byChapter)).toEqual(expected);
      }),
      RUNS,
    );
  });
});

describe('Report aggregation: daily charts', () => {
  it('each stacked bar equals that day total, and day totals add up to the range', () => {
    fc.assert(
      fc.property(arbSessions, fc.integer({ min: 1, max: 45 }), (sessions, n) => {
        const days = lastNDays(dayKey(NOW + DAY), n);
        const totals = dailyTotals(sessions, days);
        const stacks = dailySubjectStacks(sessions, days);
        stacks.forEach((s, i) => {
          expect(s.day).toBe(totals[i].day);
          expect(sum(s.parts.map((p) => p.ms))).toBe(s.total);
          expect(s.total).toBe(totals[i].ms);
        });
        const rangeTotal = focusMsInRange(sessions, dayStart(days[0]), dayEnd(days[days.length - 1]));
        expect(sum(totals.map((t) => t.ms))).toBe(rangeTotal);
      }),
      RUNS,
    );
  });

  it('focus split by day loses nothing across midnight', () => {
    fc.assert(
      fc.property(arbSessions, (sessions) => {
        const byDay = focusByDay(sessions);
        expect(sum([...byDay.values()])).toBe(totalFocusMs(sessions));
      }),
      RUNS,
    );
  });

  it('month goal stats stay consistent', () => {
    fc.assert(
      fc.property(arbSessions, fc.integer({ min: 15, max: 600 }), fc.integer({ min: -2, max: 2 }), (sessions, goalMin, monthShift) => {
        const today = dayKey(NOW);
        const anchor = shiftPeriod('monthly', today, monthShift >= 0 ? 1 : -1);
        const month = monthShift === 0 ? today : anchor;
        const stats = monthGoalStats(focusByDay(sessions), month, goalMin * 60_000, today);
        expect(stats.completedGoalDays).toBeLessThanOrEqual(stats.focusDays);
        expect(stats.focusDays).toBeLessThanOrEqual(stats.days.length);
        expect(stats.completionRate).toBeGreaterThanOrEqual(0);
        expect(stats.completionRate).toBeLessThanOrEqual(100);
        for (const d of stats.days) {
          expect(d.ratio).toBeGreaterThanOrEqual(0);
          expect(d.ratio).toBeLessThanOrEqual(1);
          expect(d.goalMet).toBe(d.ms >= goalMin * 60_000);
        }
      }),
      RUNS,
    );
  });

  it('periods tile time without gaps or overlap', () => {
    fc.assert(
      fc.property(fc.constantFrom<PeriodMode>('daily', 'weekly', 'monthly'), fc.integer({ min: -400, max: 400 }), (mode, offset) => {
        const anchor = addDays(dayKey(NOW), offset);
        const p = periodFor(mode, anchor);
        const next = periodFor(mode, shiftPeriod(mode, p.anchor, 1));
        const back = periodFor(mode, shiftPeriod(mode, next.anchor, -1));
        expect(next.from).toBe(p.to);
        expect(back.anchor).toBe(p.anchor);
        expect(p.days).toContain(dayKey(p.from));
        expect(p.to - p.from).toBeGreaterThanOrEqual(23 * HOUR);
      }),
      RUNS,
    );
  });
});
