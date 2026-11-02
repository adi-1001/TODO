import { useMemo } from 'react';
import { db } from '../db/db';
import { DEFAULT_SETTINGS } from '../db/defaults';
import { isLiveStoreLoaded, useLiveStore } from '../db/liveStore';
import { normalizeMany, normalizeRecord } from '../db/migrate';
import { tableOf } from '../db/repo';
import { questionsBy } from '../lib/questions';
import { scheduledBlocks } from '../lib/schedule';
import { dayEnd, dayStart } from '../lib/time';
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
  TableMap,
  TableName,
  Task,
  TestEvent,
  TestResult,
  UserSettings,
} from '../types';

/**
 * Data hooks. Each one reads a shared cached live query (see db/liveStore), so many
 * components reading the same table cost one IndexedDB read, and a view that mounts again
 * shows its data at once.
 */

const EMPTY: never[] = [];

const live = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);

/**
 * Every record goes through its normalizer on the way to the UI, so a record saved by an older
 * version, a damaged row, or a field another device left out can never reach a component as
 * `undefined`. Rows without an id or updatedAt are skipped. The database upgrade to version 5
 * already rewrote stored records; this is the second line of defence.
 */
async function read<K extends TableName>(name: K): Promise<TableMap[K][]> {
  return normalizeMany(name, await tableOf(name).toArray());
}

export function useSubjects(): Subject[] {
  return useLiveStore('subjects', async () => live(await read('subjects')).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)), EMPTY);
}

export function useChapters(): Chapter[] {
  return useLiveStore('chapters', async () => live(await read('chapters')).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt), EMPTY);
}

export function useTasks(): Task[] {
  return useLiveStore('tasks', async () => live(await read('tasks')).sort((a, b) => a.createdAt - b.createdAt), EMPTY);
}

/** All non-deleted sessions, including Strict Mode failures. Stats helpers skip failures. */
export function useSessions(): FocusSession[] {
  return useLiveStore('focusSessions', async () => live(await read('focusSessions')).sort((a, b) => a.createdAt - b.createdAt), EMPTY);
}

/** Blocks stored by hand (Log class or break, breaks from the timer). See useDayBlocks for scheduled classes. */
export function useBlocks(): Block[] {
  return useLiveStore('blocks', async () => live(await read('blocks')).sort((a, b) => a.start - b.start), EMPTY);
}

export function useNotes(): QuickNote[] {
  return useLiveStore('quickNotes', async () => live(await read('quickNotes')).sort((a, b) => b.createdAt - a.createdAt), EMPTY);
}

export function useDays(): DayMeta[] {
  return useLiveStore('days', async () => live(await read('days')), EMPTY);
}

export function useGoals(): Goal[] {
  return useLiveStore('goals', async () => live(await read('goals')).sort((a, b) => a.createdAt - b.createdAt), EMPTY);
}

export function useSettings(): UserSettings {
  return useLiveStore(
    'userSettings',
    async () => {
      const s = await db.userSettings.get('app');
      return s && !s.deleted ? (normalizeRecord('userSettings', s) ?? DEFAULT_SETTINGS) : DEFAULT_SETTINGS;
    },
    DEFAULT_SETTINGS,
  );
}

export function useHydrationLogs(): HydrationLog[] {
  return useLiveStore('hydrationLogs', async () => live(await read('hydrationLogs')), EMPTY);
}

/** Glasses logged on a day (0 when nothing is logged). */
export function useHydration(day: string): number {
  const logs = useHydrationLogs();
  return logs.find((l) => l.id === day)?.glassesCount ?? 0;
}

export function useReflectionQuestions(): ReflectionQuestion[] {
  return useLiveStore('reflectionQuestions', async () => live(await read('reflectionQuestions')).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt), EMPTY);
}

export function useEveningReviews(): EveningReview[] {
  return useLiveStore('eveningReviews', async () => live(await read('eveningReviews')), EMPTY);
}

/** The review saved for a date, null when none exists, or undefined before the first read finishes. */
export function useEveningReview(date: string): EveningReview | null | undefined {
  const reviews = useEveningReviews();
  if (!isLiveStoreLoaded('eveningReviews')) return undefined;
  return reviews.find((r) => r.id === date) ?? null;
}

/** Uploaded tracks on this device, without loading their audio into memory. */
export interface AudioFileInfo {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
}

export function useAudioFiles(): AudioFileInfo[] {
  return useLiveStore(
    'customAudioFiles',
    async () => (await db.customAudioFiles.orderBy('createdAt').toArray()).map(({ id, name, type, size, createdAt }: CustomAudioFile) => ({ id, name, type, size, createdAt })),
    EMPTY,
  );
}

export function useQuestionLogs(): QuestionLog[] {
  return useLiveStore('questionLogs', async () => live(await read('questionLogs')), EMPTY);
}

export function useScheduleDays(): ScheduleDay[] {
  return useLiveStore('scheduleDays', async () => live(await read('scheduleDays')).sort((a, b) => a.weekday - b.weekday), EMPTY);
}

export function useScheduleOverrides(): ScheduleOverride[] {
  return useLiveStore('scheduleOverrides', async () => live(await read('scheduleOverrides')), EMPTY);
}

/** All tests and deadlines, soonest first. */
export function useTests(): TestEvent[] {
  return useLiveStore('tests', async () => live(await read('tests')).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt), EMPTY);
}

export function useTestResults(): TestResult[] {
  return useLiveStore('testResults', async () => live(await read('testResults')), EMPTY);
}

/** Question totals by task id. */
export function useQuestionsByTask(): Map<string, number> {
  const logs = useQuestionLogs();
  return useMemo(() => questionsBy(logs, (l) => l.taskId), [logs]);
}

/** Question totals by chapter id (task questions on the chapter plus chapter adjustments). */
export function useQuestionsByChapter(): Map<string, number> {
  const logs = useQuestionLogs();
  return useMemo(() => questionsBy(logs, (l) => l.chapterId), [logs]);
}

/** Question totals by subject id. */
export function useQuestionsBySubject(): Map<string, number> {
  const logs = useQuestionLogs();
  return useMemo(() => questionsBy(logs, (l) => l.subjectId), [logs]);
}

/** Stored blocks that touch a day, plus that day's scheduled classes, by start time. */
export function useDayBlocks(day: string): Block[] {
  const blocks = useBlocks();
  const days = useScheduleDays();
  const overrides = useScheduleOverrides();
  return useMemo(() => {
    const from = dayStart(day);
    const to = dayEnd(day);
    const stored = blocks.filter((b) => b.end > from && b.start < to);
    return [...stored, ...scheduledBlocks(day, days, overrides)].sort((a, b) => a.start - b.start);
  }, [blocks, days, overrides, day]);
}

export function useRestDays(): Set<string> {
  const days = useDays();
  return useMemo(() => new Set(days.filter((d) => d.restDay).map((d) => d.id)), [days]);
}

export function useDayMeta(day: string): DayMeta | undefined {
  const days = useDays();
  return days.find((d) => d.id === day);
}

export function useSubjectMap(): Map<string, Subject> {
  const subjects = useSubjects();
  return useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
}

export function useChapterMap(): Map<string, Chapter> {
  const chapters = useChapters();
  return useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);
}
