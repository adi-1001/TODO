import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { nextDueAfter, nextOccurrence } from '../src/lib/repeat';
import { addDays, dayKey, dayStart, daysBetween } from '../src/lib/time';
import type { RepeatKind, RepeatRule } from '../src/types';
import { NOW } from './arbitraries';

const TODAY = dayKey(NOW);
const RUNS = { numRuns: 400 };

const arbRule: fc.Arbitrary<RepeatRule> = fc.record({
  kind: fc.constantFrom<RepeatKind>('daily', 'weekdays', 'weekly', 'interval'),
  intervalDays: fc.integer({ min: 1, max: 60 }),
});
const arbDay = fc.integer({ min: -400, max: 400 }).map((o) => addDays(TODAY, o));
const weekday = (k: string) => new Date(dayStart(k)).getDay();

describe('Repeat rules', () => {
  it('the next due date is after the base, never before today, and matches the rule', () => {
    fc.assert(
      fc.property(arbRule, arbDay, arbDay, (rule, base, today) => {
        const next = nextDueAfter(rule, base, today)!;
        expect(next > base).toBe(true);
        expect(next >= today).toBe(true);
        const gap = daysBetween(base, next);
        if (rule.kind === 'daily') expect(gap).toBe(Math.max(1, daysBetween(base, today)));
        if (rule.kind === 'weekly') expect(gap % 7).toBe(0);
        if (rule.kind === 'interval') expect(gap % rule.intervalDays).toBe(0);
        if (rule.kind === 'weekdays') expect([0, 6]).not.toContain(weekday(next));
      }),
      RUNS,
    );
  });

  it('completing on time gives the very next occurrence', () => {
    fc.assert(
      fc.property(arbRule, (rule) => {
        expect(nextDueAfter(rule, TODAY, TODAY)).toBe(nextOccurrence(rule, TODAY));
      }),
      RUNS,
    );
  });

  it('a late completion skips past occurrences instead of creating a task in the past', () => {
    const next = nextDueAfter({ kind: 'daily', intervalDays: 1 }, addDays(TODAY, -5), TODAY);
    expect(next).toBe(TODAY);
  });

  it('weekdays skip the weekend', () => {
    fc.assert(
      fc.property(arbDay, (from) => {
        const next = nextOccurrence({ kind: 'weekdays', intervalDays: 1 }, from)!;
        const gap = daysBetween(from, next);
        expect(gap).toBeGreaterThanOrEqual(1);
        expect(gap).toBeLessThanOrEqual(3);
        expect([0, 6]).not.toContain(weekday(next));
      }),
      RUNS,
    );
  });

  it('never repeating gives no next date', () => {
    expect(nextDueAfter({ kind: 'never', intervalDays: 2 }, TODAY, TODAY)).toBeNull();
  });
});
