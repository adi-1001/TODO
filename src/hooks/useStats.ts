import { useMemo, useSyncExternalStore } from 'react';
import { focusByDay } from '../lib/stats';
import { computeConsistency, computeStreak, streakLock, streakThresholdMs, type StreakLock } from '../lib/streak';
import { syncEngine, type SyncInfo } from '../sync/syncEngine';
import { useRestDays, useSessions, useSettings } from './useData';
import { useLiveSessions } from './useLiveSessions';
import { useToday } from './useNow';

export function useFocusByDay(): Map<string, number> {
  const sessions = useSessions();
  return useMemo(() => focusByDay(sessions), [sessions]);
}

export interface StreakInfo {
  streak: number;
  consistency: number;
  todayIsRest: boolean;
  today: string;
  /** Focus a day needs to count: streakThresholdPercent of the daily goal. */
  thresholdMs: number;
  thresholdPercent: number;
}

export function useStreakInfo(): StreakInfo {
  const byDay = useFocusByDay();
  const rest = useRestDays();
  const today = useToday();
  const settings = useSettings();
  const percent = settings.streakThresholdPercent;
  const thresholdMs = streakThresholdMs(settings.dailyGoalMinutes, percent);
  return useMemo(
    () => ({
      streak: computeStreak(byDay, rest, today, thresholdMs),
      consistency: computeConsistency(byDay, rest, today, 30, thresholdMs),
      todayIsRest: rest.has(today),
      today,
      thresholdMs,
      thresholdPercent: percent,
    }),
    [byDay, rest, today, thresholdMs, percent],
  );
}

export function useSyncInfo(): SyncInfo {
  return useSyncExternalStore(
    (fn) => syncEngine.subscribe(fn),
    () => syncEngine.getInfo(),
    () => syncEngine.getInfo(),
  );
}

export function syncStatusText(info: SyncInfo): string {
  switch (info.status) {
    case 'cloud':
      return 'PC and phone in sync';
    case 'connecting':
      return 'Connecting to cloud';
    case 'error':
      return 'Cloud paused, retrying';
    case 'paused':
      return 'Sync paused';
    default:
      return info.cloudAvailable ? 'This device only' : 'All tabs on this device';
  }
}

/**
 * Today's streak lock-in, including the running session (live sessions refresh every 30
 * seconds while a timer runs).
 */
export function useStreakLock(): StreakLock & { thresholdMs: number; todayMs: number } {
  const sessions = useLiveSessions();
  const { today, todayIsRest, thresholdMs, thresholdPercent } = useStreakInfo();
  return useMemo(() => {
    const todayMs = focusByDay(sessions).get(today) ?? 0;
    return { ...streakLock(todayMs, thresholdMs, thresholdPercent, todayIsRest), thresholdMs, todayMs };
  }, [sessions, today, todayIsRest, thresholdMs, thresholdPercent]);
}
