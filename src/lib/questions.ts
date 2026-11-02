import type { QuestionLog } from '../types';
import { addDays, dayKey, weekStartKey } from './time';

/** Unit labels that count practiced questions, so their progress uses the question logs. */
const QUESTION_UNIT = /\b(questions?|pyqs?|problems?|mcqs?|numericals?)\b/i;

export function isQuestionUnit(label: string): boolean {
  return QUESTION_UNIT.test(label.trim());
}

/** Counts that are not finite numbers (a damaged or partial record) count as zero. */
const live = (logs: QuestionLog[] | null | undefined) =>
  (Array.isArray(logs) ? logs : []).filter((l) => l && !l.deleted).map((l) => (Number.isFinite(l.count) ? l : { ...l, count: 0 }));

/** Sum of counts that match, never below zero. */
export function sumQuestions(logs: QuestionLog[], match: (l: QuestionLog) => boolean = () => true): number {
  let total = 0;
  for (const l of live(logs)) if (match(l)) total += l.count;
  return Math.max(0, total);
}

export function questionsForTask(logs: QuestionLog[], taskId: string): number {
  return sumQuestions(logs, (l) => l.taskId === taskId);
}

export function questionsForChapter(logs: QuestionLog[], chapterId: string): number {
  return sumQuestions(logs, (l) => l.chapterId === chapterId);
}

export function questionsForSubject(logs: QuestionLog[], subjectId: string): number {
  return sumQuestions(logs, (l) => l.subjectId === subjectId);
}

export function questionsOnDay(logs: QuestionLog[], day: string): number {
  return sumQuestions(logs, (l) => l.day === day);
}

/** Totals keyed by the value `key` returns; keys with a null value are skipped. */
export function questionsBy(logs: QuestionLog[], key: (l: QuestionLog) => string | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of live(logs)) {
    const k = key(l);
    if (k === null) continue;
    out.set(k, (out.get(k) ?? 0) + l.count);
  }
  for (const [k, v] of out) if (v < 0) out.set(k, 0);
  return out;
}

export interface QuestionSummary {
  today: number;
  week: number;
  total: number;
}

/** Today, this week (from Monday) and all time. */
export function questionSummary(logs: QuestionLog[], now: number): QuestionSummary {
  const today = dayKey(now);
  const weekFrom = weekStartKey(today);
  const weekTo = addDays(weekFrom, 6);
  return {
    today: questionsOnDay(logs, today),
    week: sumQuestions(logs, (l) => l.day >= weekFrom && l.day <= weekTo),
    total: sumQuestions(logs),
  };
}

/** Record id for this device, source and day. Sources: `t.<taskId>` or `c.<chapterId>`. */
export function questionLogId(deviceId: string, source: string, day: string): string {
  return `q-${deviceId}-${source}-${day}`;
}
