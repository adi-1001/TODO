import fc from 'fast-check';
import type { Category, FocusSession, Segment, SessionMode, SessionStatus, Subject, Subtask, Task } from '../src/types';
import { DAY, MINUTE } from '../src/lib/time';
import { NO_FILTERS, NO_REPEAT } from '../src/db/defaults';

/** A fixed local noon so results do not depend on when the tests run. */
export const NOW = new Date(2026, 9, 26, 12, 0, 0).getTime();

export const SUBJECTS: Subject[] = [
  { id: 's1', updatedAt: 1, name: 'Physics', color: '#F5A35C', order: 0 },
  { id: 's2', updatedAt: 1, name: 'Mathematics', color: '#6FA8DC', order: 1 },
  { id: 's3', updatedAt: 1, name: 'Chemistry', color: '#E79AA6', order: 2 },
];

export const arbSegment: fc.Arbitrary<Segment> = fc
  .record({ back: fc.integer({ min: 0, max: 60 * DAY }), minutes: fc.integer({ min: 0, max: 180 }), seconds: fc.integer({ min: 0, max: 59 }) })
  .map(({ back, minutes, seconds }) => {
    const start = NOW - back;
    return { start, end: start + minutes * MINUTE + seconds * 1000 };
  });

const arbSessionBody = fc.record({
  subjectId: fc.constantFrom<string | null>(null, 's1', 's2', 's3', 'archived'),
  chapterId: fc.constantFrom<string | null>(null, 'c1', 'c2'),
  taskId: fc.constantFrom<string | null>(null, 't1', 't2'),
  category: fc.constantFrom<Category | null>(null, 'current', 'pending'),
  quickRevision: fc.boolean(),
  mode: fc.constantFrom<SessionMode>('pomodoro', 'quickstart', 'stopwatch'),
  status: fc.oneof({ weight: 4, arbitrary: fc.constant<SessionStatus>('completed') }, { weight: 1, arbitrary: fc.constant<SessionStatus>('failed_strict') }),
  segments: fc.array(arbSegment, { minLength: 1, maxLength: 4 }),
  deleted: fc.oneof({ weight: 9, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
});

export const arbSessions: fc.Arbitrary<FocusSession[]> = fc.array(arbSessionBody, { maxLength: 40 }).map((list) =>
  list.map((b, i) => ({
    id: `session-${i}`,
    updatedAt: 1,
    taskId: b.taskId,
    subjectId: b.subjectId,
    chapterId: b.chapterId,
    category: b.category,
    quickRevision: b.quickRevision,
    mode: b.mode,
    status: b.status,
    segments: b.segments,
    start: b.segments[0].start,
    end: b.segments[b.segments.length - 1].end,
    durationMs: b.segments.reduce((a, s) => a + s.end - s.start, 0),
    plannedMinutes: 25,
    createdAt: b.segments[0].start,
    deleted: b.deleted,
  })),
);

export function makeTask(partial: Partial<Task> & { id: string }): Task {
  return {
    updatedAt: 1,
    title: partial.id,
    subjectId: 's1',
    chapterId: null,
    category: 'current',
    column: 'current',
    priority: 'normal',
    dueDate: null,
    targetMode: 'pomodoro',
    estimatedPomodoros: 4,
    pomodoroMinutes: 25,
    unitTarget: 10,
    unitLabel: 'Questions',
    unitDone: 0,
    subtasks: [],
    quickRevision: false,
    savedSubtasks: null,
    savedEstimate: null,
    kind: null,
    targetQuestions: null,
    filters: { ...NO_FILTERS },
    mesh: 0,
    repeat: { ...NO_REPEAT },
    reminderTime: null,
    seriesId: null,
    createdAt: NOW - 90 * DAY,
    completedAt: null,
    ...partial,
  };
}

export const arbSubtasks: fc.Arbitrary<Subtask[]> = fc
  .array(fc.record({ label: fc.string({ minLength: 1, maxLength: 20 }), done: fc.boolean() }), { maxLength: 8 })
  .map((list) => list.map((s, i) => ({ id: `st-${i}`, ...s })));

export const arbCompletedTasks: fc.Arbitrary<Task[]> = fc
  .array(
    fc.record({
      completed: fc.boolean(),
      back: fc.integer({ min: -2 * DAY, max: 60 * DAY }),
      deleted: fc.boolean(),
    }),
    { maxLength: 30 },
  )
  .map((list) =>
    list.map((t, i) =>
      makeTask({
        id: `task-${i}`,
        column: t.completed ? 'completed' : 'current',
        completedAt: t.completed ? NOW - t.back : null,
        deleted: t.deleted && i % 3 === 0,
      }),
    ),
  );
