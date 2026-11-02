import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rescheduleTasks, unfinishedDue } from '../src/lib/review';
import { addDays, dayKey } from '../src/lib/time';
import type { Column } from '../src/types';
import { NOW, makeTask } from './arbitraries';

const TODAY = dayKey(NOW);

const arbTasks = fc
  .array(
    fc.record({
      column: fc.constantFrom<Column>('current', 'pending', 'completed'),
      due: fc.option(fc.integer({ min: -10, max: 10 }), { nil: null }),
      deleted: fc.boolean(),
    }),
    { maxLength: 25 },
  )
  .map((list) =>
    list.map((t, i) =>
      makeTask({
        id: `t${i}`,
        column: t.column,
        category: t.column === 'pending' ? 'pending' : 'current',
        dueDate: t.due === null ? null : addDays(TODAY, t.due),
        deleted: t.deleted && i % 4 === 0,
      }),
    ),
  );

function applyUpdates<T extends { id: string }>(all: T[], updates: T[]): T[] {
  const m = new Map(updates.map((u) => [u.id, u]));
  return all.map((t) => m.get(t.id) ?? t);
}

describe('Evening Review rescheduling', () => {
  it('Move to Tomorrow touches only unfinished tasks due today or earlier', () => {
    fc.assert(
      fc.property(arbTasks, (tasks) => {
        const updated = rescheduleTasks(tasks, TODAY, 'tomorrow');
        expect(updated.map((t) => t.id)).toEqual(unfinishedDue(tasks, TODAY).map((t) => t.id));
        for (const t of updated) expect(t.dueDate).toBe(addDays(TODAY, 1));
        expect(unfinishedDue(applyUpdates(tasks, updated), TODAY)).toHaveLength(0);
      }),
      { numRuns: 300 },
    );
  });

  it('Move to Pending Topics clears the date and keeps column and category together', () => {
    fc.assert(
      fc.property(arbTasks, (tasks) => {
        const updated = rescheduleTasks(tasks, TODAY, 'pending');
        for (const t of updated) {
          expect(t.column).toBe('pending');
          expect(t.category).toBe('pending');
          expect(t.dueDate).toBeNull();
        }
        expect(unfinishedDue(applyUpdates(tasks, updated), TODAY)).toHaveLength(0);
      }),
      { numRuns: 300 },
    );
  });
});
