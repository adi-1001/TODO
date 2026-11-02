import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QUICK_REVISION_LABELS, applyQuickRevision, quickRevisionEstimate } from '../src/lib/quickRevision';
import { arbSubtasks, makeTask } from './arbitraries';

const RUNS = { numRuns: 300 };

function idMaker() {
  let n = 0;
  return () => `qr-${++n}`;
}

const arbPendingTask = fc
  .record({ subtasks: arbSubtasks, est: fc.integer({ min: 0, max: 40 }) })
  .map(({ subtasks, est }) => makeTask({ id: 't', category: 'pending', column: 'pending', subtasks, estimatedPomodoros: est }));

describe('Quick Revision transformation', () => {
  it('turning it on gives Summary, Formula Sheet and Past Questions with the reduced estimate', () => {
    fc.assert(
      fc.property(arbPendingTask, (task) => {
        const on = applyQuickRevision(task, true, idMaker());
        expect(on.quickRevision).toBe(true);
        expect(on.subtasks.map((s) => s.label)).toEqual([...QUICK_REVISION_LABELS]);
        expect(on.subtasks.every((s) => !s.done)).toBe(true);
        expect(new Set(on.subtasks.map((s) => s.id)).size).toBe(3);
        expect(on.estimatedPomodoros).toBe(Math.max(1, Math.ceil(task.estimatedPomodoros * 0.4)));
        expect(on.estimatedPomodoros).toBeLessThanOrEqual(Math.max(1, task.estimatedPomodoros));
        expect(on.estimatedPomodoros).toBeGreaterThanOrEqual(1);
        expect(on.savedSubtasks).toEqual(task.subtasks);
        expect(on.savedEstimate).toBe(task.estimatedPomodoros);
      }),
      RUNS,
    );
  });

  it('turning it off restores the original checklist and estimate exactly', () => {
    fc.assert(
      fc.property(arbPendingTask, fc.array(fc.nat({ max: 2 }), { maxLength: 3 }), (task, ticks) => {
        let on = applyQuickRevision(task, true, idMaker());
        // Ticking items in Quick Revision mode must not leak into the restored checklist.
        for (const i of ticks) on = { ...on, subtasks: on.subtasks.map((s, j) => (j === i ? { ...s, done: !s.done } : s)) };
        const off = applyQuickRevision(on, false, idMaker());
        expect(off.quickRevision).toBe(false);
        expect(off.subtasks).toEqual(task.subtasks);
        expect(off.estimatedPomodoros).toBe(task.estimatedPomodoros);
        expect(off.savedSubtasks).toBeNull();
        expect(off.savedEstimate).toBeNull();
      }),
      RUNS,
    );
  });

  it('repeated toggles to the same value change nothing', () => {
    fc.assert(
      fc.property(arbPendingTask, (task) => {
        const on = applyQuickRevision(task, true, idMaker());
        expect(applyQuickRevision(on, true, idMaker())).toBe(on);
        expect(applyQuickRevision(task, false, idMaker())).toBe(task);
      }),
      RUNS,
    );
  });

  it('many on/off cycles always land back on the original task', () => {
    fc.assert(
      fc.property(arbPendingTask, fc.integer({ min: 1, max: 6 }), (task, cycles) => {
        let t = task;
        for (let i = 0; i < cycles; i++) t = applyQuickRevision(applyQuickRevision(t, true, idMaker()), false, idMaker());
        expect(t.subtasks).toEqual(task.subtasks);
        expect(t.estimatedPomodoros).toBe(task.estimatedPomodoros);
      }),
      RUNS,
    );
  });

  it('Current Topics are never transformed', () => {
    fc.assert(
      fc.property(arbSubtasks, fc.integer({ min: 0, max: 40 }), (subtasks, est) => {
        const task = makeTask({ id: 'c', category: 'current', column: 'current', subtasks, estimatedPomodoros: est });
        expect(applyQuickRevision(task, true, idMaker())).toBe(task);
      }),
      RUNS,
    );
  });

  it('the estimate shrinks to about 40 percent, never below one Pomodoro', () => {
    expect(quickRevisionEstimate(0)).toBe(1);
    expect(quickRevisionEstimate(1)).toBe(1);
    expect(quickRevisionEstimate(3)).toBe(2);
    expect(quickRevisionEstimate(8)).toBe(4);
    expect(quickRevisionEstimate(10)).toBe(4);
  });
});
