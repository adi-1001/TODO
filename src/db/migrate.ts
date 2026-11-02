import type {
  Block,
  Category,
  Chapter,
  ChapterStatus,
  Column,
  DayMeta,
  EveningReview,
  FocusSession,
  Goal,
  HydrationLog,
  MeshIndex,
  MistakeCounts,
  Priority,
  QuestionLog,
  QuickNote,
  ReflectionQuestion,
  RepeatKind,
  RepeatRule,
  RootCause,
  ScheduleDay,
  ScheduleOverride,
  ScheduleSlot,
  Segment,
  SessionMode,
  SessionStatus,
  Subject,
  SubjectScore,
  Subtask,
  Syncable,
  TableMap,
  TableName,
  TargetMode,
  Task,
  TaskFilters,
  TaskKind,
  TestEvent,
  TestKind,
  TestResult,
  UserSettings,
} from '../types';
import { TABLE_NAMES } from '../types';
import { DEFAULT_SETTINGS, NO_REPEAT } from './defaults';
import { cleanMetricIds } from '../lib/metrics';
import { isQuestionUnit } from '../lib/questions';
import { isValidSlot } from '../lib/schedule';
import { dayKey } from '../lib/time';

/**
 * Pure converters that turn any stored or received record (version 1 or 2) into a valid
 * version 2 record. Every function fills missing fields with defaults and is idempotent.
 */

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

function base(r: Raw): Syncable {
  const out: Syncable = { id: str(r.id, ''), updatedAt: num(r.updatedAt, 0) };
  if (r.deleted === true) out.deleted = true;
  return out;
}

function subtasks(v: unknown): Subtask[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).map((s, i) => ({ id: str(s.id, `st-${i}`), label: str(s.label, ''), done: bool(s.done, false) }));
}

function segments(v: unknown): Segment[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .map((s) => ({ start: num(s.start, 0), end: num(s.end, 0) }))
    .filter((s) => s.start > 0 && s.end >= s.start);
}

function filters(v: unknown): TaskFilters {
  const f = isObj(v) ? v : {};
  return { examWeightage: bool(f.examWeightage, false), activeRecall: bool(f.activeRecall, false), requiredForClass: bool(f.requiredForClass, false) };
}

const REPEAT_KINDS: RepeatKind[] = ['never', 'daily', 'weekdays', 'weekly', 'interval'];

function repeat(v: unknown): RepeatRule {
  if (!isObj(v)) return { ...NO_REPEAT };
  return { kind: oneOf(v.kind, REPEAT_KINDS, 'never'), intervalDays: clampInt(num(v.intervalDays, 2), 1, 365) };
}

const CATEGORIES: Category[] = ['current', 'pending'];
const COLUMNS: Column[] = ['current', 'pending', 'completed'];
const PRIORITIES: Priority[] = ['urgent', 'high-yield', 'normal'];
const TARGETS: TargetMode[] = ['pomodoro', 'unit', 'none'];
const MODES: SessionMode[] = ['pomodoro', 'quickstart', 'stopwatch', 'test'];
const STATUSES: SessionStatus[] = ['completed', 'failed_strict'];
const CHAPTER_STATUSES: ChapterStatus[] = ['not_started', 'ongoing', 'practice_pending', 'completed'];
const TASK_KINDS: TaskKind[] = ['homework', 'backlog', 'lecture', 'revision'];
const ROOT_CAUSE_IDS: RootCause[] = ['exhausted', 'stuck', 'slow', 'lecture', 'distraction', 'unplanned'];

/** Known reasons only, once each, in the fixed list order. */
export function cleanRootCauses(v: unknown): RootCause[] {
  if (!Array.isArray(v)) return [];
  return ROOT_CAUSE_IDS.filter((id) => v.includes(id));
}

export function normalizeTask(r: Raw): Task {
  const category = oneOf(r.category, CATEGORIES, 'current');
  const unitTarget = clampInt(num(r.unitTarget, 10), 1, 100_000);
  return {
    ...base(r),
    title: str(r.title, ''),
    subjectId: str(r.subjectId, ''),
    chapterId: strOrNull(r.chapterId),
    kind: TASK_KINDS.includes(r.kind as TaskKind) ? (r.kind as TaskKind) : null,
    targetQuestions: typeof r.targetQuestions === 'number' && Number.isFinite(r.targetQuestions) && r.targetQuestions >= 1 ? clampInt(r.targetQuestions, 1, 100_000) : null,
    category,
    column: oneOf(r.column, COLUMNS, category),
    priority: oneOf(r.priority, PRIORITIES, 'normal'),
    dueDate: strOrNull(r.dueDate),
    targetMode: oneOf(r.targetMode, TARGETS, 'pomodoro'),
    estimatedPomodoros: clampInt(num(r.estimatedPomodoros, 1), 0, 200),
    pomodoroMinutes: clampInt(num(r.pomodoroMinutes, 25), 1, 240),
    unitTarget,
    unitLabel: str(r.unitLabel, 'Questions'),
    unitDone: clampInt(num(r.unitDone, 0), 0, unitTarget),
    subtasks: subtasks(r.subtasks),
    quickRevision: bool(r.quickRevision, false),
    savedSubtasks: Array.isArray(r.savedSubtasks) ? subtasks(r.savedSubtasks) : null,
    savedEstimate: typeof r.savedEstimate === 'number' ? r.savedEstimate : null,
    filters: filters(r.filters),
    mesh: clampInt(num(r.mesh, 0), 0, 3) as MeshIndex,
    repeat: repeat(r.repeat),
    reminderTime: typeof r.reminderTime === 'string' && /^\d{2}:\d{2}$/.test(r.reminderTime) ? r.reminderTime : null,
    seriesId: strOrNull(r.seriesId),
    createdAt: num(r.createdAt, 0),
    completedAt: typeof r.completedAt === 'number' ? r.completedAt : null,
  };
}

export function normalizeSession(r: Raw): FocusSession {
  const segs = segments(r.segments);
  const start = segs.length ? segs[0].start : num(r.start, 0);
  const end = segs.length ? segs[segs.length - 1].end : num(r.end, start);
  const durationMs = segs.reduce((a, s) => a + (s.end - s.start), 0);
  const category = r.category === 'current' || r.category === 'pending' ? r.category : null;
  return {
    ...base(r),
    taskId: strOrNull(r.taskId),
    subjectId: strOrNull(r.subjectId),
    chapterId: strOrNull(r.chapterId),
    category,
    quickRevision: bool(r.quickRevision, false),
    mode: oneOf(r.mode, MODES, 'pomodoro'),
    status: oneOf(r.status, STATUSES, 'completed'),
    segments: segs,
    start,
    end,
    durationMs,
    plannedMinutes: Math.max(0, num(r.plannedMinutes, 0)),
    createdAt: num(r.createdAt, start),
  };
}

/** Version 1 notes had topic, mode and status; version 2 has context and resolved. */
export function normalizeNote(r: Raw): QuickNote {
  const legacyContext = [str(r.topic, ''), str(r.mode, '')].filter(Boolean).join(', ');
  return {
    ...base(r),
    text: str(r.text, ''),
    context: typeof r.context === 'string' ? r.context : legacyContext || 'General',
    createdAt: num(r.createdAt, 0),
    resolved: typeof r.resolved === 'boolean' ? r.resolved : r.status === 'done',
  };
}

/** Version 1 settings used studentName and kept bell preferences on the device. */
export function normalizeSettings(r: Raw): UserSettings {
  const d = DEFAULT_SETTINGS;
  const legacyName = str(r.studentName, '');
  return {
    ...base(r),
    id: 'app',
    displayName: typeof r.displayName === 'string' ? r.displayName : legacyName === 'Student' ? '' : legacyName,
    avatarDataUrl: typeof r.avatarDataUrl === 'string' && r.avatarDataUrl.startsWith('data:image/') ? r.avatarDataUrl : null,
    targetExamTitle: str(r.targetExamTitle, d.targetExamTitle),
    targetExamDate: strOrNull(r.targetExamDate),
    dailyGoalMinutes: clampInt(num(r.dailyGoalMinutes, d.dailyGoalMinutes), 15, 24 * 60),
    hydrationGoal: clampInt(num(r.hydrationGoal, d.hydrationGoal), 1, 30),
    defaultPomodoroMinutes: clampInt(num(r.defaultPomodoroMinutes, d.defaultPomodoroMinutes), 1, 240),
    shortBreakMinutes: clampInt(num(r.shortBreakMinutes, d.shortBreakMinutes), 0, 60),
    longBreakMinutes: clampInt(num(r.longBreakMinutes, d.longBreakMinutes), 0, 120),
    longBreakEvery: clampInt(num(r.longBreakEvery, d.longBreakEvery), 1, 12),
    clockStyle: oneOf(r.clockStyle, ['flip', 'digital'] as const, d.clockStyle),
    eyeRestEnabled: bool(r.eyeRestEnabled, d.eyeRestEnabled),
    bellEnabled: bool(r.bellEnabled, d.bellEnabled),
    bellIntervalMinutes: clampInt(num(r.bellIntervalMinutes, d.bellIntervalMinutes), 1, 120),
    overviewMetrics: cleanMetricIds(r.overviewMetrics, d.overviewMetrics),
    reviewMetrics: cleanMetricIds(r.reviewMetrics, d.reviewMetrics),
    streakThresholdPercent: clampInt(num(r.streakThresholdPercent, d.streakThresholdPercent), 50, 100),
    lastBackupAt: typeof r.lastBackupAt === 'number' && Number.isFinite(r.lastBackupAt) && r.lastBackupAt > 0 ? r.lastBackupAt : null,
  };
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const dayOr = (v: unknown, d: string): string => (typeof v === 'string' && DAY_KEY.test(v) ? v : d);
const strList = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))] : []);
const numOrNull = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

function normalizeQuestionLog(r: Raw): QuestionLog {
  const createdAt = num(r.createdAt, 0);
  return {
    ...base(r),
    day: dayOr(r.day, createdAt > 0 ? dayKey(createdAt) : '1970-01-01'),
    taskId: strOrNull(r.taskId),
    chapterId: strOrNull(r.chapterId),
    subjectId: strOrNull(r.subjectId),
    count: Math.round(num(r.count, 0)),
    createdAt,
  };
}

function slots(v: unknown): ScheduleSlot[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .map((s, i) => ({ id: str(s.id, `slot-${i}`), start: str(s.start, ''), end: str(s.end, ''), label: str(s.label, 'Class') }))
    .filter(isValidSlot);
}

function normalizeScheduleDay(r: Raw): ScheduleDay {
  const b = base(r);
  const fromId = /^weekday-([0-6])$/.exec(b.id);
  return { ...b, weekday: clampInt(num(r.weekday, fromId ? Number(fromId[1]) : 0), 0, 6), active: bool(r.active, false), slots: slots(r.slots) };
}

function normalizeScheduleOverride(r: Raw): ScheduleOverride {
  const b = base(r);
  return { ...b, date: dayOr(r.date, b.id), slots: slots(r.slots) };
}

const TEST_KINDS: TestKind[] = ['coaching', 'unit', 'assignment', 'other'];

function normalizeTest(r: Raw): TestEvent {
  const every = typeof r.repeatEveryDays === 'number' && r.repeatEveryDays >= 1 ? clampInt(r.repeatEveryDays, 1, 365) : null;
  return {
    ...base(r),
    title: str(r.title, ''),
    kind: oneOf(r.kind, TEST_KINDS, 'coaching'),
    date: dayOr(r.date, '1970-01-01'),
    repeatEveryDays: every,
    seriesId: strOrNull(r.seriesId),
    subjectIds: strList(r.subjectIds),
    chapterIds: strList(r.chapterIds),
    totalMarks: numOrNull(r.totalMarks, 1, 100_000),
    targetPercent: numOrNull(r.targetPercent, 0, 100),
    createdAt: num(r.createdAt, 0),
  };
}

function mistakes(v: unknown): MistakeCounts {
  const m = isObj(v) ? v : {};
  const n = (x: unknown) => clampInt(num(x, 0), 0, 10_000);
  return { conceptual: n(m.conceptual), calculation: n(m.calculation), timePressure: n(m.timePressure), guessed: n(m.guessed) };
}

function normalizeTestResult(r: Raw): TestResult {
  const b = base(r);
  const subjects: SubjectScore[] = Array.isArray(r.subjects)
    ? r.subjects.filter(isObj).map((s) => ({ subjectId: str(s.subjectId, ''), scored: Math.max(0, num(s.scored, 0)), total: Math.max(0, num(s.total, 0)) })).filter((s) => s.subjectId)
    : [];
  return {
    ...b,
    testId: str(r.testId, b.id),
    scored: Math.max(0, num(r.scored, 0)),
    total: Math.max(0, num(r.total, 0)),
    subjects,
    rank: numOrNull(r.rank, 1, 10_000_000),
    percentile: numOrNull(r.percentile, 0, 100),
    mistakes: mistakes(r.mistakes),
    weakChapterIds: strList(r.weakChapterIds),
    reflection: str(r.reflection, ''),
    createdAt: num(r.createdAt, 0),
  };
}

/**
 * Question logs that carry over version 2 counters: `problemsSolved` and question-word unit
 * counts on tasks, and `pastQuestionsSolved` on chapters. Ids are deterministic, so two
 * devices (or an upgrade followed by a backup import) write the same records instead of
 * adding the questions twice. Logs are dated to the record's own day, not today.
 */
export function legacyQuestionLogs(tasks: unknown[], chapters: unknown[], stampAt: number): QuestionLog[] {
  const out: QuestionLog[] = [];
  const chapterSubject = new Map<string, string>();
  for (const c of chapters) {
    if (isObj(c) && typeof c.id === 'string' && typeof c.subjectId === 'string') chapterSubject.set(c.id, c.subjectId);
  }
  for (const t of tasks) {
    if (!isObj(t) || typeof t.id !== 'string' || t.deleted === true) continue;
    const problems = Math.max(0, Math.round(num(t.problemsSolved, 0)));
    const label = str(t.unitLabel, '');
    const units = t.targetMode === 'unit' && isQuestionUnit(label) ? Math.max(0, Math.round(num(t.unitDone, 0))) : 0;
    const count = Math.max(problems, units);
    if (count === 0) continue;
    const at = num(t.completedAt, 0) || num(t.createdAt, 0) || stampAt;
    out.push({
      id: `q-v2-task-${t.id}`,
      updatedAt: stampAt,
      day: dayKey(at),
      taskId: t.id,
      chapterId: strOrNull(t.chapterId),
      subjectId: strOrNull(t.subjectId),
      count,
      createdAt: at,
    });
  }
  for (const c of chapters) {
    if (!isObj(c) || typeof c.id !== 'string' || c.deleted === true) continue;
    const count = Math.max(0, Math.round(num(c.pastQuestionsSolved, 0)));
    if (count === 0) continue;
    const at = num(c.createdAt, 0) || stampAt;
    out.push({ id: `q-v2-chapter-${c.id}`, updatedAt: stampAt, day: dayKey(at), taskId: null, chapterId: c.id, subjectId: chapterSubject.get(c.id) ?? null, count, createdAt: at });
  }
  return out;
}

/** Question-word unit tasks count through the logs after the carry-over, so their unit count resets. */
export function clearLegacyUnitCount(t: Raw): Raw {
  if (t.targetMode === 'unit' && isQuestionUnit(str(t.unitLabel, ''))) return { ...t, unitDone: 0 };
  return t;
}

export function normalizeChapter(r: Raw): Chapter {
  return {
    ...base(r),
    subjectId: str(r.subjectId, ''),
    title: str(r.title, ''),
    order: num(r.order, 0),
    status: oneOf(r.status, CHAPTER_STATUSES, 'not_started'),
    theoryDone: bool(r.theoryDone, false),
    referenceBookDone: bool(r.referenceBookDone, bool(r.practiceDone, false)),
    pyqDone: bool(r.pyqDone, false),
    revisionDone: bool(r.revisionDone, false),
    lastStudiedAt: typeof r.lastStudiedAt === 'number' && Number.isFinite(r.lastStudiedAt) && r.lastStudiedAt > 0 ? r.lastStudiedAt : null,
    targetQuestions: typeof r.targetQuestions === 'number' && Number.isFinite(r.targetQuestions) && r.targetQuestions >= 1 ? clampInt(r.targetQuestions, 1, 100_000) : null,
    createdAt: num(r.createdAt, 0),
  };
}

function normalizeSubject(r: Raw): Subject {
  return { ...base(r), name: str(r.name, ''), color: str(r.color, '#A1A1AA'), order: num(r.order, 0) };
}

function normalizeBlock(r: Raw): Block {
  return { ...base(r), kind: r.kind === 'class' ? 'class' : 'break', label: str(r.label, ''), start: num(r.start, 0), end: num(r.end, 0) };
}

function normalizeDay(r: Raw): DayMeta {
  return { ...base(r), restDay: bool(r.restDay, false), dailyNote: str(r.dailyNote, ''), rootCauses: cleanRootCauses(r.rootCauses) };
}

function normalizeHydration(r: Raw): HydrationLog {
  const b = base(r);
  return { ...b, date: str(r.date, b.id), glassesCount: clampInt(num(r.glassesCount, 0), 0, 40), dailyTarget: clampInt(num(r.dailyTarget, 8), 1, 30) };
}

function normalizeQuestion(r: Raw): ReflectionQuestion {
  return { ...base(r), text: str(r.text, ''), order: num(r.order, 0), builtIn: bool(r.builtIn, false), createdAt: num(r.createdAt, 0) };
}

function normalizeReview(r: Raw): EveningReview {
  const b = base(r);
  const answers: Record<string, string> = {};
  if (isObj(r.answersByQuestionId)) {
    for (const [k, v] of Object.entries(r.answersByQuestionId)) if (typeof v === 'string') answers[k] = v;
  }
  return {
    ...b,
    date: str(r.date, b.id),
    answersByQuestionId: answers,
    hydrationCount: Math.max(0, Math.round(num(r.hydrationCount, 0))),
    tomorrowFirstTaskId: strOrNull(r.tomorrowFirstTaskId),
  };
}

function normalizeGoal(r: Raw): Goal {
  return {
    ...base(r),
    title: str(r.title, ''),
    target: Math.max(1, num(r.target, 1)),
    progress: Math.max(0, num(r.progress, 0)),
    unit: str(r.unit, 'sessions'),
    createdAt: num(r.createdAt, 0),
  };
}

const NORMALIZERS: { [K in TableName]: (r: Raw) => TableMap[K] } = {
  subjects: normalizeSubject,
  chapters: normalizeChapter,
  tasks: normalizeTask,
  focusSessions: normalizeSession,
  blocks: normalizeBlock,
  quickNotes: normalizeNote,
  days: normalizeDay,
  hydrationLogs: normalizeHydration,
  reflectionQuestions: normalizeQuestion,
  eveningReviews: normalizeReview,
  goals: normalizeGoal,
  userSettings: normalizeSettings,
  questionLogs: normalizeQuestionLog,
  scheduleDays: normalizeScheduleDay,
  scheduleOverrides: normalizeScheduleOverride,
  tests: normalizeTest,
  testResults: normalizeTestResult,
};

/** Version 1 table names and where their records live now. */
export const LEGACY_TABLES: Record<string, TableName> = {
  sessions: 'focusSessions',
  notes: 'quickNotes',
  settings: 'userSettings',
};

export function resolveTable(name: string): TableName | null {
  if ((TABLE_NAMES as string[]).includes(name)) return name as TableName;
  return LEGACY_TABLES[name] ?? null;
}

/** Returns a valid version 2 record, or null when the value has no id or updatedAt. */
export function normalizeRecord<K extends TableName>(table: K, value: unknown): TableMap[K] | null {
  if (!isObj(value)) return null;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;
  if (typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) return null;
  return NORMALIZERS[table](value);
}

export function normalizeMany<K extends TableName>(table: K, values: unknown[]): TableMap[K][] {
  const out: TableMap[K][] = [];
  for (const v of values) {
    const r = normalizeRecord(table, v);
    if (r) out.push(r);
  }
  return out;
}

/** True for a record from the version 1 first-run seed that was never edited. */
export function isUntouchedSeed(r: { id: string; updatedAt: number; deleted?: boolean }): boolean {
  return r.id.startsWith('seed-') && r.updatedAt === 1 && !r.deleted;
}
