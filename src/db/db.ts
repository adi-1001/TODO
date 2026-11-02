import Dexie, { type EntityTable, type Transaction } from 'dexie';
import type {
  Block,
  Chapter,
  CustomAudioFile,
  DayMeta,
  EveningReview,
  FocusSession,
  Goal,
  HydrationLog,
  QuestionLog,
  QuickNote,
  ReflectionQuestion,
  ScheduleDay,
  ScheduleOverride,
  Subject,
  Task,
  TestEvent,
  TestResult,
  UserSettings,
} from '../types';
import { clearLegacyUnitCount, isUntouchedSeed, legacyQuestionLogs, normalizeNote, normalizeRecord, normalizeSession, normalizeSettings, normalizeTask } from './migrate';
import { TABLE_NAMES } from '../types';

export const PUSH_MARK_KEY = 'study-space:cloud-push-mark';

const TABLES_AFTER_UPGRADE = ['subjects', 'tasks', 'focusSessions', 'blocks', 'quickNotes', 'days', 'goals', 'userSettings'];

/** Version 1 to version 2: copy renamed tables, fill new fields, retire untouched sample data. */
async function upgradeToV2(tx: Transaction): Promise<void> {
  const raw = (rows: unknown[]) => rows as Record<string, unknown>[];
  await tx.table('focusSessions').bulkPut(raw(await tx.table('sessions').toArray()).map(normalizeSession));
  await tx.table('quickNotes').bulkPut(raw(await tx.table('notes').toArray()).map(normalizeNote));
  await tx.table('userSettings').bulkPut(raw(await tx.table('settings').toArray()).map(normalizeSettings));
  await tx
    .table('tasks')
    .toCollection()
    .modify((t: Record<string, unknown>) => {
      Object.assign(t, normalizeTask(t));
    });

  // Sample records from the old first-run seed that were never edited are tombstoned with
  // a fresh timestamp, so the same untouched copies in the cloud cannot bring them back.
  const now = Date.now();
  for (const name of TABLES_AFTER_UPGRADE) {
    await tx
      .table(name)
      .toCollection()
      .modify((r: { id: string; updatedAt: number; deleted?: boolean }) => {
        if (isUntouchedSeed(r)) {
          r.deleted = true;
          r.updatedAt = now;
        }
      });
  }

  // Records now live under new table names, so the next cloud connect pushes everything.
  try {
    localStorage.removeItem(PUSH_MARK_KEY);
  } catch {
    /* no storage in this context */
  }
}

export class StudyDB extends Dexie {
  subjects!: EntityTable<Subject, 'id'>;
  chapters!: EntityTable<Chapter, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  focusSessions!: EntityTable<FocusSession, 'id'>;
  blocks!: EntityTable<Block, 'id'>;
  quickNotes!: EntityTable<QuickNote, 'id'>;
  days!: EntityTable<DayMeta, 'id'>;
  hydrationLogs!: EntityTable<HydrationLog, 'id'>;
  reflectionQuestions!: EntityTable<ReflectionQuestion, 'id'>;
  eveningReviews!: EntityTable<EveningReview, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  userSettings!: EntityTable<UserSettings, 'id'>;
  customAudioFiles!: EntityTable<CustomAudioFile, 'id'>;
  questionLogs!: EntityTable<QuestionLog, 'id'>;
  scheduleDays!: EntityTable<ScheduleDay, 'id'>;
  scheduleOverrides!: EntityTable<ScheduleOverride, 'id'>;
  tests!: EntityTable<TestEvent, 'id'>;
  testResults!: EntityTable<TestResult, 'id'>;

  constructor(name = 'study-space') {
    super(name);
    this.version(1).stores({
      subjects: 'id, updatedAt, order',
      tasks: 'id, updatedAt, column, dueDate',
      sessions: 'id, updatedAt, createdAt',
      blocks: 'id, updatedAt, start',
      notes: 'id, updatedAt, createdAt',
      days: 'id, updatedAt',
      goals: 'id, updatedAt',
      settings: 'id, updatedAt',
    });
    this.version(2)
      .stores({
        chapters: 'id, updatedAt, subjectId',
        tasks: 'id, updatedAt, column, dueDate, chapterId',
        focusSessions: 'id, updatedAt, createdAt, taskId',
        quickNotes: 'id, updatedAt, createdAt',
        hydrationLogs: 'id, updatedAt',
        reflectionQuestions: 'id, updatedAt, order',
        eveningReviews: 'id, updatedAt',
        userSettings: 'id, updatedAt',
        customAudioFiles: 'id, createdAt',
      })
      .upgrade(upgradeToV2);
    this.version(3).stores({ sessions: null, notes: null, settings: null });
    this.version(4)
      .stores({
        questionLogs: 'id, updatedAt, day, taskId, chapterId',
        scheduleDays: 'id, updatedAt',
        scheduleOverrides: 'id, updatedAt',
        tests: 'id, updatedAt, date',
        testResults: 'id, updatedAt',
      })
      .upgrade(upgradeToV4);
    this.version(5).stores({}).upgrade(upgradeToV5);
    // Version 6: four chapter milestones (practiceDone becomes referenceBookDone) and the streak threshold.
    this.version(6)
      .stores({})
      .upgrade(async (tx) => {
        await upgradeToV5(tx);
        await tx
          .table('chapters')
          .toCollection()
          .modify((c: Record<string, unknown>) => {
            delete c.practiceDone;
          });
      });
    // Version 7: Task Category and Target Questions on tasks, "What went wrong?" reasons on days.
    this.version(7).stores({}).upgrade(upgradeToV5);
    // Version 8: Target Questions on chapters.
    this.version(8).stores({}).upgrade(upgradeToV5);
  }
}

/**
 * Version 4 to version 5: rewrite every synced record through its normalizer, so records saved
 * by earlier versions get every field added since (overview cards, lastStudiedAt, lastBackupAt,
 * list fields on tests and schedules, and so on). Earlier upgrades added tables but did not fill
 * new fields, and reading such a record crashed the dashboard right after the first render.
 */
async function upgradeToV5(tx: Transaction): Promise<void> {
  for (const name of TABLE_NAMES) {
    await tx
      .table(name)
      .toCollection()
      .modify((r: Record<string, unknown>) => {
        const clean = normalizeRecord(name, r);
        if (clean) Object.assign(r, clean);
      });
  }
}

/** Version 3 to version 4: one question counter. Carries old task and chapter counts into question logs. */
async function upgradeToV4(tx: Transaction): Promise<void> {
  const tasks = (await tx.table('tasks').toArray()) as Record<string, unknown>[];
  const chapters = (await tx.table('chapters').toArray()) as Record<string, unknown>[];
  // updatedAt 1 lets any edit on another device win, and two devices write identical records.
  const logs = legacyQuestionLogs(tasks, chapters, 1);
  if (logs.length) await tx.table('questionLogs').bulkPut(logs);
  await tx
    .table('tasks')
    .toCollection()
    .modify((t: Record<string, unknown>) => {
      Object.assign(t, clearLegacyUnitCount(t));
      delete t.problemsSolved;
    });
  await tx
    .table('chapters')
    .toCollection()
    .modify((c: Record<string, unknown>) => {
      delete c.pastQuestionsSolved;
    });
}

export const db = new StudyDB();
