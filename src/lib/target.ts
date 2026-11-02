import type { Task } from '../types';
import { formatShort } from './format';
import { isQuestionUnit } from './questions';
import { MINUTE } from './time';

/** Whole Pomodoros of `minutes` length contained in the logged focus time. */
export function pomodorosLogged(loggedMs: number, minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.floor(Math.max(0, loggedMs) / (minutes * MINUTE));
}

export function estimatedTotalMinutes(pomodoros: number, minutes: number): number {
  return Math.max(0, Math.round(pomodoros)) * Math.max(0, Math.round(minutes));
}

/** The task counts practiced questions toward its unit target. */
export function usesQuestionCount(task: Task): boolean {
  return task.targetMode === 'unit' && isQuestionUnit(task.unitLabel);
}

/**
 * Units done toward a unit target. Question units ("Questions", "PYQs", ...) use the practiced
 * question count when one is given; other units use `unitDone`.
 */
export function unitsDone(task: Task, questions?: number): number {
  if (questions !== undefined && usesQuestionCount(task)) return Math.max(0, Math.round(questions));
  return task.unitDone;
}

/** "2/4 Pomodoros (50m)", "8/15 Questions" or "Untimed". */
export function targetLabel(task: Task, loggedMs: number, questions?: number): string {
  if (task.targetMode === 'unit') return `${unitsDone(task, questions)}/${task.unitTarget} ${task.unitLabel}`;
  if (task.targetMode === 'none') return 'Untimed';
  const done = pomodorosLogged(loggedMs, task.pomodoroMinutes);
  const word = task.estimatedPomodoros === 1 ? 'Pomodoro' : 'Pomodoros';
  return `${done}/${task.estimatedPomodoros} ${word} (${formatShort(loggedMs)})`;
}

/** 0..1 progress toward the target. Untimed tasks report 0 until completed. */
export function targetProgress(task: Task, loggedMs: number, questions?: number): number {
  if (task.column === 'completed') return 1;
  if (task.targetMode === 'unit') return task.unitTarget > 0 ? Math.min(1, unitsDone(task, questions) / task.unitTarget) : 0;
  if (task.targetMode === 'none') return 0;
  const total = estimatedTotalMinutes(task.estimatedPomodoros, task.pomodoroMinutes) * MINUTE;
  return total > 0 ? Math.min(1, loggedMs / total) : 0;
}
