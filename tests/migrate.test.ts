import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isUntouchedSeed, normalizeNote, normalizeRecord, normalizeSession, normalizeSettings, normalizeTask, resolveTable } from '../src/db/migrate';
import { TABLE_NAMES } from '../src/types';
import { arbSessions, makeTask } from './arbitraries';

const RUNS = { numRuns: 300 };

/** A version 1 task as stored before the upgrade. */
const v1Task = {
  id: 'seed-task-gauss',
  updatedAt: 1,
  title: 'Gauss Law',
  subjectId: 's1',
  category: 'pending',
  column: 'pending',
  priority: 'urgent',
  dueDate: null,
  estimatedPomodoros: 8,
  subtasks: [{ id: 'a', label: 'Lectures', done: true }],
  quickRevision: false,
  savedSubtasks: null,
  savedEstimate: null,
  filters: { examWeightage: true, activeRecall: false, requiredForClass: true },
  problemsSolved: 6,
  mesh: 2,
  createdAt: 100,
  completedAt: null,
};

describe('Record migration', () => {
  it('fills the new task fields and keeps everything a version 1 task had', () => {
    const t = normalizeTask(v1Task);
    // problemsSolved moves to question logs (see the version 3 tests below).
    const { problemsSolved: _moved, ...kept } = v1Task;
    expect(t).not.toHaveProperty('problemsSolved');
    expect(t).toMatchObject({ ...kept, targetMode: 'pomodoro', pomodoroMinutes: 25, unitDone: 0, chapterId: null, reminderTime: null, seriesId: null });
    expect(t.repeat.kind).toBe('never');
  });

  it('converts version 1 sessions, notes and settings', () => {
    const s = normalizeSession({ id: 'x', updatedAt: 5, taskId: null, subjectId: 's1', category: 'current', quickRevision: false, segments: [{ start: 10, end: 70 }, { start: 100, end: 160 }], plannedMinutes: 25, createdAt: 10 });
    expect(s).toMatchObject({ mode: 'pomodoro', status: 'completed', start: 10, end: 160, durationMs: 120, chapterId: null });
    const n = normalizeNote({ id: 'n', updatedAt: 2, text: 'Call', topic: 'Gauss Law', mode: '25m focus', status: 'done', createdAt: 3 });
    expect(n).toMatchObject({ context: 'Gauss Law, 25m focus', resolved: true });
    const st = normalizeSettings({ id: 'app', updatedAt: 9, studentName: 'Asha', dailyGoalMinutes: 240, bellIntervalMinutes: 15, tomorrowTask: null });
    expect(st).toMatchObject({ displayName: 'Asha', dailyGoalMinutes: 240, bellIntervalMinutes: 15, hydrationGoal: 8, clockStyle: 'digital' });
    expect(normalizeSettings({ id: 'app', updatedAt: 1, studentName: 'Student' }).displayName).toBe('');
  });

  it('normalizing is idempotent for every table', () => {
    fc.assert(
      fc.property(arbSessions, (sessions) => {
        for (const s of sessions) {
          const once = normalizeRecord('focusSessions', s)!;
          expect(normalizeRecord('focusSessions', once)).toEqual(once);
        }
        const t = normalizeRecord('tasks', makeTask({ id: 'q', targetMode: 'unit', unitTarget: 5, unitDone: 9 }))!;
        expect(t.unitDone).toBe(5);
        expect(normalizeRecord('tasks', t)).toEqual(t);
      }),
      RUNS,
    );
    for (const table of TABLE_NAMES) {
      const r = normalizeRecord(table, { id: 'z', updatedAt: 3 })!;
      expect(normalizeRecord(table, r)).toEqual(r);
    }
  });

  it('rejects values without an id or updatedAt, and maps legacy table names', () => {
    expect(normalizeRecord('tasks', { id: '', updatedAt: 1 })).toBeNull();
    expect(normalizeRecord('tasks', { id: 'a' })).toBeNull();
    expect(normalizeRecord('tasks', 'nope')).toBeNull();
    expect(resolveTable('sessions')).toBe('focusSessions');
    expect(resolveTable('notes')).toBe('quickNotes');
    expect(resolveTable('settings')).toBe('userSettings');
    expect(resolveTable('tasks')).toBe('tasks');
    expect(resolveTable('unknown')).toBeNull();
  });

  it('recognises only untouched version 1 sample records', () => {
    expect(isUntouchedSeed({ id: 'seed-task-a', updatedAt: 1 })).toBe(true);
    expect(isUntouchedSeed({ id: 'seed-task-a', updatedAt: 2 })).toBe(false);
    expect(isUntouchedSeed({ id: 'demo-task-a', updatedAt: 1 })).toBe(false);
    expect(isUntouchedSeed({ id: 'seed-task-a', updatedAt: 1, deleted: true })).toBe(false);
  });
});
