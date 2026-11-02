import { useMemo } from 'react';
import {
  DEFAULT_MINUTES_PER_QUESTION,
  backlogSummary,
  catchUpPlan,
  homeworkLeft,
  nextTestByChapter,
  solvingPace,
  sprintChapter,
  sprintTask,
  weekBottlenecks,
  type BacklogSummary,
  type Bottleneck,
  type CatchUpPlan,
  type HomeworkSummary,
  type PaceSummary,
} from '../lib/backlog';
import { focusMsByTask } from '../lib/stats';
import type { Chapter, Task } from '../types';
import { useChapters, useDays, useQuestionLogs, useQuestionsByChapter, useQuestionsByTask, useTasks, useTests } from './useData';
import { useLiveSessions } from './useLiveSessions';
import { useToday } from './useNow';

export interface BacklogView {
  today: string;
  pace: PaceSummary;
  /** The measured pace over every subject, or the default before one can be measured. */
  minutesPerQuestion: number;
  paceKnown: boolean;
  homework: HomeworkSummary;
  backlog: BacklogSummary;
  plan: CatchUpPlan | null;
  /** The open task a Backlog Sprint starts on, if there is one. */
  sprintTask: Task | null;
  /** Otherwise the chapter a new sprint task is made for. */
  sprintChapter: Chapter | null;
  bottlenecks: Bottleneck[];
}

/** Everything the Backlog and Recovery card, its report and the review section show. */
export function useBacklog(): BacklogView {
  const today = useToday();
  const tasks = useTasks();
  const chapters = useChapters();
  const sessions = useLiveSessions();
  const logs = useQuestionLogs();
  const questionsByTask = useQuestionsByTask();
  const days = useDays();
  const questionsByChapter = useQuestionsByChapter();
  const tests = useTests();
  const testDates = useMemo(() => nextTestByChapter(tests, today), [tests, today]);

  const pace = useMemo(() => solvingPace(sessions, logs, tasks, today), [sessions, logs, tasks, today]);
  const loggedByTask = useMemo(() => focusMsByTask(sessions), [sessions]);
  const minutesPerQuestion = pace.overall ?? DEFAULT_MINUTES_PER_QUESTION;
  const homework = useMemo(() => homeworkLeft(tasks, today, loggedByTask, questionsByTask, minutesPerQuestion), [tasks, today, loggedByTask, questionsByTask, minutesPerQuestion]);
  const backlog = useMemo(() => backlogSummary(chapters, tasks, questionsByTask, questionsByChapter, testDates), [chapters, tasks, questionsByTask, questionsByChapter, testDates]);
  const bottlenecks = useMemo(() => weekBottlenecks(days, today), [days, today]);

  return useMemo(() => {
    const task = sprintTask(backlog, questionsByTask);
    return {
      today,
      pace,
      minutesPerQuestion,
      paceKnown: pace.overall !== null,
      homework,
      backlog,
      plan: catchUpPlan(backlog.questions, minutesPerQuestion),
      sprintTask: task,
      sprintChapter: task ? null : sprintChapter(backlog),
      bottlenecks,
    };
  }, [today, pace, minutesPerQuestion, homework, backlog, questionsByTask, bottlenecks]);
}
