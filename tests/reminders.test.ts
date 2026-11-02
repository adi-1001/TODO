import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REMINDER_WINDOW_MS, dueReminders } from '../src/lib/reminders';
import { MINUTE, addDays, atTime, dayKey } from '../src/lib/time';
import type { Column } from '../src/types';
import { NOW, makeTask } from './arbitraries';

const TODAY = dayKey(NOW);
const pad = (n: number) => String(n).padStart(2, '0');

const arbTasks = fc
  .array(
    fc.record({
      column: fc.constantFrom<Column>('current', 'pending', 'completed'),
      due: fc.option(fc.integer({ min: -3, max: 3 }), { nil: null }),
      time: fc.option(fc.integer({ min: 0, max: 24 * 60 - 1 }), { nil: null }),
      deleted: fc.boolean(),
    }),
    { maxLength: 20 },
  )
  .map((list) =>
    list.map((t, i) =>
      makeTask({
        id: `t${i}`,
        column: t.column,
        dueDate: t.due === null ? null : addDays(TODAY, t.due),
        reminderTime: t.time === null ? null : `${pad(Math.floor(t.time / 60))}:${pad(t.time % 60)}`,
        deleted: t.deleted && i % 5 === 0,
      }),
    ),
  );

describe('Task reminders', () => {
  it('only open tasks due today, earlier or undated show, after their time and within 12 hours', () => {
    fc.assert(
      fc.property(arbTasks, fc.integer({ min: -12 * 60, max: 11 * 60 }), (tasks, offsetMin) => {
        const now = NOW + offsetMin * MINUTE;
        const today = dayKey(now);
        const due = dueReminders(tasks, now);
        const keys = new Set(due.map((r) => r.key));
        expect(keys.size).toBe(due.length);
        for (const r of due) {
          const t = tasks.find((x) => x.id === r.taskId)!;
          expect(t.deleted).toBeFalsy();
          expect(t.column).not.toBe('completed');
          expect(t.dueDate === null || t.dueDate <= today).toBe(true);
          expect(now).toBeGreaterThanOrEqual(r.at);
          expect(now - r.at).toBeLessThanOrEqual(REMINDER_WINDOW_MS);
          expect(r.key).toBe(`${t.id}:${today}`);
        }
        for (const t of tasks) {
          if (t.deleted || t.column === 'completed' || !t.reminderTime) continue;
          if (t.dueDate !== null && t.dueDate > today) continue;
          const at = atTime(today, t.reminderTime);
          if (now >= at && now - at <= REMINDER_WINDOW_MS) expect(keys.has(`${t.id}:${today}`)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });
});
