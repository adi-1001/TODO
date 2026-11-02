import { useMemo } from 'react';
import type { FocusSession } from '../types';
import { useTimer } from '../timer/TimerProvider';
import { useSessions } from './useData';
import { useNowWhile } from './useNow';

export const LIVE_SESSION_ID = 'live-run';
/** How often totals that include the running session refresh. */
export const LIVE_REFRESH_MS = 30_000;

/**
 * Stored sessions plus the focus run in progress, so totals and charts move while the timer
 * runs. The running part refreshes every 30 seconds instead of every tick, which keeps the
 * dashboard and charts from re-rendering once a second.
 */
export function useLiveSessions(): FocusSession[] {
  const sessions = useSessions();
  const { state, activeTask } = useTimer();
  const running = state.status === 'running' && state.phase === 'focus';
  // One shared 30-second clock for every caller, read only while a focus run is running, so an
  // idle dashboard never recomputes its totals on a timer.
  const clock = useNowWhile(running, LIVE_REFRESH_MS);
  // Right after a start or resume the shared clock can be up to 30 s old; never end the open
  // piece before it began.
  const now = running && state.runningSince !== null ? Math.max(clock, state.runningSince) : clock;

  return useMemo(() => {
    if (state.status === 'idle' || state.phase !== 'focus') return sessions;
    const segments = [...state.segments];
    if (state.runningSince !== null && now > state.runningSince) segments.push({ start: state.runningSince, end: now });
    if (segments.length === 0) return sessions;
    const live: FocusSession = {
      id: LIVE_SESSION_ID,
      updatedAt: 0,
      taskId: activeTask?.id ?? null,
      subjectId: activeTask?.subjectId ?? null,
      chapterId: activeTask?.chapterId ?? null,
      category: activeTask?.category ?? null,
      quickRevision: activeTask?.quickRevision ?? false,
      mode: state.mode,
      status: 'completed',
      segments,
      start: segments[0].start,
      end: segments[segments.length - 1].end,
      durationMs: segments.reduce((a, s) => a + s.end - s.start, 0),
      plannedMinutes: Math.round(state.targetMs / 60_000),
      createdAt: segments[0].start,
    };
    return [...sessions, live];
  }, [sessions, state, now, activeTask]);
}
