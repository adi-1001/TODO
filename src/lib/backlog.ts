import type { Chapter, DayMeta, FocusSession, QuestionLog, RootCause, Task, TaskKind } from '../types';
import { countedSessions, sessionMs } from './stats';
import { estimatedTotalMinutes, usesQuestionCount } from './target';
import { MINUTE, addDays, dayKey } from './time';

/**
 * Backlog triage: today's live homework, the practice backlog of chapters, a daily catch-up
 * plan, solving pace per subject and the reasons a day went off plan. Pure functions only.
 */

export const TASK_KINDS: { value: TaskKind; label: string; short: string; hint: string }[] = [
  { value: 'homework', label: "Today's Live Homework", short: 'Live Homework', hint: 'Urgent. Finish it today so no new backlog forms.' },
  { value: 'backlog', label: 'Backlog / Ref. Book Catch-Up', short: 'Backlog Catch-Up', hint: 'Clearing past chapters, sheets and reference book sets.' },
  { value: 'lecture', label: 'Lecture / Class Replay', short: 'Lecture Replay', hint: 'Watching or replaying a class you missed or need again.' },
  { value: 'revision', label: 'Revision / PYQs', short: 'Revision / PYQs', hint: 'Revising finished chapters and past year questions.' },
];

export function taskKindMeta(kind: TaskKind) {
  return TASK_KINDS.find((k) => k.value === kind) ?? TASK_KINDS[0];
}

export const ROOT_CAUSES: { value: RootCause; label: string; fix: string }[] = [
  {
    value: 'exhausted',
    label: 'Heavy Coaching / Exhausted',
    fix: 'On coaching days, plan one 25m homework block right after class and keep backlog work for lighter days.',
  },
  {
    value: 'stuck',
    label: 'Stuck on Concept / Doubt',
    fix: 'Give a stuck question 10 minutes, then write the doubt in Quick Notes, move on and ask it in the next class.',
  },
  {
    value: 'slow',
    label: 'Slow Question Solving Speed',
    fix: 'Practise timed sets: 10 questions against a clock set to your target pace, then check the ones that took longest.',
  },
  {
    value: 'lecture',
    label: 'Lecture Replay Delay',
    fix: 'Watch the replay on the same day, at 1.5x if needed, before starting any new work.',
  },
  {
    value: 'distraction',
    label: 'Distraction / Late Start',
    fix: 'Start the first 25m block at a fixed time every day, with Strict Mode on and the phone in another room.',
  },
  {
    value: 'unplanned',
    label: 'Unplanned Event / Health',
    fix: "Rest first, then restart with today's homework only. The catch-up plan spreads the rest over the coming days.",
  },
];

export function rootCauseMeta(cause: RootCause) {
  return ROOT_CAUSES.find((c) => c.value === cause) ?? ROOT_CAUSES[0];
}

const isOpen = (t: Task) => !t.deleted && t.column !== 'completed';

/** Questions a task aims for: its Target Questions, or the target of a question-unit task. */
export function questionGoal(task: Task): number | null {
  if (task.targetQuestions !== null && task.targetQuestions > 0) return task.targetQuestions;
  if (usesQuestionCount(task)) return task.unitTarget;
  return null;
}

/** Target questions still to solve on a task (0 without a goal). */
export function questionsLeft(task: Task, questions: number): number {
  const goal = questionGoal(task);
  return goal === null ? 0 : Math.max(0, goal - Math.max(0, questions));
}

/** Pace used before enough questions are logged to measure one. */
export const DEFAULT_MINUTES_PER_QUESTION = 2;

/**
 * Minutes still needed to finish a task: the rest of its Pomodoro estimate, or its questions
 * left at the given pace, or else the rest of one Pomodoro.
 */
export function minutesLeft(task: Task, loggedMs: number, questions: number, minutesPerQuestion: number): number {
  const logged = Math.max(0, loggedMs) / MINUTE;
  if (task.targetMode === 'pomodoro') return Math.max(0, Math.round(estimatedTotalMinutes(task.estimatedPomodoros, task.pomodoroMinutes) - logged));
  const left = questionsLeft(task, questions);
  if (left > 0) return Math.round(left * minutesPerQuestion);
  if (questionGoal(task) !== null) return 0;
  return Math.max(0, Math.round(task.pomodoroMinutes - logged));
}

export interface HomeworkSummary {
  tasks: Task[];
  minutes: number;
}

/** Open tasks tagged Today's Live Homework that are due today, earlier, or undated. */
export function homeworkLeft(tasks: Task[], today: string, loggedByTask: Map<string, number>, questionsByTask: Map<string, number>, minutesPerQuestion: number): HomeworkSummary {
  const list = tasks.filter((t) => isOpen(t) && t.kind === 'homework' && (t.dueDate === null || t.dueDate <= today));
  const minutes = list.reduce((a, t) => a + minutesLeft(t, loggedByTask.get(t.id) ?? 0, questionsByTask.get(t.id) ?? 0, minutesPerQuestion), 0);
  return { tasks: list, minutes };
}

/**
 * A chapter is in the practice backlog when it is Practice Pending, or its theory is done while
 * the reference book or PYQs are not. Chapters marked Completed are never in it.
 */
export function inPracticeBacklog(c: Chapter): boolean {
  if (c.deleted || c.status === 'completed') return false;
  return c.status === 'practice_pending' || (c.theoryDone && (!c.referenceBookDone || !c.pyqDone));
}

/** Questions assumed for each unfinished Ref. Book or PYQ set of a chapter with no target. */
export const PRACTICE_SET_ESTIMATE = 30;

/** Where a chapter's question count comes from. */
export type TargetSource = 'chapter' | 'tasks' | 'estimate';

export interface BacklogChapter {
  chapter: Chapter;
  /** Open linked tasks, without live homework (counted in the homework column). */
  tasks: Task[];
  questionsLeft: number;
  /** Questions already done toward the count, for the progress bar. */
  questionsDone: number;
  /** True when neither the chapter nor a linked task has a target, so questionsLeft is an estimate. */
  estimated: boolean;
  source: TargetSource;
  /** Day key of the soonest upcoming test that covers the chapter, or null. */
  testDate: string | null;
}

export interface BacklogSummary {
  /** Highest priority first: chapters in the soonest test, then the ones left alone longest. */
  chapters: BacklogChapter[];
  /** Open catch-up tasks that are not on a backlog chapter. */
  looseTasks: Task[];
  questions: number;
  /** Questions done toward the backlog's counts. */
  questionsDone: number;
  estimated: boolean;
}

/**
 * The practice backlog. A chapter's questions left come from its own Target Questions (minus
 * every question logged on it), else from its open tasks' targets, else an estimate of 30 per
 * unfinished Ref. Book or PYQ set.
 */
export function backlogSummary(
  chapters: Chapter[],
  tasks: Task[],
  questionsByTask: Map<string, number>,
  questionsByChapter: Map<string, number> = new Map(),
  testDateByChapter: Map<string, string> = new Map(),
): BacklogSummary {
  const open = tasks.filter((t) => isOpen(t) && t.kind !== 'homework');
  const byChapter = new Map<string, Task[]>();
  for (const t of open) {
    if (!t.chapterId) continue;
    const list = byChapter.get(t.chapterId);
    if (list) list.push(t);
    else byChapter.set(t.chapterId, [t]);
  }
  const rows: BacklogChapter[] = chapters.filter(inPracticeBacklog).map((chapter) => {
    const linked = byChapter.get(chapter.id) ?? [];
    const testDate = testDateByChapter.get(chapter.id) ?? null;
    const done = Math.max(0, questionsByChapter.get(chapter.id) ?? 0);
    if (chapter.targetQuestions !== null && chapter.targetQuestions > 0) {
      const target = chapter.targetQuestions;
      return { chapter, tasks: linked, questionsLeft: Math.max(0, target - done), questionsDone: Math.min(done, target), estimated: false, source: 'chapter', testDate };
    }
    const goals = linked.filter((t) => questionGoal(t) !== null);
    if (goals.length > 0) {
      let left = 0;
      let got = 0;
      for (const t of goals) {
        const q = Math.max(0, questionsByTask.get(t.id) ?? 0);
        left += questionsLeft(t, q);
        got += Math.min(q, questionGoal(t) ?? 0);
      }
      return { chapter, tasks: linked, questionsLeft: left, questionsDone: got, estimated: false, source: 'tasks', testDate };
    }
    const sets = Number(!chapter.referenceBookDone) + Number(!chapter.pyqDone);
    return { chapter, tasks: linked, questionsLeft: Math.max(1, sets) * PRACTICE_SET_ESTIMATE, questionsDone: done, estimated: true, source: 'estimate', testDate };
  });
  rows.sort((a, b) => {
    if (a.testDate !== b.testDate) {
      if (a.testDate === null) return 1;
      if (b.testDate === null) return -1;
      return a.testDate < b.testDate ? -1 : 1;
    }
    return (a.chapter.lastStudiedAt ?? 0) - (b.chapter.lastStudiedAt ?? 0) || b.questionsLeft - a.questionsLeft || a.chapter.order - b.chapter.order;
  });
  const inRows = new Set(rows.map((r) => r.chapter.id));
  const looseTasks = open.filter((t) => t.kind === 'backlog' && !(t.chapterId && inRows.has(t.chapterId)));
  const looseLeft = looseTasks.reduce((a, t) => a + questionsLeft(t, questionsByTask.get(t.id) ?? 0), 0);
  const looseDone = looseTasks.reduce((a, t) => a + Math.min(Math.max(0, questionsByTask.get(t.id) ?? 0), questionGoal(t) ?? 0), 0);
  return {
    chapters: rows,
    looseTasks,
    questions: rows.reduce((a, r) => a + r.questionsLeft, 0) + looseLeft,
    questionsDone: rows.reduce((a, r) => a + r.questionsDone, 0) + looseDone,
    estimated: rows.some((r) => r.estimated),
  };
}

/** Day key of the soonest test on or after `today` for each chapter it covers. */
export function nextTestByChapter(tests: { date: string; chapterIds: string[]; deleted?: boolean }[], today: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of tests) {
    if (t.deleted || t.date < today) continue;
    for (const id of t.chapterIds) {
      const prev = out.get(id);
      if (!prev || t.date < prev) out.set(id, t.date);
    }
  }
  return out;
}

/** One-tap target presets for common question sources. */
export const SOURCE_PRESETS: { label: string; questions: number }[] = [
  { label: 'DPP / Sheet', questions: 30 },
  { label: 'Topic Module', questions: 60 },
  { label: 'Standard Ref. Book', questions: 120 },
  { label: 'Heavy PYQ Bank', questions: 150 },
];

export interface CatchUpPlan {
  perDay: number;
  minutesPerDay: number;
  days: number;
}

/** The plan aims to clear the backlog in about a week, at 10 to 60 questions a day. */
export const CATCH_UP_DAYS = 7;
const MIN_PER_DAY = 10;
const MAX_PER_DAY = 60;
/** Backlog time a day is kept to about 90 minutes, so live homework still fits; the plan takes more days instead. */
export const MAX_CATCH_UP_MINUTES = 90;

/** A daily chip-away target for `questions` backlog questions at the given pace. */
export function catchUpPlan(questions: number, minutesPerQuestion: number): CatchUpPlan | null {
  const total = Math.round(questions);
  if (!Number.isFinite(total) || total <= 0) return null;
  const pace = Number.isFinite(minutesPerQuestion) && minutesPerQuestion > 0 ? minutesPerQuestion : DEFAULT_MINUTES_PER_QUESTION;
  const aim = Math.ceil(total / CATCH_UP_DAYS / 5) * 5;
  const byTime = Math.max(5, Math.floor(MAX_CATCH_UP_MINUTES / pace / 5) * 5);
  const perDay = Math.min(total, MAX_PER_DAY, byTime, Math.max(MIN_PER_DAY, aim));
  return { perDay, minutesPerDay: Math.max(5, Math.round((perDay * pace) / 5) * 5), days: Math.ceil(total / perDay) };
}

/**
 * The task a Backlog Sprint works on: catch-up tasks first, then tasks with questions left,
 * then the soonest due and the oldest. Null when there is no open backlog task.
 */
export function sprintTask(backlog: BacklogSummary, questionsByTask: Map<string, number>): Task | null {
  const pool = [...backlog.looseTasks, ...backlog.chapters.flatMap((c) => c.tasks)];
  if (pool.length === 0) return null;
  const score = (t: Task) => (t.kind === 'backlog' ? 0 : 2) + (questionsLeft(t, questionsByTask.get(t.id) ?? 0) > 0 ? 0 : 1);
  return (
    [...pool].sort((a, b) => {
      const s = score(a) - score(b);
      if (s !== 0) return s;
      if (a.dueDate !== b.dueDate) {
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      return a.createdAt - b.createdAt;
    })[0] ?? null
  );
}

/** The top-priority backlog chapter with questions left, for a new sprint task. */
export function sprintChapter(backlog: BacklogSummary): Chapter | null {
  return (backlog.chapters.find((r) => r.questionsLeft > 0) ?? backlog.chapters[0])?.chapter ?? null;
}

export interface PaceRow {
  subjectId: string;
  questions: number;
  ms: number;
  minutesPerQuestion: number;
}

export interface PaceSummary {
  /** Slowest subject first. */
  rows: PaceRow[];
  /** Pace over every subject, or null before enough questions are logged. */
  overall: number | null;
}

export const PACE_WINDOW_DAYS = 28;
/** Fewer questions than this give no pace for a subject. */
export const MIN_PACE_QUESTIONS = 5;

/**
 * Minutes per question per subject over the last 28 days: focus on tasks that also had
 * questions logged, divided by those questions. Tasks with only time or only questions are left
 * out, so neither side is counted without the other.
 */
export function solvingPace(sessions: FocusSession[], logs: QuestionLog[], tasks: Task[], today: string): PaceSummary {
  const from = addDays(today, -(PACE_WINDOW_DAYS - 1));
  // Time and questions are paired per task and day, so a theory day on a task does not count
  // against the questions solved on another day. Lecture replays are left out.
  const taskById = new Map(tasks.filter((t) => t.kind !== 'lecture' && t.subjectId).map((t) => [t.id, t]));
  const key = (taskId: string, day: string) => `${taskId}|${day}`;
  const qByTaskDay = new Map<string, number>();
  for (const l of logs) {
    if (l.deleted || !l.taskId || !taskById.has(l.taskId) || l.day < from || l.day > today || !Number.isFinite(l.count)) continue;
    const k = key(l.taskId, l.day);
    qByTaskDay.set(k, (qByTaskDay.get(k) ?? 0) + l.count);
  }
  const msByTaskDay = new Map<string, number>();
  for (const s of countedSessions(sessions)) {
    if (!s.taskId || !taskById.has(s.taskId)) continue;
    const day = dayKey(s.start);
    if (day < from || day > today) continue;
    const k = key(s.taskId, day);
    msByTaskDay.set(k, (msByTaskDay.get(k) ?? 0) + sessionMs(s));
  }
  const bySubject = new Map<string, { questions: number; ms: number }>();
  for (const [k, q] of qByTaskDay) {
    const ms = msByTaskDay.get(k) ?? 0;
    if (q <= 0 || ms <= 0) continue;
    const subjectId = (taskById.get(k.slice(0, k.lastIndexOf('|'))) as Task).subjectId;
    const row = bySubject.get(subjectId) ?? { questions: 0, ms: 0 };
    row.questions += q;
    row.ms += ms;
    bySubject.set(subjectId, row);
  }
  let totalQ = 0;
  let totalMs = 0;
  const rows: PaceRow[] = [];
  for (const [subjectId, r] of bySubject) {
    totalQ += r.questions;
    totalMs += r.ms;
    if (r.questions >= MIN_PACE_QUESTIONS) rows.push({ subjectId, questions: r.questions, ms: r.ms, minutesPerQuestion: r.ms / MINUTE / r.questions });
  }
  rows.sort((a, b) => b.minutesPerQuestion - a.minutesPerQuestion);
  return { rows, overall: totalQ >= MIN_PACE_QUESTIONS ? totalMs / MINUTE / totalQ : null };
}

/** "2.8" minutes per question, one decimal. */
export function formatPace(minutesPerQuestion: number): string {
  return (Math.round(minutesPerQuestion * 10) / 10).toFixed(1);
}

export interface Bottleneck {
  cause: RootCause;
  days: number;
}

/** How many of the 7 days ending `today` had each reason tapped, most frequent first. */
export function weekBottlenecks(days: DayMeta[], today: string): Bottleneck[] {
  const from = addDays(today, -6);
  const counts = new Map<RootCause, number>();
  for (const d of days) {
    if (d.deleted || d.id < from || d.id > today) continue;
    for (const c of d.rootCauses) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return ROOT_CAUSES.map((c) => ({ cause: c.value, days: counts.get(c.value) ?? 0 }))
    .filter((b) => b.days > 0)
    .sort((a, b) => b.days - a.days);
}

const dayWord = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/** "Lecture Replay Delay (2 days) & Slow Question Solving Speed (1 day)", or null. */
export function bottleneckText(list: Bottleneck[]): string | null {
  if (list.length === 0) return null;
  return list
    .slice(0, 2)
    .map((b) => `${rootCauseMeta(b.cause).label} (${dayWord(b.days)})`)
    .join(' & ');
}
