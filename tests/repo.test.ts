import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { StudyDB, db } from '../src/db/db';
import { DEFAULT_SETTINGS, NO_FILTERS, NO_REPEAT } from '../src/db/defaults';
import { BUILTIN_QUESTIONS } from '../src/db/builtin';
import { clearDemoData, hasDemoData, loadDemoData } from '../src/db/demo';
import {
  addQuestion,
  addSession,
  addTask,
  applyRemote,
  changeHydration,
  completeTask,
  ensureBuiltinQuestions,
  exportSnapshot,
  factoryReset,
  importSnapshot,
  moveQuestion,
  setQuickRevision,
  setRestDay,
  stepUnits,
  updateSettings,
  type TaskInput,
} from '../src/db/repo';
import { validateSnapshot } from '../src/sync/snapshot';
import { countedSessions, totalFocusMs } from '../src/lib/stats';
import { MINUTE, addDays, dayKey } from '../src/lib/time';
import type { CompletedRun } from '../src/timer/timerMachine';
import { NOW } from './arbitraries';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

function input(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    title: 'Task',
    subjectId: 's1',
    chapterId: null,
    category: 'current',
    priority: 'normal',
    dueDate: null,
    targetMode: 'pomodoro',
    estimatedPomodoros: 2,
    pomodoroMinutes: 25,
    unitTarget: 10,
    unitLabel: 'Questions',
    repeat: { ...NO_REPEAT },
    reminderTime: null,
    filters: { ...NO_FILTERS },
    subtasks: [],
    ...overrides,
  };
}

function run(start: number, minutes: number, overrides: Partial<CompletedRun> = {}): CompletedRun {
  return { phase: 'focus', mode: 'pomodoro', taskId: null, segments: [{ start, end: start + minutes * MINUTE }], targetMs: 25 * MINUTE, breakKind: null, sectionSubjectId: null, ...overrides };
}

const live = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);

describe('Repository against IndexedDB', () => {
  it('Quick Revision updates the stored checklist and estimate and restores them', async () => {
    const task = await addTask(input({ title: 'Rotational Motion', category: 'pending', estimatedPomodoros: 8, subtasks: ['Lectures 1 to 4', 'Lectures 5 to 8', 'Problem set'] }));
    await setQuickRevision(task.id, true);
    const on = (await db.tasks.get(task.id))!;
    expect(on.subtasks.map((s) => s.label)).toEqual(['Summary', 'Formula Sheet', 'Past Questions']);
    expect(on.estimatedPomodoros).toBe(4);
    expect(on.updatedAt).toBeGreaterThan(task.updatedAt);

    await setQuickRevision(task.id, false);
    const off = (await db.tasks.get(task.id))!;
    expect(off.subtasks.map((s) => s.label)).toEqual(['Lectures 1 to 4', 'Lectures 5 to 8', 'Problem set']);
    expect(off.estimatedPomodoros).toBe(8);
  });

  it('remote records only replace older local data, and are normalized on the way in', async () => {
    const task = await addTask(input({ title: 'Local' }));
    await applyRemote('tasks', [{ ...task, title: 'Older', updatedAt: task.updatedAt - 1 }]);
    expect((await db.tasks.get(task.id))!.title).toBe('Local');
    await applyRemote('tasks', [{ ...task, title: 'Newer', updatedAt: task.updatedAt + 1 }]);
    expect((await db.tasks.get(task.id))!.title).toBe('Newer');

    // A version 1 record from an older device gets the version 2 fields.
    await applyRemote('tasks', [{ id: 'old', updatedAt: 5, title: 'From v1', subjectId: 's1', category: 'pending' }]);
    expect(await db.tasks.get('old')).toMatchObject({ targetMode: 'pomodoro', column: 'pending', repeat: { kind: 'never' } });
    expect(await applyRemote('tasks', [{ title: 'no id' }, 'junk'])).toEqual([]);
  });

  it('two tabs logging the same timer run write one session', async () => {
    await addSession(run(NOW, 25));
    await addSession(run(NOW, 25));
    const sessions = await db.focusSessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: `run-${NOW}`, status: 'completed', mode: 'pomodoro', durationMs: 25 * MINUTE });
  });

  it('drops completed runs under a minute but keeps short Strict Mode failures', async () => {
    expect(await addSession(run(NOW, 0.5))).toBeNull();
    const failed = await addSession(run(NOW + 10 * MINUTE, 0.5), 'failed_strict');
    expect(failed?.status).toBe('failed_strict');
    const all = await db.focusSessions.toArray();
    expect(all).toHaveLength(1);
    expect(countedSessions(all)).toHaveLength(0);
    expect(await addSession(run(NOW, 25, { phase: 'break' }))).toBeNull();
  });

  it('copies task, subject and chapter onto the session', async () => {
    const task = await addTask(input({ subjectId: 'phys', chapterId: 'ch-1', category: 'pending' }));
    const s = (await addSession(run(NOW, 25, { taskId: task.id, mode: 'stopwatch' })))!;
    expect(s).toMatchObject({ taskId: task.id, subjectId: 'phys', chapterId: 'ch-1', category: 'pending', mode: 'stopwatch' });
  });

  it('completing a repeating task creates the next one exactly once', async () => {
    const today = dayKey(Date.now());
    const task = await addTask(input({ title: 'Daily formulas', dueDate: today, repeat: { kind: 'daily', intervalDays: 2 }, subtasks: ['Read', 'Write'] }));
    await completeTask(task.id);
    await completeTask(task.id);
    const nextId = `${task.id}@${addDays(today, 1)}`;
    const next = (await db.tasks.get(nextId))!;
    expect(next).toMatchObject({ seriesId: task.id, column: 'current', dueDate: addDays(today, 1), completedAt: null, unitDone: 0 });
    expect(next.subtasks.every((s) => !s.done)).toBe(true);
    expect((await db.tasks.get(task.id))!.column).toBe('completed');
    expect(live(await db.tasks.toArray())).toHaveLength(2);

    // Completing the copy continues the same series.
    await completeTask(nextId);
    const third = (await db.tasks.toArray()).filter((t) => t.seriesId === task.id && t.column !== 'completed');
    expect(third).toHaveLength(1);
    expect(third[0].id.startsWith(`${task.id}@`)).toBe(true);
    expect(third[0].dueDate! > today).toBe(true);
  });

  it('a task that does not repeat creates nothing on completion', async () => {
    const task = await addTask(input());
    await completeTask(task.id);
    expect(await db.tasks.count()).toBe(1);
  });

  it('unit steps stay between zero and the target', async () => {
    const task = await addTask(input({ targetMode: 'unit', unitTarget: 3 }));
    await stepUnits(task.id, -1);
    expect((await db.tasks.get(task.id))!.unitDone).toBe(0);
    await stepUnits(task.id, 2);
    await stepUnits(task.id, 5);
    expect((await db.tasks.get(task.id))!.unitDone).toBe(3);
  });

  it('hydration stays between zero and the maximum', async () => {
    expect(await changeHydration('2026-10-20', -1, 8)).toBe(0);
    expect(await changeHydration('2026-10-20', 3, 8)).toBe(3);
    expect(await changeHydration('2026-10-20', 100, 8)).toBe(40);
    expect((await db.hydrationLogs.get('2026-10-20'))!.dailyTarget).toBe(8);
  });

  it('built-in questions are added once and reordering renumbers the list', async () => {
    await ensureBuiltinQuestions();
    await ensureBuiltinQuestions();
    expect(await db.reflectionQuestions.count()).toBe(BUILTIN_QUESTIONS.length);
    await addQuestion('  Did I take breaks away from the screen?  ');
    const ordered = async () => live(await db.reflectionQuestions.toArray()).sort((a, b) => a.order - b.order);
    const custom = (await ordered()).at(-1)!;
    expect(custom).toMatchObject({ text: 'Did I take breaks away from the screen?', builtIn: false, order: 4 });

    await moveQuestion(custom.id, -1);
    expect((await ordered()).map((q) => q.id)).toEqual(['builtin-q1', 'builtin-q2', 'builtin-q3', custom.id, 'builtin-q4']);
    await moveQuestion('builtin-q1', -1);
    expect((await ordered())[0].id).toBe('builtin-q1');
    expect((await ordered()).map((q) => q.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('a deleted built-in question stays deleted', async () => {
    await ensureBuiltinQuestions();
    await db.reflectionQuestions.update('builtin-q2', { deleted: true, updatedAt: 9 });
    await ensureBuiltinQuestions();
    expect((await db.reflectionQuestions.get('builtin-q2'))!.deleted).toBe(true);
  });

  it('demo data is valid, exports cleanly, and can be removed without touching real data', async () => {
    expect(await hasDemoData()).toBe(false);
    await loadDemoData(NOW);
    expect(await hasDemoData()).toBe(true);

    const snapshot = validateSnapshot(JSON.parse(JSON.stringify(await exportSnapshot())));
    expect(snapshot.tables.tasks.length).toBeGreaterThan(0);
    expect(snapshot.tables.chapters.length).toBeGreaterThan(0);
    expect(snapshot.tables.focusSessions.some((s) => s.status === 'failed_strict')).toBe(true);
    expect(totalFocusMs(countedSessions(snapshot.tables.focusSessions))).toBeGreaterThan(0);
    for (const s of snapshot.tables.focusSessions) {
      for (const seg of s.segments) expect(seg.end).toBeLessThanOrEqual(NOW);
    }

    const today = dayKey(NOW);
    const mine = await addTask(input({ title: 'My own task' }));
    await setRestDay('2026-01-05', true);
    await changeHydration(today, 1, 8); // the student changed today's demo count

    await clearDemoData();
    expect(await hasDemoData()).toBe(false);
    expect(live(await db.tasks.toArray()).map((t) => t.id)).toEqual([mine.id]);
    expect(live(await db.subjects.toArray())).toHaveLength(0);
    expect(live(await db.focusSessions.toArray())).toHaveLength(0);
    expect(live(await db.eveningReviews.toArray())).toHaveLength(0);
    expect(live(await db.hydrationLogs.toArray()).map((h) => h.id)).toEqual([today]);
    expect(live(await db.days.toArray()).map((d) => d.id)).toEqual(['2026-01-05']);

    // Re-importing the old backup does not bring demo data back: the tombstones are newer.
    await importSnapshot(snapshot);
    expect(await hasDemoData()).toBe(false);
  });

  it('factory reset empties everything and restores defaults and the built-in questions', async () => {
    await ensureBuiltinQuestions();
    await loadDemoData(NOW);
    await addQuestion('Custom question');
    await db.reflectionQuestions.update('builtin-q3', { text: 'Edited', updatedAt: 5 });
    await updateSettings({ displayName: 'Asha', dailyGoalMinutes: 300 });
    const before = (await db.tasks.toArray()).map((t) => t.updatedAt);

    expect(await factoryReset()).toBeGreaterThan(0);

    for (const name of ['tasks', 'subjects', 'chapters', 'focusSessions', 'blocks', 'quickNotes', 'days', 'hydrationLogs', 'eveningReviews', 'goals'] as const) {
      expect(live(await db.table(name).toArray()), name).toHaveLength(0);
    }
    const tasks = await db.tasks.toArray();
    expect(tasks.length).toBe(before.length);
    expect(Math.min(...tasks.map((t) => t.updatedAt))).toBeGreaterThan(Math.max(...before));

    const questions = live(await db.reflectionQuestions.toArray()).sort((a, b) => a.order - b.order);
    expect(questions.map((q) => q.text)).toEqual(BUILTIN_QUESTIONS.map((q) => q.text));
    expect(questions.every((q) => q.updatedAt > 1)).toBe(true);

    const { updatedAt: _stamp, ...settings } = (await db.userSettings.get('app'))!;
    const { updatedAt: _default, ...defaults } = DEFAULT_SETTINGS;
    expect(settings).toEqual(defaults);
    expect(await db.customAudioFiles.count()).toBe(0);
  });
});

describe('Upgrade from version 1', () => {
  it('copies renamed tables, fills new fields, and retires untouched sample data', async () => {
    const name = `upgrade-${Math.random().toString(36).slice(2)}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      subjects: 'id, updatedAt, order',
      tasks: 'id, updatedAt, column, dueDate',
      sessions: 'id, updatedAt, createdAt',
      blocks: 'id, updatedAt, start',
      notes: 'id, updatedAt, createdAt',
      days: 'id, updatedAt',
      goals: 'id, updatedAt',
      settings: 'id, updatedAt',
    });
    await v1.open();
    await v1.table('subjects').bulkAdd([
      { id: 'seed-subject-physics', updatedAt: 1, name: 'Physics', color: '#F5A35C', order: 0 },
      { id: 'seed-subject-maths', updatedAt: 40, name: 'Maths (renamed)', color: '#6FA8DC', order: 1 },
      { id: 'mine', updatedAt: 50, name: 'History', color: '#A1A1AA', order: 2 },
    ]);
    await v1.table('tasks').bulkAdd([
      { id: 'seed-task-gauss', updatedAt: 1, title: 'Gauss Law', subjectId: 'seed-subject-physics', category: 'current', column: 'current', estimatedPomodoros: 4, subtasks: [] },
      { id: 'task-mine', updatedAt: 60, title: 'Essay', subjectId: 'mine', category: 'pending', column: 'pending', estimatedPomodoros: 2, subtasks: [] },
    ]);
    await v1.table('sessions').bulkAdd([
      { id: 'seed-session-1', updatedAt: 1, taskId: 'seed-task-gauss', subjectId: 'seed-subject-physics', category: 'current', quickRevision: false, segments: [{ start: 1000, end: 1000 + 25 * MINUTE }], plannedMinutes: 25, createdAt: 1000 },
      { id: 'run-5000', updatedAt: 70, taskId: 'task-mine', subjectId: 'mine', category: 'pending', quickRevision: false, segments: [{ start: 5000, end: 5000 + 30 * MINUTE }], plannedMinutes: 25, createdAt: 5000 },
    ]);
    await v1.table('notes').add({ id: 'n1', updatedAt: 80, text: 'Library at 4', topic: 'Essay', mode: '25m focus', status: 'open', createdAt: 5000 });
    await v1.table('settings').add({ id: 'app', updatedAt: 90, studentName: 'Asha', dailyGoalMinutes: 200 });
    v1.close();

    const before = Date.now();
    const upgraded = new StudyDB(name);
    await upgraded.open();

    expect(upgraded.verno).toBe(8);
    expect(upgraded.tables.map((t) => t.name)).not.toContain('sessions');
    expect(upgraded.tables.map((t) => t.name)).not.toContain('notes');
    expect(upgraded.tables.map((t) => t.name)).not.toContain('settings');

    const physics = (await upgraded.subjects.get('seed-subject-physics'))!;
    expect(physics.deleted).toBe(true);
    expect(physics.updatedAt).toBeGreaterThanOrEqual(before);
    expect((await upgraded.subjects.get('seed-subject-maths'))!).toMatchObject({ name: 'Maths (renamed)', updatedAt: 40 });
    expect((await upgraded.subjects.get('seed-subject-maths'))!.deleted).toBeUndefined();

    expect((await upgraded.tasks.get('seed-task-gauss'))!.deleted).toBe(true);
    expect(await upgraded.tasks.get('task-mine')).toMatchObject({ title: 'Essay', targetMode: 'pomodoro', repeat: { kind: 'never' }, updatedAt: 60 });

    expect((await upgraded.focusSessions.get('seed-session-1'))!.deleted).toBe(true);
    expect(await upgraded.focusSessions.get('run-5000')).toMatchObject({ mode: 'pomodoro', status: 'completed', durationMs: 30 * MINUTE, updatedAt: 70 });
    expect(await upgraded.quickNotes.get('n1')).toMatchObject({ context: 'Essay, 25m focus', resolved: false });
    expect(await upgraded.userSettings.get('app')).toMatchObject({ displayName: 'Asha', dailyGoalMinutes: 200, hydrationGoal: 8 });
    upgraded.close();
    await Dexie.delete(name);
  });
});
