import { MINUTE, addDays, lastNDays } from './time';

/** Floor for the qualifying time, and the default when no goal is given. */
export const ACTIVE_THRESHOLD_MS = 15 * MINUTE;

export const DEFAULT_STREAK_PERCENT = 80;
export const STREAK_PERCENT_PRESETS = [75, 80, 100];

/**
 * Focus needed on a day for it to count toward the streak and consistency: the chosen share
 * (50 to 100 percent) of the daily goal, never less than 15 minutes.
 */
export function streakThresholdMs(dailyGoalMinutes: number, percent: number): number {
  const goal = Number.isFinite(dailyGoalMinutes) && dailyGoalMinutes > 0 ? dailyGoalMinutes : 0;
  const pct = Number.isFinite(percent) ? Math.min(100, Math.max(50, percent)) : DEFAULT_STREAK_PERCENT;
  return Math.max(ACTIVE_THRESHOLD_MS, Math.round((goal * pct) / 100) * MINUTE);
}

type DayTotals = Map<string, number> | Record<string, number>;

function getMs(totals: DayTotals, day: string): number {
  if (totals instanceof Map) return totals.get(day) ?? 0;
  return totals[day] ?? 0;
}

export function isActiveDay(totals: DayTotals, day: string, thresholdMs = ACTIVE_THRESHOLD_MS): boolean {
  return getMs(totals, day) >= thresholdMs;
}

/**
 * Consecutive qualifying days ending today (or yesterday when today has not qualified yet).
 * Rest days that do not qualify are skipped: they neither break nor extend the streak.
 */
export function computeStreak(totals: DayTotals, restDays: ReadonlySet<string>, today: string, thresholdMs = ACTIVE_THRESHOLD_MS): number {
  let k = today;
  if (!isActiveDay(totals, today, thresholdMs) && !restDays.has(today)) k = addDays(today, -1);
  let count = 0;
  for (let guard = 0; guard < 5000; guard++) {
    if (isActiveDay(totals, k, thresholdMs)) count++;
    else if (!restDays.has(k)) break;
    k = addDays(k, -1);
  }
  return count;
}

/**
 * Rolling consistency as a whole percentage: qualifying days divided by the days in the
 * window that are not non-qualifying rest days. Returns 0 when nothing is left to count.
 */
export function computeConsistency(totals: DayTotals, restDays: ReadonlySet<string>, today: string, window = 30, thresholdMs = ACTIVE_THRESHOLD_MS): number {
  const days = lastNDays(today, window);
  let active = 0;
  let restInactive = 0;
  for (const d of days) {
    if (isActiveDay(totals, d, thresholdMs)) active++;
    else if (restDays.has(d)) restInactive++;
  }
  const denom = window - restInactive;
  if (denom <= 0) return 0;
  return Math.round((active / denom) * 100);
}

/** Longest run in history, with the same rest-day rule. */
export function longestStreak(totals: DayTotals, restDays: ReadonlySet<string>, from: string, to: string, thresholdMs = ACTIVE_THRESHOLD_MS): number {
  let best = 0;
  let run = 0;
  let k = from;
  for (let guard = 0; guard < 5000 && k <= to; guard++) {
    if (isActiveDay(totals, k, thresholdMs)) {
      run++;
      best = Math.max(best, run);
    } else if (!restDays.has(k)) {
      run = 0;
    }
    k = addDays(k, 1);
  }
  return best;
}

export type StreakLock =
  | { state: 'rest' }
  | { state: 'locked'; percent: number }
  | { state: 'needed'; remainingMs: number; thresholdMs: number; percent: number };

/** Whether today already counts toward the streak, and how much focus is still needed. */
export function streakLock(todayMs: number, thresholdMs: number, percent: number, todayIsRest: boolean): StreakLock {
  if (todayMs >= thresholdMs) return { state: 'locked', percent };
  if (todayIsRest) return { state: 'rest' };
  return { state: 'needed', remainingMs: thresholdMs - Math.max(0, todayMs), thresholdMs, percent };
}
