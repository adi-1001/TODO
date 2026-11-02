import type { Subtask, Task } from '../types';

export const QUICK_REVISION_LABELS = ['Summary', 'Formula Sheet', 'Past Questions'] as const;

/** A Quick Revision pass takes about 40 % of the full plan, never less than one Pomodoro. */
export function quickRevisionEstimate(original: number): number {
  const n = Math.max(0, Math.floor(original));
  return Math.max(1, Math.ceil(n * 0.4));
}

export type QuickRevisionFields = Pick<Task, 'quickRevision' | 'subtasks' | 'estimatedPomodoros' | 'savedSubtasks' | 'savedEstimate'>;

/**
 * Turns Quick Revision on or off for a Pending Topic. Turning it on stores the original
 * checklist and estimate so turning it off restores them exactly. Current Topics are
 * returned unchanged, and repeated calls with the same value change nothing.
 */
export function applyQuickRevision(task: Task, on: boolean, makeId: () => string): Task {
  if (task.category !== 'pending') return task;
  if (on === task.quickRevision) return task;
  if (on) {
    const subtasks: Subtask[] = QUICK_REVISION_LABELS.map((label) => ({ id: makeId(), label, done: false }));
    return {
      ...task,
      quickRevision: true,
      savedSubtasks: task.subtasks.map((s) => ({ ...s })),
      savedEstimate: task.estimatedPomodoros,
      subtasks,
      estimatedPomodoros: quickRevisionEstimate(task.estimatedPomodoros),
    };
  }
  return {
    ...task,
    quickRevision: false,
    subtasks: (task.savedSubtasks ?? []).map((s) => ({ ...s })),
    estimatedPomodoros: task.savedEstimate ?? task.estimatedPomodoros,
    savedSubtasks: null,
    savedEstimate: null,
  };
}
