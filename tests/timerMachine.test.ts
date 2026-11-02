import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addFive,
  bellCrossings,
  breakKindFor,
  displayMs,
  elapsedMs,
  finish,
  initialTimer,
  isTimerState,
  pause,
  phaseProgress,
  remainingMs,
  resume,
  setSelection,
  start,
  startBreak,
  tick,
  type TimerState,
} from '../src/timer/timerMachine';
import { MINUTE } from '../src/lib/time';
import type { TimerSelection } from '../src/types';

const RUNS = { numRuns: 300 };
const T0 = 1_800_000_000_000;
const total = (segs: { start: number; end: number }[]) => segs.reduce((a, s) => a + (s.end - s.start), 0);

const arbSelection: fc.Arbitrary<TimerSelection> = fc.oneof(
  fc.integer({ min: 1, max: 120 }).map((minutes) => ({ mode: 'pomodoro' as const, minutes })),
  fc.constant({ mode: 'quickstart' as const, minutes: 3 }),
  fc.constant({ mode: 'stopwatch' as const, minutes: 0 }),
);

describe('Timer state machine', () => {
  it('Quick Start rolls into the default Pomodoro length in the same run', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 90 }), fc.integer({ min: 0, max: 5 * MINUTE }), (continueMinutes, late) => {
        let s = start(initialTimer(), { mode: 'quickstart', minutes: 3 }, 'task-1', T0, continueMinutes);
        expect(remainingMs(s, T0)).toBe(3 * MINUTE);
        const r = tick(s, T0 + 3 * MINUTE + Math.min(late, continueMinutes * MINUTE - 1));
        expect(r.event).toBe('quick-start-continued');
        expect(r.at).toBe(T0 + 3 * MINUTE);
        s = r.state;
        expect(s.status).toBe('running');
        expect(s.segments).toHaveLength(0);
        expect(remainingMs(s, T0 + 3 * MINUTE)).toBe(continueMinutes * MINUTE);

        const done = tick(s, T0 + (3 + continueMinutes) * MINUTE);
        expect(done.event).toBe('finished');
        expect(done.completed?.mode).toBe('quickstart');
        expect(done.completed?.segments).toEqual([{ start: T0, end: T0 + (3 + continueMinutes) * MINUTE }]);
        expect(done.state.cycle).toBe(1);
      }),
      RUNS,
    );
  });

  it('a late tick logs exactly the planned time and reports the exact finish moment', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 120 }), fc.integer({ min: 0, max: 600 * MINUTE }), (minutes, lateBy) => {
        const s = start(initialTimer(), { mode: 'pomodoro', minutes }, null, T0);
        const r = tick(s, T0 + minutes * MINUTE + lateBy);
        expect(r.event).toBe('finished');
        expect(r.at).toBe(T0 + minutes * MINUTE);
        expect(total(r.completed!.segments)).toBe(minutes * MINUTE);
      }),
      RUNS,
    );
  });

  it('the stopwatch counts up and never finishes on its own', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 600 * MINUTE }), { maxLength: 10 }), (gaps) => {
        let s: TimerState = start(initialTimer(), { mode: 'stopwatch', minutes: 0 }, 'x', T0);
        let now = T0;
        for (const g of gaps) {
          now += g;
          const r = tick(s, now);
          expect(r.event).toBe('none');
          s = r.state;
          expect(displayMs(s, now)).toBe(now - T0);
          expect(addFive(s)).toBe(s);
        }
        const { completed } = finish(s, now);
        expect(completed?.mode).toBe('stopwatch');
        expect(total(completed!.segments)).toBe(now - T0);
      }),
      RUNS,
    );
  });

  it('elapsed time equals wall time minus pauses, for every mode', () => {
    const arbSteps = fc.array(fc.record({ action: fc.constantFrom('pause', 'resume', 'five', 'tick'), gap: fc.integer({ min: 0, max: 20 * MINUTE }) }), { maxLength: 25 });
    fc.assert(
      fc.property(arbSelection, arbSteps, (sel, steps) => {
        let s: TimerState = start(initialTimer(), sel, null, T0, 25);
        let now = T0;
        let pausedMs = 0;
        let pausedAt: number | null = null;
        for (const step of steps) {
          now += step.gap;
          if (s.status === 'idle' || s.phase === 'break') break;
          if (step.action === 'pause' && s.status === 'running') {
            s = pause(s, now);
            pausedAt = now;
          } else if (step.action === 'resume' && s.status === 'paused') {
            pausedMs += now - (pausedAt ?? now);
            pausedAt = null;
            s = resume(s, now);
          } else if (step.action === 'five') {
            const before = remainingMs(s, now);
            s = addFive(s);
            if (sel.mode !== 'stopwatch' && before > 0) expect(remainingMs(s, now)).toBe(before + 5 * MINUTE);
          } else {
            s = tick(s, now).state;
          }
          if (s.status !== 'idle') {
            const openPause = pausedAt !== null ? now - pausedAt : 0;
            expect(elapsedMs(s, now)).toBe(now - T0 - pausedMs - openPause);
            const p = phaseProgress(s, now);
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
            for (const seg of s.segments) expect(seg.end).toBeGreaterThan(seg.start);
          }
        }
      }),
      RUNS,
    );
  });

  it('a break starts at the exact finish moment, ends on its own and resets the cycle when long', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 8 }), fc.integer({ min: 0, max: 7 }), (minutes, breakMin, every, priorCycles) => {
        const base = { ...initialTimer(), cycle: priorCycles };
        const s = start(base, { mode: 'pomodoro', minutes }, 't', T0);
        const done = tick(s, T0 + minutes * MINUTE + 1234);
        const at = done.at!;
        const kind = breakKindFor(done.state.cycle, every);
        expect(kind).toBe(done.state.cycle % every === 0 ? 'long' : 'short');
        const b = startBreak(done.state, kind, breakMin * MINUTE, at);
        expect(b.phase).toBe('break');
        expect(b.runningSince).toBe(at);
        expect(b.cycle).toBe(kind === 'long' ? 0 : priorCycles + 1);
        const end = tick(b, at + breakMin * MINUTE + 50);
        expect(end.event).toBe('break-finished');
        expect(end.completed?.phase).toBe('break');
        expect(total(end.completed!.segments)).toBe(breakMin * MINUTE);
        expect(end.state.status).toBe('idle');
        expect(end.state.phase).toBe('focus');
        expect(end.state.mode).toBe('pomodoro');
        expect(end.state.minutes).toBe(minutes);
      }),
      RUNS,
    );
  });

  it('two tabs that tick at different moments compute identical records', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 0, max: 90_000 }), fc.integer({ min: 0, max: 90_000 }), (minutes, lagA, lagB) => {
        const s = start(initialTimer(), { mode: 'pomodoro', minutes }, null, T0);
        const a = tick(s, T0 + minutes * MINUTE + lagA);
        const b = tick(s, T0 + minutes * MINUTE + lagB);
        expect(a.completed).toEqual(b.completed);
        expect(startBreak(a.state, 'short', 5 * MINUTE, a.at!)).toEqual(startBreak(b.state, 'short', 5 * MINUTE, b.at!));
      }),
      RUNS,
    );
  });

  it('Complete and Skip log what ran so far; selection only changes while idle', () => {
    let s = start(initialTimer(), { mode: 'pomodoro', minutes: 25 }, 'x', T0);
    expect(setSelection(s, { mode: 'stopwatch', minutes: 0 })).toBe(s);
    s = pause(s, T0 + 5 * MINUTE);
    s = resume(s, T0 + 7 * MINUTE);
    const { state, completed } = finish(s, T0 + 10 * MINUTE);
    expect(state.status).toBe('idle');
    expect(completed?.segments).toEqual([
      { start: T0, end: T0 + 5 * MINUTE },
      { start: T0 + 7 * MINUTE, end: T0 + 10 * MINUTE },
    ]);
    expect(finish(initialTimer(), T0).completed).toBeNull();
    expect(setSelection(initialTimer(), { mode: 'stopwatch', minutes: 0 }).mode).toBe('stopwatch');
  });

  it('only accepts stored states that have the version 2 shape', () => {
    expect(isTimerState(initialTimer())).toBe(true);
    expect(isTimerState({ status: 'idle', preset: 25, segments: [], targetMs: 1, phaseMs: 1 })).toBe(false);
  });

  it('the bell rings once for every interval crossed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200 * MINUTE }), fc.integer({ min: 0, max: 60 * MINUTE }), fc.integer({ min: 1, max: 30 }), (prev, delta, mins) => {
        const interval = mins * MINUTE;
        const next = prev + delta;
        let expected = 0;
        for (let k = Math.floor(prev / interval) + 1; k * interval <= next; k++) expected++;
        expect(bellCrossings(prev, next, interval)).toBe(expected);
      }),
      RUNS,
    );
    expect(bellCrossings(0, 10 * MINUTE, 0)).toBe(0);
  });
});
