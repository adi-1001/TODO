import type { Table } from 'dexie';
import { db } from './db';
import {
  TABLE_NAMES,
  type BlockKind,
  type Category,
  type Chapter,
  type ChapterStatus,
  type Column,
  type CustomAudioFile,
  type DayMeta,
  type EveningReview,
  type FocusSession,
  type Goal,
  type Priority,
  type MistakeCounts,
  type QuestionLog,
  type QuickNote,
  type ReflectionQuestion,
  type RepeatRule,
  type ScheduleDay,
  type ScheduleSlot,
  type SessionStatus,
  type Subject,
  type SubjectScore,
  type Subtask,
  type Syncable,
  type TableMap,
  type TableName,
  type TargetMode,
  type Task,
  type TaskFilters,
  type TaskKind,
  type RootCause,
  type TestEvent,
  type TestKind,
  type TestResult,
  type UserSettings,
} from '../types';
import { questionLogId } from '../lib/questions';
import { effectiveSlots, isValidSlot, scheduleDayId, sortSlots } from '../lib/schedule';
import { fixTaskId, pendingOccurrences } from '../lib/tests';
import { brushUpTaskId } from '../lib/decay';
import { CHAPTER_MILESTONES, autoChapterStatus, type MilestoneKey } from '../lib/syllabus';
import { DEFAULT_SETTINGS, NO_REPEAT } from './defaults';
import { cleanRootCauses, normalizeMany } from './migrate';
import { BUILTIN_QUESTIONS } from './builtin';
import { getDeviceId, newId } from '../lib/ids';
import { applyQuickRevision } from '../lib/quickRevision';
import { nextDueAfter } from '../lib/repeat';
import { rescheduleTasks, type RescheduleTarget } from '../lib/review';
import { MINUTE, dayKey } from '../lib/time';
import { pickNewer, type Snapshot } from '../sync/snapshot';
import type { CompletedRun } from '../timer/timerMachine';

export { DEFAULT_SETTINGS } from './defaults';

export type ChangeListener = (table: TableName, records: Syncable[]) => void;

let listener: ChangeListener | null = null;
export function setChangeListener(fn: ChangeListener | null): void {
  listener = fn;
}

let lastStamp = 0;
/**
 * Strictly increasing timestamps within this tab, so two quick edits never tie. The clock
 * also moves past any remote record already seen, so an edit made after receiving a record
 * from a device whose clock runs ahead still wins.
 */
export function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

function observeStamp(ts: number): void {
  // Ignore timestamps more than a day in the future (bad clock or a damaged backup).
  if (ts > lastStamp && ts < Date.now() + 86_400_000) lastStamp = ts;
}

export function tableOf<K extends TableName>(name: K): Table<TableMap[K], string> {
  return db.table(name) as unknown as Table<TableMap[K], string>;
}

export async function put<K extends TableName>(name: K, record: TableMap[K]): Promise<TableMap[K]> {
  const next = { ...record, updatedAt: stamp() } as TableMap[K];
  await tableOf(name).put(next);
  listener?.(name, [next]);
  return next;
}

export async function putMany<K extends TableName>(name: K, records: TableMap[K][]): Promise<TableMap[K][]> {
  if (records.length === 0) return [];
  const next = records.map((r) => ({ ...r, updatedAt: stamp() }) as TableMap[K]);
  await tableOf(name).bulkPut(next);
  listener?.(name, next);
  return next;
}

export async function patch<K extends TableName>(name: K, id: string, changes: Partial<TableMap[K]>): Promise<TableMap[K] | null> {
  const current = await tableOf(name).get(id);
  if (!current) return null;
  return put(name, { ...current, ...changes });
}

export async function remove(name: TableName, id: string): Promise<void> {
  await patch(name, id, { deleted: true } as Partial<TableMap[typeof name]>);
}

/** Writes records that came from another tab, device or backup. Returns the ones that won. */
export async function applyRemote<K extends TableName>(name: K, incoming: unknown[]): Promise<TableMap[K][]> {
  const records = normalizeMany(name, incoming);
  if (records.length === 0) return [];
  const table = tableOf(name);
  return db.transaction('rw', table, async () => {
    const existing = await table.bulkGet(records.map((r) => r.id));
    const winners: TableMap[K][] = [];
    records.forEach((r, i) => {
      observeStamp(r.updatedAt);
      const local = existing[i];
      if (pickNewer(local, r) !== local) winners.push(r);
    });
    if (winners.length) await table.bulkPut(winners);
    return winners;
  });
}

export async function allRecords<K extends TableName>(name: K): Promise<TableMap[K][]> {
  return tableOf(name).toArray();
}

export async function recordsSince<K extends TableName>(name: K, since: number): Promise<TableMap[K][]> {
  return tableOf(name).where('updatedAt').above(since).toArray();
}

/* ---------- Settings ---------- */

export async function getSettings(): Promise<UserSettings> {
  return (await db.userSettings.get('app')) ?? DEFAULT_SETTINGS;
}

export async function updateSettings(changes: Partial<Omit<UserSettings, 'id' | 'updatedAt'>>): Promise<UserSettings> {
  const current = await getSettings();
  return put('userSettings', { ...current, ...changes, id: 'app' });
}

/* ---------- Subjects and chapters ---------- */

export async function addSubject(name: string, color: string): Promise<Subject> {
  const count = await db.subjects.count();
  return put('subjects', { id: newId(), updatedAt: 0, name: name.trim(), color, order: count });
}

export async function updateSubject(id: string, changes: Partial<Pick<Subject, 'name' | 'color'>>): Promise<void> {
  await patch('subjects', id, changes);
}

/** Deletes a subject and its chapters. Tasks keep their link and show the subject as archived. */
export async function deleteSubject(id: string): Promise<void> {
  const chapters = (await db.chapters.where('subjectId').equals(id).toArray()).filter((c) => !c.deleted);
  await putMany('chapters', chapters.map((c) => ({ ...c, deleted: true })));
  await remove('subjects', id);
}

export async function addChapter(subjectId: string, title: string): Promise<Chapter> {
  const siblings = await db.chapters.where('subjectId').equals(subjectId).toArray();
  const order = siblings.reduce((m, c) => Math.max(m, c.order + 1), 0);
  return put('chapters', {
    id: newId(),
    updatedAt: 0,
    subjectId,
    title: title.trim(),
    order,
    status: 'not_started',
    theoryDone: false,
    referenceBookDone: false,
    pyqDone: false,
    revisionDone: false,
    lastStudiedAt: null,
    targetQuestions: null,
    createdAt: Date.now(),
  });
}

/** Studying again within this long does not rewrite the chapter, so taps do not cause sync churn. */
export const TOUCH_MIN_GAP_MS = 10 * MINUTE;

/**
 * Moves a chapter's lastStudiedAt forward to `at`. Never moves it back. Studying a chapter that
 * is still Not Started also starts it: Practice Pending when its theory is done, else Ongoing.
 */
export async function touchChapter(chapterId: string, at = Date.now()): Promise<void> {
  const c = await db.chapters.get(chapterId);
  if (!c || c.deleted) return;
  const last = c.lastStudiedAt ?? 0;
  const moveClock = at > last && at - last >= TOUCH_MIN_GAP_MS;
  const status: ChapterStatus = c.status === 'not_started' ? (c.theoryDone ? 'practice_pending' : 'ongoing') : c.status;
  if (!moveClock && status === c.status) return;
  await put('chapters', { ...c, status, ...(moveClock ? { lastStudiedAt: at } : {}) });
}

/**
 * Saves chapter changes. A milestone change also sets the status automatically (see
 * autoChapterStatus) unless the same call sets a status. Ticking any milestone, or a change that
 * makes the chapter Completed, counts as studying it.
 */
export async function updateChapter(id: string, changes: Partial<Pick<Chapter, 'title' | 'status' | MilestoneKey>>): Promise<void> {
  const c = await db.chapters.get(id);
  if (!c) return;
  const next: Chapter = { ...c, ...changes };
  const milestoneChanged = CHAPTER_MILESTONES.some((m) => changes[m.key] !== undefined && changes[m.key] !== c[m.key]);
  if (milestoneChanged && changes.status === undefined) next.status = autoChapterStatus(c.status, next);
  const ticked = CHAPTER_MILESTONES.some((m) => changes[m.key] === true && !c[m.key]);
  const studied = ticked || (next.status === 'completed' && c.status !== 'completed');
  await put('chapters', { ...next, ...(studied ? { lastStudiedAt: Date.now() } : {}) });
}

/** Marking a chapter Completed counts as studying it. */
export async function setChapterStatus(id: string, status: ChapterStatus): Promise<void> {
  const c = await db.chapters.get(id);
  if (!c) return;
  const studied = status === 'completed' && c.status !== 'completed';
  await put('chapters', { ...c, status, ...(studied ? { lastStudiedAt: Date.now() } : {}) });
}

/**
 * Adds a 25-minute brush-up task for a chapter to Pending Topics with Quick Revision on
 * (Summary, Formula Sheet, Past Questions). One per chapter per day; finishing it, or any focus
 * on the chapter, resets the brush-up clock.
 */
export async function scheduleBrushUp(chapterId: string): Promise<Task | null> {
  const c = await db.chapters.get(chapterId);
  if (!c || c.deleted) return null;
  const id = brushUpTaskId(chapterId, dayKey(Date.now()));
  const existing = await db.tasks.get(id);
  if (existing && !existing.deleted && existing.column !== 'completed') return existing;
  const count = await db.tasks.count();
  const base: Task = {
    id,
    updatedAt: 0,
    title: `Brush-up: ${c.title}`,
    subjectId: c.subjectId,
    chapterId,
    kind: 'revision',
    targetQuestions: null,
    category: 'pending',
    column: 'pending',
    priority: 'normal',
    dueDate: null,
    targetMode: 'pomodoro',
    estimatedPomodoros: 1,
    pomodoroMinutes: 25,
    unitTarget: 10,
    unitLabel: 'Questions',
    unitDone: 0,
    subtasks: [],
    quickRevision: false,
    savedSubtasks: null,
    savedEstimate: null,
    filters: { examWeightage: false, activeRecall: true, requiredForClass: false },
    mesh: (count % 4) as Task['mesh'],
    repeat: { ...NO_REPEAT },
    reminderTime: null,
    seriesId: null,
    createdAt: Date.now(),
    completedAt: null,
    deleted: false,
  };
  return put('tasks', applyQuickRevision(base, true, newId));
}

const cleanTarget = (n: number | null): number | null => (n === null || !Number.isFinite(n) || n < 1 ? null : clampInt(n, 1, 100_000));

/** Sets or clears one chapter's Target Questions. */
export async function setChapterTarget(chapterId: string, target: number | null): Promise<void> {
  const c = await db.chapters.get(chapterId);
  if (!c || c.deleted) return;
  const next = cleanTarget(target);
  if (next !== c.targetQuestions) await put('chapters', { ...c, targetQuestions: next });
}

/** Sets the same Target Questions on many chapters in one write. Returns how many changed. */
export async function setChapterTargets(chapterIds: string[], target: number): Promise<number> {
  const next = cleanTarget(target);
  const rows = (await db.chapters.bulkGet([...new Set(chapterIds)])).filter((c): c is Chapter => !!c && !c.deleted && c.targetQuestions !== next);
  await putMany(
    'chapters',
    rows.map((c) => ({ ...c, targetQuestions: next })),
  );
  return rows.length;
}

/**
 * Adds a 25-minute Backlog Catch-Up task for a chapter to Pending Topics, aiming for
 * `targetQuestions`. One per chapter per day, so a second tap returns the same task.
 */
export async function addBacklogSprintTask(chapterId: string, targetQuestions: number): Promise<Task | null> {
  const c = await db.chapters.get(chapterId);
  if (!c || c.deleted) return null;
  const id = `sprint-${chapterId}-${dayKey(Date.now())}`;
  const existing = await db.tasks.get(id);
  if (existing && !existing.deleted && existing.column !== 'completed') return existing;
  const count = await db.tasks.count();
  return put('tasks', {
    id,
    updatedAt: 0,
    title: `Backlog sprint: ${c.title}`,
    subjectId: c.subjectId,
    chapterId,
    kind: 'backlog',
    targetQuestions: clampInt(targetQuestions, 1, 100_000),
    category: 'pending',
    column: 'pending',
    priority: 'high-yield',
    dueDate: null,
    targetMode: 'pomodoro',
    estimatedPomodoros: 1,
    pomodoroMinutes: 25,
    unitTarget: 10,
    unitLabel: 'Questions',
    unitDone: 0,
    subtasks: [],
    quickRevision: false,
    savedSubtasks: null,
    savedEstimate: null,
    filters: { examWeightage: true, activeRecall: true, requiredForClass: false },
    mesh: (count % 4) as Task['mesh'],
    repeat: { ...NO_REPEAT },
    reminderTime: null,
    seriesId: null,
    createdAt: Date.now(),
    completedAt: null,
    deleted: false,
  });
}

export async function deleteChapter(id: string): Promise<void> {
  await remove('chapters', id);
}

/* ---------- Tasks ---------- */

export interface TaskInput {
  title: string;
  subjectId: string;
  chapterId: string | null;
  /** Task Category; left out means none. */
  kind?: TaskKind | null;
  /** Target Questions; left out or null means none. */
  targetQuestions?: number | null;
  category: Category;
  priority: Priority;
  dueDate: string | null;
  targetMode: TargetMode;
  estimatedPomodoros: number;
  pomodoroMinutes: number;
  unitTarget: number;
  unitLabel: string;
  repeat: RepeatRule;
  reminderTime: string | null;
  filters: TaskFilters;
  /** Checklist lines. */
  subtasks: string[];
}

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));

function cleanInput(input: TaskInput) {
  return {
    title: input.title.trim(),
    subjectId: input.subjectId,
    chapterId: input.chapterId,
    kind: input.kind ?? null,
    targetQuestions: typeof input.targetQuestions === 'number' && Number.isFinite(input.targetQuestions) && input.targetQuestions >= 1 ? clampInt(input.targetQuestions, 1, 100_000) : null,
    priority: input.priority,
    dueDate: input.dueDate,
    targetMode: input.targetMode,
    estimatedPomodoros: clampInt(input.estimatedPomodoros, 1, 200),
    pomodoroMinutes: clampInt(input.pomodoroMinutes, 1, 240),
    unitTarget: clampInt(input.unitTarget, 1, 100_000),
    unitLabel: input.unitLabel.trim() || 'Questions',
    repeat: input.repeat,
    reminderTime: input.reminderTime,
    filters: input.filters,
  };
}

/** Keeps ids and ticks of checklist items whose label is unchanged; new lines start unticked. */
export function mergeChecklist(existing: Subtask[], lines: string[]): Subtask[] {
  const pool = [...existing];
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((label) => {
      const i = pool.findIndex((s) => s.label === label);
      if (i >= 0) return pool.splice(i, 1)[0];
      return { id: newId(), label, done: false };
    });
}

export async function addTask(input: TaskInput): Promise<Task> {
  const count = await db.tasks.count();
  return put('tasks', {
    id: newId(),
    updatedAt: 0,
    ...cleanInput(input),
    category: input.category,
    column: input.category,
    unitDone: 0,
    subtasks: mergeChecklist([], input.subtasks),
    quickRevision: false,
    savedSubtasks: null,
    savedEstimate: null,
    mesh: (count % 4) as Task['mesh'],
    seriesId: null,
    createdAt: Date.now(),
    completedAt: null,
  });
}

/** Saves the task dialog for an existing task. */
export async function editTask(id: string, input: TaskInput): Promise<Task | null> {
  const t = await db.tasks.get(id);
  if (!t) return null;
  let next: Task = { ...t, ...cleanInput(input), subtasks: mergeChecklist(t.subtasks, input.subtasks) };
  if (input.category !== t.category) {
    if (input.category === 'current' && next.quickRevision) next = applyQuickRevision({ ...next, category: 'pending' }, false, newId);
    next = { ...next, category: input.category, column: t.column === 'completed' ? 'completed' : input.category };
  }
  next.unitDone = Math.min(next.unitDone, next.unitTarget);
  return put('tasks', next);
}

/**
 * Marks a task complete. A repeating task also gets its next occurrence, created once with a
 * deterministic id so two devices completing the same task converge on one record.
 */
export async function completeTask(id: string): Promise<void> {
  const t = await db.tasks.get(id);
  if (!t || t.column === 'completed') return;
  const now = Date.now();
  await put('tasks', { ...t, column: 'completed', completedAt: now });
  // Finishing a chapter's task (a brush-up, for example) counts as studying the chapter.
  if (t.chapterId) await touchChapter(t.chapterId, now);
  if (t.repeat.kind === 'never') return;
  const today = dayKey(now);
  const next = nextDueAfter(t.repeat, t.dueDate ?? today, today);
  if (!next) return;
  const seriesId = t.seriesId ?? t.id;
  const nextId = `${seriesId}@${next}`;
  if (await db.tasks.get(nextId)) return;
  await put('tasks', {
    ...t,
    id: nextId,
    seriesId,
    column: t.category,
    dueDate: next,
    unitDone: 0,
    subtasks: t.subtasks.map((s) => ({ ...s, id: newId(), done: false })),
    savedSubtasks: t.savedSubtasks ? t.savedSubtasks.map((s) => ({ ...s, done: false })) : null,
    createdAt: now,
    completedAt: null,
  });
}

export async function reopenTask(id: string): Promise<void> {
  const t = await db.tasks.get(id);
  if (!t) return;
  await put('tasks', { ...t, column: t.category, completedAt: null });
}

/** Moves an open task between Current Topics and Pending Topics. */
export async function moveTask(id: string, category: Category): Promise<void> {
  const t = await db.tasks.get(id);
  if (!t) return;
  const base = category === 'current' && t.quickRevision ? applyQuickRevision(t, false, newId) : t;
  const column: Column = t.column === 'completed' ? 'completed' : category;
  await put('tasks', { ...base, category, column });
}

export async function deleteTask(id: string): Promise<void> {
  await remove('tasks', id);
}

export async function toggleSubtask(taskId: string, subtaskId: string): Promise<void> {
  const t = await db.tasks.get(taskId);
  if (!t) return;
  await put('tasks', { ...t, subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s)) });
}

export async function setQuickRevision(taskId: string, on: boolean): Promise<void> {
  const t = await db.tasks.get(taskId);
  if (!t) return;
  const next = applyQuickRevision(t, on, newId);
  if (next !== t) await put('tasks', next);
}

/** Steps the unit counter of a unit-target task, kept between 0 and the target. */
export async function stepUnits(taskId: string, delta: number): Promise<void> {
  const t = await db.tasks.get(taskId);
  if (!t) return;
  const unitDone = Math.min(t.unitTarget, Math.max(0, t.unitDone + delta));
  if (unitDone !== t.unitDone) await put('tasks', { ...t, unitDone });
}

/* ---------- Questions practiced ---------- */

async function sumLogs(where: 'taskId' | 'chapterId', id: string): Promise<number> {
  const rows = await db.questionLogs.where(where).equals(id).toArray();
  return Math.max(0, rows.reduce((a, r) => (r.deleted ? a : a + r.count), 0));
}

/** Adds `delta` to this device's log for a source and day. The shown total never drops below zero. */
async function logQuestions(source: string, refs: Pick<QuestionLog, 'taskId' | 'chapterId' | 'subjectId'>, delta: number, total: number): Promise<number> {
  const step = Math.round(delta);
  const applied = Math.max(-total, step);
  if (applied === 0) return total;
  const now = Date.now();
  const day = dayKey(now);
  const id = questionLogId(getDeviceId(), source, day);
  const existing = await db.questionLogs.get(id);
  const live = existing && !existing.deleted ? existing : undefined;
  await put('questionLogs', {
    id,
    updatedAt: 0,
    day,
    ...refs,
    count: (live?.count ?? 0) + applied,
    createdAt: live?.createdAt ?? now,
    deleted: false,
  });
  return total + applied;
}

/** Questions practiced on a task. Also counts toward the task's chapter and subject. Returns the new task total. */
export async function addQuestions(taskId: string, delta: number): Promise<number> {
  const t = await db.tasks.get(taskId);
  if (!t || t.deleted) return 0;
  const total = await sumLogs('taskId', taskId);
  const next = await logQuestions(`t.${taskId}`, { taskId, chapterId: t.chapterId, subjectId: t.subjectId || null }, delta, total);
  if (next > total && t.chapterId) await touchChapter(t.chapterId);
  return next;
}

/** Sets a task's question total by logging the difference. */
export async function setTaskQuestions(taskId: string, value: number): Promise<number> {
  const total = await sumLogs('taskId', taskId);
  return addQuestions(taskId, Math.max(0, Math.round(value)) - total);
}

/** A manual adjustment on a chapter, separate from questions logged on its tasks. Returns the new chapter total. */
export async function addChapterQuestions(chapterId: string, delta: number): Promise<number> {
  const c = await db.chapters.get(chapterId);
  if (!c || c.deleted) return 0;
  const total = await sumLogs('chapterId', chapterId);
  const next = await logQuestions(`c.${chapterId}`, { taskId: null, chapterId, subjectId: c.subjectId }, delta, total);
  if (next > total) await touchChapter(chapterId);
  return next;
}

/**
 * General practice for a subject, not tied to a chapter or task. Counts for the subject, the day
 * and the totals. Returns the new subject-level total.
 */
export async function addSubjectQuestions(subjectId: string, delta: number): Promise<number> {
  const s = await db.subjects.get(subjectId);
  if (!s || s.deleted) return 0;
  const rows = (await db.questionLogs.toArray()).filter((r) => !r.deleted && r.subjectId === subjectId && r.taskId === null && r.chapterId === null);
  const total = Math.max(0, rows.reduce((a, r) => a + r.count, 0));
  return logQuestions(`s.${subjectId}`, { taskId: null, chapterId: null, subjectId }, delta, total);
}

/* ---------- Weekly class schedule ---------- */

async function getScheduleDay(weekday: number): Promise<ScheduleDay> {
  const id = scheduleDayId(weekday);
  const d = await db.scheduleDays.get(id);
  return d && !d.deleted ? d : { id, updatedAt: 0, weekday, active: false, slots: [] };
}

export interface SlotInput {
  start: string;
  end: string;
  label: string;
}

function cleanSlot(id: string, input: SlotInput): ScheduleSlot | null {
  const slot = { id, start: input.start, end: input.end, label: input.label.trim() || 'Class' };
  return isValidSlot(slot) ? slot : null;
}

export async function setScheduleDayActive(weekday: number, active: boolean): Promise<void> {
  await put('scheduleDays', { ...(await getScheduleDay(weekday)), active, deleted: false });
}

/** Adds a class block to a weekday and turns the day on. Returns false when the times are not valid. */
export async function addScheduleSlot(weekday: number, input: SlotInput): Promise<boolean> {
  const slot = cleanSlot(newId(), input);
  if (!slot) return false;
  const d = await getScheduleDay(weekday);
  await put('scheduleDays', { ...d, active: true, slots: sortSlots([...d.slots, slot]), deleted: false });
  return true;
}

export async function updateScheduleSlot(weekday: number, slotId: string, input: SlotInput): Promise<boolean> {
  const slot = cleanSlot(slotId, input);
  if (!slot) return false;
  const d = await getScheduleDay(weekday);
  await put('scheduleDays', { ...d, slots: sortSlots(d.slots.map((s) => (s.id === slotId ? slot : s))), deleted: false });
  return true;
}

export async function removeScheduleSlot(weekday: number, slotId: string): Promise<void> {
  const d = await getScheduleDay(weekday);
  await put('scheduleDays', { ...d, slots: d.slots.filter((s) => s.id !== slotId), deleted: false });
}

/** Replaces the classes on one date only. An empty list means no classes that day. */
export async function setDayOverride(date: string, list: SlotInput[]): Promise<boolean> {
  const clean = list.map((s, i) => cleanSlot(`o${i}-${s.start.replace(':', '')}`, s));
  if (clean.some((s) => s === null)) return false;
  await put('scheduleOverrides', { id: date, updatedAt: 0, date, slots: sortSlots(clean as ScheduleSlot[]), deleted: false });
  return true;
}

/** Goes back to the weekly schedule for a date. */
export async function clearDayOverride(date: string): Promise<void> {
  const o = await db.scheduleOverrides.get(date);
  if (o && !o.deleted) await remove('scheduleOverrides', date);
}

/** The slots that apply on a date, for editing a single day. */
export async function slotsForDate(date: string): Promise<ScheduleSlot[]> {
  const [days, overrides] = await Promise.all([db.scheduleDays.toArray(), db.scheduleOverrides.toArray()]);
  return effectiveSlots(date, days, overrides);
}

/** Edits or removes one scheduled block for a single date, leaving the weekly schedule alone. */
export async function overrideSlotForDate(date: string, slotId: string, input: SlotInput | null): Promise<boolean> {
  const current = await slotsForDate(date);
  const next = input === null ? current.filter((s) => s.id !== slotId) : current.map((s) => (s.id === slotId ? { ...s, ...input } : s));
  return setDayOverride(date, next);
}

/* ---------- Tests and deadlines ---------- */

export interface TestInput {
  title: string;
  kind: TestKind;
  date: string;
  repeatEveryDays: number | null;
  subjectIds: string[];
  chapterIds: string[];
  totalMarks: number | null;
  targetPercent: number | null;
}

function cleanTest(input: TestInput) {
  const every = input.repeatEveryDays !== null && Number.isFinite(input.repeatEveryDays) && input.repeatEveryDays >= 1 ? Math.min(365, Math.round(input.repeatEveryDays)) : null;
  const marks = input.totalMarks !== null && Number.isFinite(input.totalMarks) && input.totalMarks > 0 ? input.totalMarks : null;
  const target = input.targetPercent !== null && Number.isFinite(input.targetPercent) ? Math.min(100, Math.max(0, input.targetPercent)) : null;
  return {
    title: input.title.trim(),
    kind: input.kind,
    date: input.date,
    repeatEveryDays: every,
    subjectIds: [...new Set(input.subjectIds)],
    chapterIds: [...new Set(input.chapterIds)],
    totalMarks: marks,
    targetPercent: target,
  };
}

/** Creates a test, or saves changes when `id` is given. */
export async function saveTest(input: TestInput, id?: string): Promise<TestEvent> {
  const existing = id ? await db.tests.get(id) : undefined;
  if (existing && !existing.deleted) return put('tests', { ...existing, ...cleanTest(input) });
  return put('tests', { id: newId(), updatedAt: 0, seriesId: null, createdAt: Date.now(), ...cleanTest(input) });
}

/** Deletes a test and its result. Later occurrences of a repeating test are not affected. */
export async function deleteTest(id: string): Promise<void> {
  await remove('tests', id);
  const r = await db.testResults.get(id);
  if (r && !r.deleted) await remove('testResults', id);
}

/** Stops a test from repeating: no further occurrences are created. */
export async function stopTestRepeat(id: string): Promise<void> {
  await patch('tests', id, { repeatEveryDays: null });
}

/** Creates the next occurrence of repeating tests whose date has passed. Safe to call often. */
export async function ensureTestOccurrences(today: string): Promise<number> {
  const pending = pendingOccurrences(await db.tests.toArray(), today);
  for (const o of pending) {
    await put('tests', { ...o.from, id: o.id, seriesId: o.seriesId, date: o.date, createdAt: Date.now(), deleted: false });
  }
  return pending.length;
}

export interface ResultInput {
  scored: number;
  total: number;
  subjects: SubjectScore[];
  rank: number | null;
  percentile: number | null;
  mistakes: MistakeCounts;
  weakChapterIds: string[];
  reflection: string;
}

export async function saveTestResult(testId: string, input: ResultInput): Promise<TestResult> {
  const existing = await db.testResults.get(testId);
  const nonNeg = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
  const count = (n: number) => Math.round(nonNeg(n));
  return put('testResults', {
    id: testId,
    updatedAt: 0,
    testId,
    scored: nonNeg(input.scored),
    total: nonNeg(input.total),
    subjects: input.subjects.filter((s) => s.subjectId).map((s) => ({ subjectId: s.subjectId, scored: nonNeg(s.scored), total: nonNeg(s.total) })),
    rank: input.rank !== null && Number.isFinite(input.rank) && input.rank >= 1 ? Math.round(input.rank) : null,
    percentile: input.percentile !== null && Number.isFinite(input.percentile) ? Math.min(100, Math.max(0, input.percentile)) : null,
    mistakes: {
      conceptual: count(input.mistakes.conceptual),
      calculation: count(input.mistakes.calculation),
      timePressure: count(input.mistakes.timePressure),
      guessed: count(input.mistakes.guessed),
    },
    weakChapterIds: [...new Set(input.weakChapterIds)],
    reflection: input.reflection,
    createdAt: existing && !existing.deleted ? existing.createdAt : Date.now(),
    deleted: false,
  });
}

export async function deleteTestResult(testId: string): Promise<void> {
  await remove('testResults', testId);
}

/**
 * Adds a "Fix weak chapter" task to Current Topics for each weak chapter of a result. Ids are
 * fixed per test and chapter, so pressing the button again does not add copies. Returns how
 * many tasks were created.
 */
export async function createFixTasks(testId: string): Promise<number> {
  const result = await db.testResults.get(testId);
  if (!result || result.deleted) return 0;
  let created = 0;
  for (const chapterId of result.weakChapterIds) {
    const chapter = await db.chapters.get(chapterId);
    if (!chapter || chapter.deleted) continue;
    const id = fixTaskId(testId, chapterId);
    const existing = await db.tasks.get(id);
    if (existing && !existing.deleted) continue;
    const count = await db.tasks.count();
    await put('tasks', {
      id,
      updatedAt: 0,
      title: `Fix weak chapter: ${chapter.title}`,
      subjectId: chapter.subjectId,
      chapterId,
      kind: 'revision',
      targetQuestions: null,
      category: 'current',
      column: 'current',
      priority: 'high-yield',
      dueDate: null,
      targetMode: 'pomodoro',
      estimatedPomodoros: 2,
      pomodoroMinutes: 25,
      unitTarget: 10,
      unitLabel: 'Questions',
      unitDone: 0,
      subtasks: FIX_STEPS.map((label, i) => ({ id: `${id}-st${i}`, label, done: false })),
      quickRevision: false,
      savedSubtasks: null,
      savedEstimate: null,
      filters: { examWeightage: true, activeRecall: true, requiredForClass: false },
      mesh: (count % 4) as Task['mesh'],
      repeat: { ...NO_REPEAT },
      reminderTime: null,
      seriesId: null,
      createdAt: Date.now(),
      completedAt: null,
      deleted: false,
    });
    created++;
  }
  return created;
}

const FIX_STEPS = ['Revise the theory and formulas', 'Redo the questions I got wrong', 'Practice 10 new questions'];

export async function rescheduleUnfinished(today: string, target: RescheduleTarget): Promise<number> {
  const tasks = (await db.tasks.toArray()).filter((t) => !t.deleted);
  const updated = rescheduleTasks(tasks, today, target);
  await putMany('tasks', updated);
  return updated.length;
}

/* ---------- Focus sessions and breaks ---------- */

const MIN_LOG_MS = MINUTE;

const runMs = (run: CompletedRun) => run.segments.reduce((a, s) => a + Math.max(0, s.end - s.start), 0);

/**
 * Logs a finished focus run. The id comes from the first segment, so tabs that log the same
 * run write one record. Runs shorter than a minute are not kept, except Strict Mode failures,
 * which are kept as a record of the attempt.
 */
export async function addSession(run: CompletedRun, status: SessionStatus = 'completed'): Promise<FocusSession | null> {
  if (run.phase !== 'focus' || run.segments.length === 0) return null;
  const durationMs = runMs(run);
  if (status === 'completed' && durationMs < MIN_LOG_MS) return null;
  const task = run.taskId ? await db.tasks.get(run.taskId) : undefined;
  const live = task && !task.deleted ? task : undefined;
  const start = run.segments[0].start;
  const end = run.segments[run.segments.length - 1].end;
  // A Test Mode section names its subject; the task's chapter applies only inside that subject.
  const section = run.mode === 'test' ? run.sectionSubjectId : null;
  const subjectId = section ?? live?.subjectId ?? null;
  const chapterId = section && live?.subjectId !== section ? null : (live?.chapterId ?? null);
  const session = await put('focusSessions', {
    id: `run-${start}`,
    updatedAt: 0,
    taskId: live?.id ?? null,
    subjectId,
    chapterId,
    category: live?.category ?? null,
    quickRevision: live?.quickRevision ?? false,
    mode: run.mode,
    status,
    segments: run.segments,
    start,
    end,
    durationMs,
    plannedMinutes: Math.round(run.targetMs / MINUTE),
    createdAt: start,
  });
  if (status === 'completed' && chapterId) await touchChapter(chapterId, end);
  return session;
}

/** Notes that a backup file was saved, which hides the backup reminder for 7 days on every device. */
export async function recordBackup(at = Date.now()): Promise<void> {
  await updateSettings({ lastBackupAt: at });
}

/** Logs a break from the timer as a break block on the timeline. */
export async function addBreakFromRun(run: CompletedRun): Promise<void> {
  if (run.phase !== 'break' || run.segments.length === 0 || runMs(run) < MIN_LOG_MS) return;
  const start = run.segments[0].start;
  await put('blocks', {
    id: `break-${start}`,
    updatedAt: 0,
    kind: 'break',
    label: run.breakKind === 'long' ? 'Long break' : 'Break',
    start,
    end: run.segments[run.segments.length - 1].end,
  });
}

export async function addBlock(kind: BlockKind, label: string, start: number, end: number): Promise<void> {
  await put('blocks', { id: newId(), updatedAt: 0, kind, label: label.trim() || (kind === 'class' ? 'Class' : 'Break'), start, end });
}

export async function deleteBlock(id: string): Promise<void> {
  await remove('blocks', id);
}

/* ---------- Quick notes ---------- */

export async function addNote(text: string, context: string): Promise<QuickNote | null> {
  const clean = text.trim();
  if (!clean) return null;
  return put('quickNotes', { id: newId(), updatedAt: 0, text: clean, context: context.trim() || 'General', createdAt: Date.now(), resolved: false });
}

export async function setNoteResolved(id: string, resolved: boolean): Promise<void> {
  await patch('quickNotes', id, { resolved });
}

export async function deleteNote(id: string): Promise<void> {
  await remove('quickNotes', id);
}

/* ---------- Days ---------- */

async function getDay(day: string): Promise<DayMeta> {
  return (await db.days.get(day)) ?? { id: day, updatedAt: 0, restDay: false, dailyNote: '', rootCauses: [] };
}

export async function setRestDay(day: string, restDay: boolean): Promise<void> {
  await put('days', { ...(await getDay(day)), restDay, deleted: false });
}

export async function setDailyNote(day: string, dailyNote: string): Promise<void> {
  await put('days', { ...(await getDay(day)), dailyNote, deleted: false });
}

/** Taps a "What went wrong?" reason on or off for a day. */
export async function toggleRootCause(day: string, cause: RootCause): Promise<void> {
  const d = await getDay(day);
  const current = cleanRootCauses(d.deleted ? [] : d.rootCauses);
  const next = current.includes(cause) ? current.filter((c) => c !== cause) : cleanRootCauses([...current, cause]);
  await put('days', { ...d, rootCauses: next, restDay: d.deleted ? false : d.restDay, dailyNote: d.deleted ? '' : d.dailyNote, deleted: false });
}

/* ---------- Hydration ---------- */

export const MAX_GLASSES = 40;

export async function changeHydration(day: string, delta: number, goal: number): Promise<number> {
  const current = await db.hydrationLogs.get(day);
  const before = current && !current.deleted ? current.glassesCount : 0;
  const glassesCount = Math.min(MAX_GLASSES, Math.max(0, before + delta));
  await put('hydrationLogs', { id: day, updatedAt: 0, date: day, glassesCount, dailyTarget: Math.max(1, goal), deleted: false });
  return glassesCount;
}

/* ---------- Reflection questions ---------- */

async function liveQuestions(): Promise<ReflectionQuestion[]> {
  return (await db.reflectionQuestions.toArray()).filter((q) => !q.deleted).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function addQuestion(text: string): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  const qs = await liveQuestions();
  const order = qs.reduce((m, q) => Math.max(m, q.order + 1), 0);
  await put('reflectionQuestions', { id: newId(), updatedAt: 0, text: clean, order, builtIn: false, createdAt: Date.now() });
}

export async function updateQuestion(id: string, text: string): Promise<void> {
  const clean = text.trim();
  if (clean) await patch('reflectionQuestions', id, { text: clean });
}

export async function deleteQuestion(id: string): Promise<void> {
  await remove('reflectionQuestions', id);
}

/** Moves a question one place up or down, renumbering the list. */
export async function moveQuestion(id: string, dir: -1 | 1): Promise<void> {
  const qs = await liveQuestions();
  const i = qs.findIndex((q) => q.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= qs.length) return;
  const original = new Map(qs.map((q) => [q.id, q.order]));
  [qs[i], qs[j]] = [qs[j], qs[i]];
  const changed = qs.map((q, order) => ({ ...q, order })).filter((q) => original.get(q.id) !== q.order);
  await putMany('reflectionQuestions', changed);
}

/** Adds the built-in questions on a new device. A question the student deleted stays deleted. */
export async function ensureBuiltinQuestions(): Promise<void> {
  const existing = await db.reflectionQuestions.bulkGet(BUILTIN_QUESTIONS.map((q) => q.id));
  const missing = BUILTIN_QUESTIONS.filter((_, i) => existing[i] === undefined);
  if (missing.length) await db.reflectionQuestions.bulkAdd(missing);
}

/* ---------- Evening reviews ---------- */

async function getReview(date: string): Promise<EveningReview> {
  const r = await db.eveningReviews.get(date);
  return r && !r.deleted ? r : { id: date, updatedAt: 0, date, answersByQuestionId: {}, hydrationCount: 0, tomorrowFirstTaskId: null };
}

async function hydrationOn(date: string): Promise<number> {
  const log = await db.hydrationLogs.get(date);
  return log && !log.deleted ? log.glassesCount : 0;
}

export async function saveReflectionAnswer(date: string, questionId: string, text: string): Promise<void> {
  const r = await getReview(date);
  if ((r.answersByQuestionId[questionId] ?? '') === text) return;
  const answers = { ...r.answersByQuestionId };
  if (text.trim()) answers[questionId] = text;
  else delete answers[questionId];
  await put('eveningReviews', { ...r, answersByQuestionId: answers, hydrationCount: await hydrationOn(date), deleted: false });
}

/** Chooses the task to queue on the timer the day after `date`. */
export async function setTomorrowFirstTask(date: string, taskId: string | null): Promise<void> {
  const r = await getReview(date);
  await put('eveningReviews', { ...r, tomorrowFirstTaskId: taskId, hydrationCount: await hydrationOn(date), deleted: false });
}

/* ---------- Goals ---------- */

export async function saveGoal(goal: Partial<Goal> & Pick<Goal, 'title' | 'target' | 'unit'>): Promise<Goal> {
  const existing = goal.id ? await db.goals.get(goal.id) : undefined;
  return put('goals', {
    id: existing?.id ?? newId(),
    updatedAt: 0,
    createdAt: existing?.createdAt ?? Date.now(),
    progress: 0,
    ...existing,
    ...goal,
    title: goal.title.trim(),
    target: Math.max(1, goal.target),
  } as Goal);
}

export async function deleteGoal(id: string): Promise<void> {
  await remove('goals', id);
}

/* ---------- Custom audio (this device only) ---------- */

export const MAX_TRACKS = 5;
export const MAX_TRACK_BYTES = 60 * 1024 * 1024;

export class AudioFileError extends Error {}

export function isAudioFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|oga|wav|flac|webm)$/i.test(file.name);
}

export async function addAudioFile(file: File): Promise<CustomAudioFile> {
  if (!isAudioFile(file)) throw new AudioFileError('This file is not an audio file.');
  if (file.size > MAX_TRACK_BYTES) throw new AudioFileError('This file is larger than 60 MB.');
  if ((await db.customAudioFiles.count()) >= MAX_TRACKS) throw new AudioFileError(`You can keep up to ${MAX_TRACKS} tracks. Delete one to add another.`);
  const record: CustomAudioFile = {
    id: newId(),
    name: file.name.replace(/\.[a-z0-9]+$/i, '') || 'Track',
    type: file.type || 'audio/mpeg',
    size: file.size,
    blob: file,
    createdAt: Date.now(),
  };
  await db.customAudioFiles.add(record);
  return record;
}

export async function renameAudioFile(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (clean) await db.customAudioFiles.update(id, { name: clean });
}

export async function deleteAudioFile(id: string): Promise<void> {
  await db.customAudioFiles.delete(id);
}

export async function getAudioBlob(id: string): Promise<Blob | null> {
  return (await db.customAudioFiles.get(id))?.blob ?? null;
}

/* ---------- Backups and data management ---------- */

export async function exportSnapshot(): Promise<Snapshot> {
  const tables = {} as Snapshot['tables'];
  for (const name of TABLE_NAMES) {
    (tables as Record<string, Syncable[]>)[name] = await allRecords(name);
  }
  return { app: 'study-space', version: 3, exportedAt: Date.now(), tables };
}

/** Merges a backup with last-write-wins rules. Returns how many records changed. */
export async function importSnapshot(snapshot: Snapshot): Promise<number> {
  let changed = 0;
  for (const name of TABLE_NAMES) {
    const winners = await applyRemote(name, snapshot.tables[name]);
    if (winners.length) listener?.(name, winners);
    changed += winners.length;
  }
  return changed;
}

/**
 * Resets to the empty state on this device and every synced device: every synced record
 * becomes a tombstone, settings return to defaults, the built-in questions come back, and
 * uploaded tracks on this device are deleted.
 */
export async function factoryReset(): Promise<number> {
  let count = 0;
  for (const name of TABLE_NAMES) {
    if (name === 'userSettings') continue;
    const rows = (await allRecords(name)).filter((r) => !r.deleted);
    await putMany(name, rows.map((r) => ({ ...r, deleted: true })));
    count += rows.length;
  }
  await put('userSettings', { ...DEFAULT_SETTINGS });
  await putMany(
    'reflectionQuestions',
    BUILTIN_QUESTIONS.map((q) => ({ ...q })),
  );
  await db.customAudioFiles.clear();
  return count;
}

export { NO_REPEAT };
