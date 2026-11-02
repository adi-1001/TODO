import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ACTIVE_THRESHOLD_MS, computeConsistency, computeStreak, longestStreak } from '../src/lib/streak';
import { HOUR, MINUTE, addDays, dayKey } from '../src/lib/time';
import { NOW } from './arbitraries';

const RUNS = { numRuns: 300 };
const TODAY = dayKey(NOW);
const ACTIVE = 2 * HOUR;
const WINDOW = 70;

/** Focus per day for the last 70 days, from 0 to 4 hours, with plenty of near-threshold values. */
const arbHistory = fc
  .array(
    fc.oneof(
      fc.constant(0),
      fc.integer({ min: 0, max: 30 * MINUTE }),
      fc.integer({ min: 0, max: 4 * HOUR }),
      fc.constant(ACTIVE_THRESHOLD_MS),
      fc.constant(ACTIVE_THRESHOLD_MS - 1),
    ),
    { minLength: WINDOW, maxLength: WINDOW },
  )
  .map((list) => new Map(list.map((ms, i) => [addDays(TODAY, -i), ms] as const)));

const arbRest = fc.uniqueArray(fc.integer({ min: 0, max: WINDOW - 1 }), { maxLength: 20 }).map((offsets) => new Set(offsets.map((o) => addDays(TODAY, -o))));

const arbDay = fc.integer({ min: 0, max: WINDOW + 5 }).map((o) => addDays(TODAY, -o));

describe('Streak and rest-day pause', () => {
  it('marking any day as a rest day never lowers the streak or the 30-day consistency', () => {
    fc.assert(
      fc.property(arbHistory, arbRest, arbDay, (history, rest, extra) => {
        const before = { s: computeStreak(history, rest, TODAY), c: computeConsistency(history, rest, TODAY) };
        const withRest = new Set(rest).add(extra);
        expect(computeStreak(history, withRest, TODAY)).toBeGreaterThanOrEqual(before.s);
        expect(computeConsistency(history, withRest, TODAY)).toBeGreaterThanOrEqual(before.c);
      }),
      RUNS,
    );
  });

  it('turning a rest day on and then off gives back exactly the original numbers', () => {
    fc.assert(
      fc.property(arbHistory, arbRest, arbDay, (history, rest, day) => {
        const s0 = computeStreak(history, rest, TODAY);
        const c0 = computeConsistency(history, rest, TODAY);
        const on = new Set(rest).add(day);
        computeStreak(history, on, TODAY);
        const off = new Set(on);
        if (!rest.has(day)) off.delete(day);
        expect(computeStreak(history, off, TODAY)).toBe(s0);
        expect(computeConsistency(history, off, TODAY)).toBe(c0);
      }),
      RUNS,
    );
  });

  it('a rest day between two active runs joins them instead of resetting', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 25 }), fc.integer({ min: 1, max: 25 }), (a, b) => {
        const history = new Map<string, number>();
        for (let i = 0; i < a; i++) history.set(addDays(TODAY, -i), ACTIVE);
        for (let i = a + 1; i <= a + b; i++) history.set(addDays(TODAY, -i), ACTIVE);
        const gap = addDays(TODAY, -a);
        expect(computeStreak(history, new Set(), TODAY)).toBe(a);
        expect(computeStreak(history, new Set([gap]), TODAY)).toBe(a + b);
      }),
      RUNS,
    );
  });

  it('a rest day on a day that already has focus changes nothing', () => {
    fc.assert(
      fc.property(arbHistory, arbRest, arbDay, (history, rest, day) => {
        fc.pre((history.get(day) ?? 0) >= ACTIVE_THRESHOLD_MS);
        const withRest = new Set(rest).add(day);
        expect(computeStreak(history, withRest, TODAY)).toBe(computeStreak(history, rest, TODAY));
        expect(computeConsistency(history, withRest, TODAY)).toBe(computeConsistency(history, rest, TODAY));
      }),
      RUNS,
    );
  });

  it('a day that has not started yet does not break the streak', () => {
    fc.assert(
      fc.property(arbHistory, arbRest, (history, rest) => {
        // An empty today counts the same as if today were a rest day: the run ending yesterday is kept.
        const h = new Map(history).set(TODAY, 0);
        const r = new Set(rest);
        r.delete(TODAY);
        expect(computeStreak(h, r, TODAY)).toBe(computeStreak(h, new Set(r).add(TODAY), TODAY));
        const yesterdayActive = (h.get(addDays(TODAY, -1)) ?? 0) >= ACTIVE_THRESHOLD_MS;
        if (yesterdayActive) expect(computeStreak(h, r, TODAY)).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });

  it('the streak never exceeds the number of active days, and never exceeds the longest streak', () => {
    fc.assert(
      fc.property(arbHistory, arbRest, (history, rest) => {
        const active = [...history.values()].filter((ms) => ms >= ACTIVE_THRESHOLD_MS).length;
        const s = computeStreak(history, rest, TODAY);
        expect(s).toBeLessThanOrEqual(active);
        expect(longestStreak(history, rest, addDays(TODAY, -(WINDOW - 1)), TODAY)).toBeGreaterThanOrEqual(s);
      }),
      RUNS,
    );
  });

  it('consistency is a whole percentage between 0 and 100', () => {
    fc.assert(
      fc.property(arbHistory, arbRest, (history, rest) => {
        const c = computeConsistency(history, rest, TODAY);
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(100);
      }),
      RUNS,
    );
  });

  it('a full window of rest days gives 0 instead of dividing by zero', () => {
    const rest = new Set(Array.from({ length: 30 }, (_, i) => addDays(TODAY, -i)));
    expect(computeConsistency(new Map(), rest, TODAY)).toBe(0);
  });

  it('consistency counts only the last 30 days', () => {
    const history = new Map<string, number>();
    for (let i = 0; i < 15; i++) history.set(addDays(TODAY, -i), ACTIVE);
    for (let i = 30; i < 60; i++) history.set(addDays(TODAY, -i), ACTIVE);
    expect(computeConsistency(history, new Set(), TODAY)).toBe(50);
    const rest = new Set(Array.from({ length: 5 }, (_, i) => addDays(TODAY, -(20 + i))));
    expect(computeConsistency(history, rest, TODAY)).toBe(60);
  });
});
