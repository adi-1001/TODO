import { useMemo } from 'react';
import { classMsRemaining } from '../lib/schedule';
import { METRIC_OPTIONS, computeMetric, type MetricContext, type MetricValue } from '../lib/metrics';
import { dayKey } from '../lib/time';
import { useTimer } from '../timer/TimerProvider';
import type { MetricId } from '../types';
import { useChapters, useDayBlocks, useQuestionLogs, useSettings, useTasks, useTests } from './useData';
import { useLiveSessions } from './useLiveSessions';
import { useNow } from './useNow';
import { useStreakInfo } from './useStats';

/** Inputs for the metrics on `day`, gathered once. Refreshes every 30 seconds. */
export function useMetricContext(day: string): MetricContext {
  const now = useNow(30_000);
  const tasks = useTasks();
  const sessions = useLiveSessions();
  const questionLogs = useQuestionLogs();
  const chapters = useChapters();
  const tests = useTests();
  const settings = useSettings();
  const { streak, consistency } = useStreakInfo();
  const blocks = useDayBlocks(day);
  const { activeTask } = useTimer();

  return useMemo(() => {
    const classes = blocks.filter((b) => b.kind === 'class');
    const isToday = day === dayKey(now);
    const total = classes.reduce((a, b) => a + Math.max(0, b.end - b.start), 0);
    return {
      day,
      now,
      tasks,
      sessions,
      questionLogs,
      chapters,
      tests,
      dailyGoalMinutes: settings.dailyGoalMinutes,
      streak,
      consistency,
      // Past days have no class time left; future days have all of it.
      classMsLeft: isToday ? classMsRemaining(classes, now) : day > dayKey(now) ? total : 0,
      classMsTotal: total,
      activeChapterId: activeTask?.chapterId ?? null,
    };
  }, [day, now, tasks, sessions, questionLogs, chapters, tests, settings.dailyGoalMinutes, streak, consistency, blocks, activeTask]);
}

export function useMetricValues(ids: MetricId[] | null | undefined, day: string): MetricValue[] {
  const ctx = useMetricContext(day);
  return useMemo(() => (Array.isArray(ids) ? ids : []).filter((id) => METRIC_OPTIONS.some((m) => m.id === id)).map((id) => computeMetric(id, ctx)), [ids, ctx]);
}
