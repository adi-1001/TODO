import type { Task } from '../types';
import { addDays } from './time';

/** Tasks that are not finished and were due today or earlier. */
export function unfinishedDue(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => !t.deleted && t.column !== 'completed' && t.dueDate !== null && t.dueDate <= today);
}

export type RescheduleTarget = 'tomorrow' | 'pending';

/** Returns updated copies of the affected tasks. Tasks not affected are not returned. */
export function rescheduleTasks(tasks: Task[], today: string, target: RescheduleTarget): Task[] {
  const tomorrow = addDays(today, 1);
  return unfinishedDue(tasks, today).map((t) =>
    target === 'tomorrow'
      ? { ...t, dueDate: tomorrow }
      : { ...t, column: 'pending' as const, category: 'pending' as const, dueDate: null },
  );
}
