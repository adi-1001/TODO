import type { Category, FocusSession, Segment, SessionStatus, Subject, Task } from '../types';
import { addDays, addMonths, dayEnd, dayKey, dayRange, dayStart, daysInMonth, lastNDays, monthStartKey, weekStartKey } from './time';

export const QUICK_REVISION_KEY = 'quick-revision';
export const GENERAL_KEY = 'general';
export const QUICK_REVISION_COLOR = '#A78BFA';
export const GENERAL_COLOR = '#A1A1AA';

const notDeleted = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);

/** Sessions that add to focus totals: not deleted and not stopped by Strict Mode. */
export function countedSessions(sessions: FocusSession[]): FocusSession[] {
  return sessions.filter((s) => !s.deleted && s.status !== 'failed_strict');
}

export function failedSessions(sessions: FocusSession[]): FocusSession[] {
  return sessions.filter((s) => !s.deleted && s.status === 'failed_strict');
}

const live = countedSessions;

export function segmentMs(seg: Segment): number {
  return Math.max(0, seg.end - seg.start);
}

export function sessionMs(s: FocusSession): number {
  let total = 0;
  for (const seg of s.segments) total += segmentMs(seg);
  return total;
}

/** Milliseconds of the segments that fall inside [from, to). */
export function clipMs(segments: Segment[], from: number, to: number): number {
  let total = 0;
  for (const seg of segments) {
    const a = Math.max(seg.start, from);
    const b = Math.min(seg.end, to);
    if (b > a) total += b - a;
  }
  return total;
}

export function focusMsInRange(sessions: FocusSession[], from: number, to: number): number {
  let total = 0;
  for (const s of live(sessions)) total += clipMs(s.segments, from, to);
  return total;
}

export function totalFocusMs(sessions: FocusSession[]): number {
  let total = 0;
  for (const s of live(sessions)) total += sessionMs(s);
  return total;
}

/** Calls `cb` once per local day touched by the segment, with the ms in that day. */
export function splitByDay(seg: Segment, cb: (day: string, ms: number, from: number, to: number) => void): void {
  let cursor = seg.start;
  let guard = 0;
  while (cursor < seg.end && guard < 400) {
    const k = dayKey(cursor);
    const e = Math.min(seg.end, dayEnd(k));
    cb(k, e - cursor, cursor, e);
    cursor = e;
    guard++;
  }
}

export interface SummaryMetrics {
  totalMs: number;
  weekMs: number;
  todayMs: number;
  totalCompleted: number;
  weekCompleted: number;
  todayCompleted: number;
}

/** The six numbers of the Detailed Report summary bar. Weeks start on Monday. */
export function summaryMetrics(sessions: FocusSession[], tasks: Task[], now: number): SummaryMetrics {
  const today = dayKey(now);
  const todayFrom = dayStart(today);
  const todayTo = dayEnd(today);
  const wk = weekStartKey(today);
  const weekFrom = dayStart(wk);
  const weekTo = dayStart(addDays(wk, 7));

  const completed = notDeleted(tasks).filter((t) => t.column === 'completed' && t.completedAt !== null);
  const inRange = (ms: number, a: number, b: number) => ms >= a && ms < b;

  return {
    totalMs: totalFocusMs(sessions),
    weekMs: focusMsInRange(sessions, weekFrom, weekTo),
    todayMs: focusMsInRange(sessions, todayFrom, todayTo),
    totalCompleted: completed.length,
    weekCompleted: completed.filter((t) => inRange(t.completedAt as number, weekFrom, weekTo)).length,
    todayCompleted: completed.filter((t) => inRange(t.completedAt as number, todayFrom, todayTo)).length,
  };
}

/** Sessions belong to exactly one bucket, so bucket totals always add up to the range total. */
export function bucketKey(s: FocusSession): string {
  if (s.quickRevision) return QUICK_REVISION_KEY;
  return s.subjectId ?? GENERAL_KEY;
}

export interface BucketInfo {
  key: string;
  name: string;
  color: string;
}

export function bucketInfo(key: string, subjects: Subject[]): BucketInfo {
  if (key === QUICK_REVISION_KEY) return { key, name: 'Quick Revision', color: QUICK_REVISION_COLOR };
  if (key === GENERAL_KEY) return { key, name: 'General', color: GENERAL_COLOR };
  const s = subjects.find((x) => x.id === key);
  if (!s) return { key, name: 'Archived subject', color: GENERAL_COLOR };
  return { key, name: s.name, color: s.color };
}

/**
 * Integer percentages that sum to exactly 100 (largest remainder method).
 * Returns all zeros when the total is not positive.
 */
export function largestRemainderPercent(values: number[]): number[] {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (Math.max(0, v) * 100) / total);
  const floors = raw.map((r) => Math.floor(r));
  let deficit = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  for (let j = 0; j < order.length && deficit > 0; j++) {
    out[order[j].i] += 1;
    deficit--;
  }
  return out;
}

export interface BreakdownRow extends BucketInfo {
  ms: number;
  pct: number;
}

export function subjectBreakdown(sessions: FocusSession[], subjects: Subject[], from: number, to: number): BreakdownRow[] {
  const totals = new Map<string, number>();
  for (const s of live(sessions)) {
    const ms = clipMs(s.segments, from, to);
    if (ms <= 0) continue;
    const k = bucketKey(s);
    totals.set(k, (totals.get(k) ?? 0) + ms);
  }
  const rows = [...totals.entries()]
    .map(([key, ms]) => ({ ...bucketInfo(key, subjects), ms, pct: 0 }))
    .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name));
  const pcts = largestRemainderPercent(rows.map((r) => r.ms));
  rows.forEach((r, i) => (r.pct = pcts[i]));
  return rows;
}

export interface CategorySplit {
  current: number;
  pending: number;
  other: number;
}

export function categorySplit(sessions: FocusSession[], from: number, to: number): CategorySplit {
  const out: CategorySplit = { current: 0, pending: 0, other: 0 };
  for (const s of live(sessions)) {
    const ms = clipMs(s.segments, from, to);
    if (ms <= 0) continue;
    const c: Category | null = s.category;
    if (c === 'current') out.current += ms;
    else if (c === 'pending') out.pending += ms;
    else out.other += ms;
  }
  return out;
}

/** Focus ms per local day across all history. */
export function focusByDay(sessions: FocusSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of live(sessions)) {
    for (const seg of s.segments) {
      splitByDay(seg, (k, ms) => map.set(k, (map.get(k) ?? 0) + ms));
    }
  }
  return map;
}

export function dailyTotals(sessions: FocusSession[], days: string[]): { day: string; ms: number }[] {
  const map = focusByDay(sessions);
  return days.map((day) => ({ day, ms: map.get(day) ?? 0 }));
}

export interface DayStack {
  day: string;
  total: number;
  parts: { key: string; ms: number }[];
}

export function dailySubjectStacks(sessions: FocusSession[], days: string[]): DayStack[] {
  const wanted = new Set(days);
  const perDay = new Map<string, Map<string, number>>();
  for (const s of live(sessions)) {
    const k = bucketKey(s);
    for (const seg of s.segments) {
      splitByDay(seg, (day, ms) => {
        if (!wanted.has(day)) return;
        let m = perDay.get(day);
        if (!m) perDay.set(day, (m = new Map()));
        m.set(k, (m.get(k) ?? 0) + ms);
      });
    }
  }
  return days.map((day) => {
    const m = perDay.get(day) ?? new Map<string, number>();
    const parts = [...m.entries()].map(([key, ms]) => ({ key, ms })).sort((a, b) => b.ms - a.ms || a.key.localeCompare(b.key));
    return { day, total: parts.reduce((a, p) => a + p.ms, 0), parts };
  });
}

export interface GridPiece {
  start: number;
  end: number;
  key: string;
  sessionId: string;
  status: SessionStatus;
}

/**
 * Segment pieces per day (split at midnight), for the Pomodoro Records grid and the day
 * timeline. Failed Strict Mode runs are included only when asked for.
 */
export function dayGridSegments(sessions: FocusSession[], days: string[], options: { includeFailed?: boolean } = {}): Map<string, GridPiece[]> {
  const wanted = new Set(days);
  const out = new Map<string, GridPiece[]>(days.map((d) => [d, []]));
  const source = options.includeFailed ? notDeleted(sessions) : live(sessions);
  for (const s of source) {
    const k = bucketKey(s);
    for (const seg of s.segments) {
      splitByDay(seg, (day, _ms, a, b) => {
        if (!wanted.has(day)) return;
        out.get(day)!.push({ start: a, end: b, key: k, sessionId: s.id, status: s.status });
      });
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.start - b.start);
  return out;
}

export interface MonthDay {
  day: string;
  ms: number;
  ratio: number;
  goalMet: boolean;
  isFuture: boolean;
}

export interface MonthGoalStats {
  days: MonthDay[];
  focusDays: number;
  completedGoalDays: number;
  /** Completed goal days as a percentage of the days of the month that have started. */
  completionRate: number;
}

export function monthGoalStats(byDay: Map<string, number>, monthKey: string, goalMs: number, today: string): MonthGoalStats {
  const first = monthStartKey(monthKey);
  const last = addDays(first, daysInMonth(first) - 1);
  const days = dayRange(first, last).map((day) => {
    const ms = byDay.get(day) ?? 0;
    const ratio = goalMs > 0 ? Math.min(1, ms / goalMs) : 0;
    return { day, ms, ratio, goalMet: goalMs > 0 && ms >= goalMs, isFuture: day > today };
  });
  const elapsed = days.filter((d) => !d.isFuture).length;
  const focusDays = days.filter((d) => d.ms > 0).length;
  const completedGoalDays = days.filter((d) => d.goalMet).length;
  return {
    days,
    focusDays,
    completedGoalDays,
    completionRate: elapsed > 0 ? Math.round((completedGoalDays / elapsed) * 100) : 0,
  };
}

export type PeriodMode = 'daily' | 'weekly' | 'monthly';

export interface Period {
  mode: PeriodMode;
  anchor: string;
  from: number;
  to: number;
  /** Days covered by the period itself. */
  days: string[];
  /** Days shown in the stacked bar chart for this period. */
  chartDays: string[];
}

export function periodFor(mode: PeriodMode, anchor: string): Period {
  if (mode === 'daily') {
    return { mode, anchor, from: dayStart(anchor), to: dayEnd(anchor), days: [anchor], chartDays: lastNDays(anchor, 7) };
  }
  if (mode === 'weekly') {
    const wk = weekStartKey(anchor);
    const days = dayRange(wk, addDays(wk, 6));
    return { mode, anchor: wk, from: dayStart(wk), to: dayStart(addDays(wk, 7)), days, chartDays: days };
  }
  const first = monthStartKey(anchor);
  const days = dayRange(first, addDays(first, daysInMonth(first) - 1));
  return { mode, anchor: first, from: dayStart(first), to: dayStart(addMonths(first, 1)), days, chartDays: days };
}

export function shiftPeriod(mode: PeriodMode, anchor: string, dir: -1 | 1): string {
  if (mode === 'daily') return addDays(anchor, dir);
  if (mode === 'weekly') return addDays(weekStartKey(anchor), 7 * dir);
  return addMonths(monthStartKey(anchor), dir);
}

/** Counted focus ms grouped by a key; sessions where the key is null are skipped. */
export function focusMsBy(sessions: FocusSession[], key: (s: FocusSession) => string | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of live(sessions)) {
    const k = key(s);
    if (!k) continue;
    out.set(k, (out.get(k) ?? 0) + sessionMs(s));
  }
  return out;
}

export function focusMsByTask(sessions: FocusSession[]): Map<string, number> {
  return focusMsBy(sessions, (s) => s.taskId);
}

export function focusMsBySubject(sessions: FocusSession[]): Map<string, number> {
  return focusMsBy(sessions, (s) => s.subjectId);
}

/** Counted focus ms per chapter: the session's chapter, or the chapter of its task. */
export function focusMsByChapter(sessions: FocusSession[], tasks: Task[]): Map<string, number> {
  const chapterOfTask = new Map(tasks.filter((t) => t.chapterId).map((t) => [t.id, t.chapterId as string]));
  return focusMsBy(sessions, (s) => s.chapterId ?? (s.taskId ? chapterOfTask.get(s.taskId) ?? null : null));
}
