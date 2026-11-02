import { useCallback, useSyncExternalStore } from 'react';
import { SOLAR, getTimerVisualPhase, type SolarVisual, type VisualMode } from '../lib/solarPhase';
import { getTickerNow, subscribeTicker } from './ticker';
import { elapsedMs, isCountUp, remainingMs, type TimerState } from './timerMachine';
import { useTimer } from './TimerProvider';

/** The engine's mode for a timer state: a Quick Start that rolled over counts as a Pomodoro. */
export function visualModeOf(s: TimerState): VisualMode {
  if (s.phase === 'break') return 'break';
  if (s.mode === 'quickstart') return s.quickStartPending ? 'quickstart' : 'pomodoro';
  return s.mode;
}

/** The Solar Horizon visual for a timer state at `now`. Idle shows the calm first phase. */
export function solarVisualFor(s: TimerState, now: number): SolarVisual {
  if (s.status === 'idle') return SOLAR.idle;
  if (isCountUp(s)) return getTimerVisualPhase('stopwatch', elapsedMs(s, now) / 1000, 0);
  // phaseMs is the length of the current countdown (it grows with +5 min). After a Quick Start
  // rolls over, the run's elapsed time includes the first 3 minutes, so measure this phase from
  // what is left of it instead.
  const phaseElapsed = Math.max(0, s.phaseMs - remainingMs(s, now));
  return getTimerVisualPhase(visualModeOf(s), phaseElapsed / 1000, s.phaseMs / 1000);
}

/**
 * The current Solar Horizon visual. It reads the 250 ms ticker but returns one of a few frozen
 * objects, so the calling component re-renders only when the phase changes (a handful of times
 * per session), never on every tick.
 */
export function useSolarVisual(): SolarVisual {
  const { state } = useTimer();
  const get = useCallback(() => solarVisualFor(state, getTickerNow()), [state]);
  return useSyncExternalStore(subscribeTicker, get, get);
}
