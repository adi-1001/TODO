export interface Syncable {
  id: string;
  updatedAt: number;
  deleted?: boolean;
}

export type Category = 'current' | 'pending';
export type Column = 'current' | 'pending' | 'completed';
export type Priority = 'urgent' | 'high-yield' | 'normal';
export type MeshIndex = 0 | 1 | 2 | 3;

export interface Subject extends Syncable {
  name: string;
  color: string;
  order: number;
}

/** `practice_pending`: notes done, reference book or PYQ practice still left. */
export type ChapterStatus = 'not_started' | 'ongoing' | 'practice_pending' | 'completed';

export interface Chapter extends Syncable {
  subjectId: string;
  title: string;
  order: number;
  status: ChapterStatus;
  theoryDone: boolean;
  /** Reference book or coaching module questions done. Version 4 practiceDone maps here. */
  referenceBookDone: boolean;
  /** Past year questions done. */
  pyqDone: boolean;
  revisionDone: boolean;
  /**
   * Last time the chapter was studied: a focus session on it, a question added to it or its
   * tasks, Revision Done checked, the chapter marked Completed, or a linked task completed.
   * Null until one of those happens.
   */
  lastStudiedAt: number | null;
  /** Questions to practise for this chapter (for example 120 for a reference book), or null. */
  targetQuestions: number | null;
  createdAt: number;
}

export interface Subtask {
  id: string;
  label: string;
  done: boolean;
}

export interface TaskFilters {
  examWeightage: boolean;
  activeRecall: boolean;
  requiredForClass: boolean;
}

export type TargetMode = 'pomodoro' | 'unit' | 'none';
export type RepeatKind = 'never' | 'daily' | 'weekdays' | 'weekly' | 'interval';

export interface RepeatRule {
  kind: RepeatKind;
  /** Used when kind is 'interval'. */
  intervalDays: number;
}

/**
 * What kind of work a task is, for backlog triage. `homework`: today's live homework, finished
 * first so no new backlog forms. `backlog`: reference book or sheet catch-up on past chapters.
 */
export type TaskKind = 'homework' | 'backlog' | 'lecture' | 'revision';

export interface Task extends Syncable {
  title: string;
  subjectId: string;
  chapterId: string | null;
  /** Task Category for backlog triage, or null when not set (tasks from older versions). */
  kind: TaskKind | null;
  /** Questions the task aims for (for example 60), or null for no question goal. */
  targetQuestions: number | null;
  category: Category;
  column: Column;
  priority: Priority;
  /** Local day key YYYY-MM-DD, or null when undated. */
  dueDate: string | null;
  targetMode: TargetMode;
  estimatedPomodoros: number;
  pomodoroMinutes: number;
  unitTarget: number;
  unitLabel: string;
  unitDone: number;
  subtasks: Subtask[];
  quickRevision: boolean;
  savedSubtasks: Subtask[] | null;
  savedEstimate: number | null;
  filters: TaskFilters;
  mesh: MeshIndex;
  repeat: RepeatRule;
  /** "HH:MM" local time, or null. */
  reminderTime: string | null;
  /** Id of the first task of a repeating series. */
  seriesId: string | null;
  createdAt: number;
  completedAt: number | null;
}

/** A span in epoch milliseconds during which the timer was running. */
export interface Segment {
  start: number;
  end: number;
}

export type SessionMode = 'pomodoro' | 'quickstart' | 'stopwatch' | 'test';
export type SessionStatus = 'completed' | 'failed_strict';

export interface FocusSession extends Syncable {
  taskId: string | null;
  subjectId: string | null;
  chapterId: string | null;
  category: Category | null;
  quickRevision: boolean;
  mode: SessionMode;
  status: SessionStatus;
  segments: Segment[];
  start: number;
  end: number;
  durationMs: number;
  plannedMinutes: number;
  createdAt: number;
}

export type BlockKind = 'class' | 'break';

export interface Block extends Syncable {
  kind: BlockKind;
  label: string;
  start: number;
  end: number;
}

export interface QuickNote extends Syncable {
  text: string;
  context: string;
  createdAt: number;
  resolved: boolean;
}

/** id is the local day key YYYY-MM-DD. */
export interface DayMeta extends Syncable {
  restDay: boolean;
  dailyNote: string;
  /** "What went wrong?" reasons tapped for this day, in the order of ROOT_CAUSES. */
  rootCauses: RootCause[];
}

/** One-tap reasons for a missed goal or homework left pending. */
export type RootCause = 'exhausted' | 'stuck' | 'slow' | 'lecture' | 'distraction' | 'unplanned';

/** id is the local day key YYYY-MM-DD. */
export interface HydrationLog extends Syncable {
  date: string;
  glassesCount: number;
  dailyTarget: number;
}

export interface ReflectionQuestion extends Syncable {
  text: string;
  order: number;
  builtIn: boolean;
  createdAt: number;
}

/** id is the local day key YYYY-MM-DD. */
export interface EveningReview extends Syncable {
  date: string;
  answersByQuestionId: Record<string, string>;
  hydrationCount: number;
  tomorrowFirstTaskId: string | null;
}

export interface Goal extends Syncable {
  title: string;
  target: number;
  progress: number;
  unit: string;
  createdAt: number;
}

/**
 * Questions practiced, summed per device, source (task or chapter) and day. Only one device
 * ever writes a given record, so increments from two devices never overwrite each other.
 */
export interface QuestionLog extends Syncable {
  /** Local day key YYYY-MM-DD. */
  day: string;
  taskId: string | null;
  chapterId: string | null;
  subjectId: string | null;
  /** Net questions for this source on this day from this device. Can be negative after a minus. */
  count: number;
  createdAt: number;
}

export interface ScheduleSlot {
  id: string;
  /** "HH:MM" local time. */
  start: string;
  end: string;
  label: string;
}

/** id is `weekday-<0..6>`, 0 = Sunday. */
export interface ScheduleDay extends Syncable {
  weekday: number;
  active: boolean;
  slots: ScheduleSlot[];
}

/** Replaces the weekly slots for one date. id is the day key YYYY-MM-DD. */
export interface ScheduleOverride extends Syncable {
  date: string;
  slots: ScheduleSlot[];
}

export type TestKind = 'coaching' | 'unit' | 'assignment' | 'other';

export interface TestEvent extends Syncable {
  title: string;
  kind: TestKind;
  /** Day key YYYY-MM-DD. */
  date: string;
  /** Repeat every N days (for example 21), or null. */
  repeatEveryDays: number | null;
  /** Id of the first test of a repeating series. */
  seriesId: string | null;
  subjectIds: string[];
  chapterIds: string[];
  totalMarks: number | null;
  /** Target score as a percentage, or null. */
  targetPercent: number | null;
  createdAt: number;
}

export interface MistakeCounts {
  conceptual: number;
  calculation: number;
  timePressure: number;
  guessed: number;
}

export interface SubjectScore {
  subjectId: string;
  scored: number;
  total: number;
}

/** id is the test id: one result per test. */
export interface TestResult extends Syncable {
  testId: string;
  scored: number;
  total: number;
  subjects: SubjectScore[];
  rank: number | null;
  percentile: number | null;
  mistakes: MistakeCounts;
  weakChapterIds: string[];
  reflection: string;
  createdAt: number;
}

export type MetricId = 'questions' | 'pending' | 'completedToday' | 'focusGoal' | 'nextTest' | 'chapterProgress' | 'streak' | 'classHours';

export type ClockStyle = 'flip' | 'digital';

/** id is always 'app'. */
export interface UserSettings extends Syncable {
  displayName: string;
  /** Small JPEG data URL, so it stays offline and can sync. */
  avatarDataUrl: string | null;
  targetExamTitle: string;
  targetExamDate: string | null;
  dailyGoalMinutes: number;
  hydrationGoal: number;
  defaultPomodoroMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;
  clockStyle: ClockStyle;
  eyeRestEnabled: boolean;
  bellEnabled: boolean;
  bellIntervalMinutes: number;
  /** 2 to 4 metrics on the dashboard Overview card. */
  overviewMetrics: MetricId[];
  /** 2 to 4 metrics at the top of the Evening Review. */
  reviewMetrics: MetricId[];
  /** When a backup file was last saved on any device, or null. */
  lastBackupAt: number | null;
  /** A day counts toward the streak once focus reaches this share of the daily goal (50 to 100). */
  streakThresholdPercent: number;
}

/** Stored on this device only. Never synced or exported. */
export interface CustomAudioFile {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export interface TableMap {
  subjects: Subject;
  chapters: Chapter;
  tasks: Task;
  focusSessions: FocusSession;
  blocks: Block;
  quickNotes: QuickNote;
  days: DayMeta;
  hydrationLogs: HydrationLog;
  reflectionQuestions: ReflectionQuestion;
  eveningReviews: EveningReview;
  goals: Goal;
  userSettings: UserSettings;
  questionLogs: QuestionLog;
  scheduleDays: ScheduleDay;
  scheduleOverrides: ScheduleOverride;
  tests: TestEvent;
  testResults: TestResult;
}

/** Tables that sync between devices and appear in backups. */
export type TableName = keyof TableMap;

export const TABLE_NAMES: TableName[] = [
  'subjects',
  'chapters',
  'tasks',
  'focusSessions',
  'blocks',
  'quickNotes',
  'days',
  'hydrationLogs',
  'reflectionQuestions',
  'eveningReviews',
  'goals',
  'userSettings',
  'questionLogs',
  'scheduleDays',
  'scheduleOverrides',
  'tests',
  'testResults',
];

/** `test` is Exam-Hall Simulation: one long countdown with no breaks or interruptions. */
export type TimerMode = 'pomodoro' | 'quickstart' | 'stopwatch' | 'test';

export interface TimerSelection {
  mode: TimerMode;
  /** Pomodoro or test length in minutes. Ignored for Quick Start and Stopwatch. */
  minutes: number;
}

export type ProceduralSound = 'brown' | 'rain' | 'storm' | 'drone';
export type SoundChoice = ProceduralSound | `custom:${string}`;
export type Theme = 'light' | 'dark';
