import type { Chapter, FocusSession, MetricId, QuestionLog, Task, TestEvent } from '../types';
import { questionsOnDay, sumQuestions } from './questions';
import { chapterProgress } from './syllabus';
import { chaptersLeft, countdownText, testKindLabel, upcomingTests } from './tests';
import { countedSessions, focusMsInRange } from './stats';
import { MINUTE, dayEnd, dayKey, dayStart } from './time';

export const METRIC_OPTIONS: { id: MetricId; label: string }[] = [
  { id: 'questions', label: 'Questions Practiced Today' },
  { id: 'pending', label: 'Pending Topics Left' },
  { id: 'completedToday', label: 'Completed Tasks Today' },
  { id: 'focusGoal', label: 'Focus Hours vs. Goal' },
  { id: 'nextTest', label: 'Next Test or Deadline' },
  { id: 'chapterProgress', label: 'Current Chapter Progress' },
  { id: 'streak', label: 'Streak and Consistency' },
  { id: 'classHours', label: 'Class Hours Left Today' },
];

export const MIN_METRICS = 2;
export const MAX_METRICS = 4;

const METRIC_IDS = METRIC_OPTIONS.map((m) => m.id);

/** Keeps known ids in pool order, without duplicates, and pads or trims to 2 to 4 entries. */
export function cleanMetricIds(value: unknown, fallback: MetricId[]): MetricId[] {
  const list = Array.isArray(value) ? value.filter((v): v is MetricId => METRIC_IDS.includes(v as MetricId)) : [];
  const unique = METRIC_IDS.filter((id) => list.includes(id));
  // Always pool order, so cleaning an already clean list returns the same list.
  if (unique.length < MIN_METRICS) return METRIC_IDS.filter((id) => fallback.includes(id)).slice(0, MAX_METRICS);
  return unique.slice(0, MAX_METRICS);
}

export interface MetricContext {
  /** The day the metrics describe (today on the dashboard, the review date in the review). */
  day: string;
  now: number;
  tasks: Task[];
  sessions: FocusSession[];
  questionLogs: QuestionLog[];
  chapters: Chapter[];
  tests: TestEvent[];
  dailyGoalMinutes: number;
  streak: number;
  consistency: number;
  /** Class time left on `day` after now, and the day's total class time. */
  classMsLeft: number;
  classMsTotal: number;
  /** Chapter of the task on the timer, when there is one. */
  activeChapterId: string | null;
}

export interface MetricValue {
  id: MetricId;
  label: string;
  value: string;
  detail: string;
  /** 0..1 when the metric has a natural goal. */
  progress?: number;
}

export function hm(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / MINUTE);
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

/** Weighted milestone progress, see lib/syllabus. */
export function chapterPercent(c: Chapter): number {
  return chapterProgress(c);
}

/** The chapter on the timer, otherwise the chapter of the latest session that had one. */
export function currentChapter(ctx: Pick<MetricContext, 'chapters' | 'sessions' | 'activeChapterId'>): Chapter | null {
  const byId = new Map(ctx.chapters.filter((c) => !c.deleted).map((c) => [c.id, c]));
  if (ctx.activeChapterId && byId.has(ctx.activeChapterId)) return byId.get(ctx.activeChapterId)!;
  let latest: FocusSession | null = null;
  for (const s of countedSessions(ctx.sessions)) {
    if (s.chapterId && byId.has(s.chapterId) && (!latest || s.end > latest.end)) latest = s;
  }
  return latest ? byId.get(latest.chapterId!)! : null;
}

export function computeMetric(id: MetricId, ctx: MetricContext): MetricValue {
  const label = METRIC_OPTIONS.find((m) => m.id === id)!.label;
  switch (id) {
    case 'questions': {
      const today = questionsOnDay(ctx.questionLogs, ctx.day);
      return { id, label, value: String(today), detail: `${sumQuestions(ctx.questionLogs)} in total` };
    }
    case 'pending': {
      const n = ctx.tasks.filter((t) => !t.deleted && t.column === 'pending').length;
      return { id, label, value: String(n), detail: n === 1 ? 'topic in the backlog' : 'topics in the backlog' };
    }
    case 'completedToday': {
      const from = dayStart(ctx.day);
      const to = dayEnd(ctx.day);
      const done = ctx.tasks.filter((t) => !t.deleted && t.column === 'completed' && t.completedAt !== null);
      const n = done.filter((t) => t.completedAt! >= from && t.completedAt! < to).length;
      return { id, label, value: String(n), detail: `${done.length} completed in total` };
    }
    case 'focusGoal': {
      const ms = focusMsInRange(ctx.sessions, dayStart(ctx.day), dayEnd(ctx.day));
      const goal = Math.max(1, ctx.dailyGoalMinutes) * MINUTE;
      return { id, label, value: hm(ms), detail: `of ${hm(goal)} goal`, progress: Math.min(1, ms / goal) };
    }
    case 'nextTest': {
      const next = upcomingTests(ctx.tests, dayKey(ctx.now))[0];
      if (!next) return { id, label, value: 'None', detail: 'Add one in Syllabus, Tests' };
      const left = chaptersLeft(next, ctx.chapters);
      const when = countdownText(next.date, dayKey(ctx.now));
      const title = next.title.trim() || testKindLabel(next.kind);
      return { id, label, value: when.charAt(0).toUpperCase() + when.slice(1), detail: left > 0 ? `${title}, ${left} ${left === 1 ? 'chapter' : 'chapters'} left` : title };
    }
    case 'chapterProgress': {
      const c = currentChapter(ctx);
      if (!c) return { id, label, value: '0%', detail: 'No chapter studied yet' };
      const pct = chapterPercent(c);
      return { id, label, value: `${pct}%`, detail: c.title, progress: pct / 100 };
    }
    case 'streak':
      return { id, label, value: `${ctx.streak} ${ctx.streak === 1 ? 'day' : 'days'}`, detail: `${ctx.consistency}% over 30 days` };
    case 'classHours':
      return { id, label, value: hm(ctx.classMsLeft), detail: ctx.classMsTotal > 0 ? `of ${hm(ctx.classMsTotal)} scheduled` : 'No classes scheduled' };
  }
}
