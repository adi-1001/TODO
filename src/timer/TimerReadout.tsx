import { memo, type CSSProperties } from 'react';
import { LiquidBar } from '../components/ui/LiquidBar';
import { formatClock, formatElapsedClock } from '../lib/format';
import type { SolarTone } from '../lib/solarPhase';
import { displayMs, elapsedMs, isCountUp, phaseProgress, remainingMs } from './timerMachine';
import { useTickerNow } from './ticker';
import { useTimer } from './TimerProvider';
import { useSolarVisual } from './useSolarVisual';

/**
 * Components that redraw on every tick. They read the time from the ticker store, so only
 * they re-render; their parents re-render only when the timer state changes.
 */

const GPU: CSSProperties = { willChange: 'transform, opacity' };

export interface TimerReadoutValue {
  display: number;
  elapsed: number;
  remaining: number;
  progress: number;
  countUp: boolean;
  text: string;
}

export function useTimerReadout(): TimerReadoutValue {
  const { state } = useTimer();
  const now = useTickerNow();
  const countUp = isCountUp(state);
  const display = displayMs(state, now);
  return {
    display,
    elapsed: elapsedMs(state, now),
    remaining: remainingMs(state, now),
    progress: phaseProgress(state, now),
    countUp,
    text: countUp ? formatElapsedClock(display) : formatClock(display),
  };
}

export const TimerDigits = memo(function TimerDigits({ className = '' }: { className?: string }) {
  const { text } = useTimerReadout();
  return (
    <span className={`tabular inline-block ${className}`} style={GPU} aria-live="off">
      {text}
    </span>
  );
});

/** Ring stroke per Solar Horizon tone, for light and dark surfaces. */
const RING_TONE: Record<SolarTone, string> = {
  sky: 'stroke-sky-500 dark:stroke-sky-300',
  teal: 'stroke-teal-500 dark:stroke-teal-300',
  gold: 'stroke-amber-500 dark:stroke-amber-300',
  radiant: 'stroke-amber-500 dark:stroke-amber-400',
  recovery: 'stroke-emerald-500 dark:stroke-emerald-300',
};
/** The same tones on a surface that is dark in both themes (the Mini Timer). */
const RING_TONE_ON_DARK: Record<SolarTone, string> = {
  sky: 'stroke-sky-300 dark:stroke-sky-300',
  teal: 'stroke-teal-300 dark:stroke-teal-300',
  gold: 'stroke-amber-300 dark:stroke-amber-300',
  radiant: 'stroke-amber-400 dark:stroke-amber-400',
  recovery: 'stroke-emerald-300 dark:stroke-emerald-300',
};

export interface TimerRingProps {
  size?: number;
  stroke?: number;
  className?: string;
  /** Tint the progress stroke with the Solar Horizon tone of an active run. */
  solar?: boolean;
  /** Use the tone colours for a surface that is dark in both themes. */
  onDark?: boolean;
}

export const TimerRing = memo(function TimerRing({ size = 16, stroke = 2.5, className = '', solar = false, onDark = false }: TimerRingProps) {
  const { progress } = useTimerReadout();
  const { running, state } = useTimer();
  // Returns a stable object between phase changes; this leaf re-renders on every tick anyway.
  const visual = useSolarVisual();
  const r = (size - stroke - 0.5) / 2;
  const c = 2 * Math.PI * r;
  const active = state.status !== 'idle';
  const strokeClass = solar && active ? (onDark ? RING_TONE_ON_DARK : RING_TONE)[visual.tone] : running ? 'stroke-peach-deep dark:stroke-amber-300' : 'stroke-zinc-400';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className={`shrink-0 -rotate-90 ${className}`} style={GPU}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-zinc-200 dark:stroke-zinc-700" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
        className={strokeClass}
      />
    </svg>
  );
});

export interface TimerProgressBarProps {
  /** Width and outer spacing of the bar, for example "mt-8 w-[min(80dvw,560px)]". */
  className?: string;
  /** Fill class to use instead of the Solar Horizon tone gradient. */
  barClassName?: string;
  /** Track height. */
  trackClassName?: string;
  /** Glowing dot on the leading tip. */
  spark?: boolean;
}

/**
 * Session progress as a Liquid Light-Sweep bar in the live Solar Horizon tone. The fill moves
 * with translateX only. It follows the 250 ms ticker with a 300 ms transition, and the sheen
 * runs only while the timer runs.
 */
export const TimerProgressBar = memo(function TimerProgressBar({ className = '', barClassName, trackClassName = 'h-1.5', spark = true }: TimerProgressBarProps) {
  const { progress } = useTimerReadout();
  const { running } = useTimer();
  const visual = useSolarVisual();
  return (
    <div className={className}>
      <LiquidBar value={progress} tone={visual.tone} label="Session progress" className={trackClassName} fillClassName={barClassName} durationMs={300} sheen={running} spark={spark} />
    </div>
  );
});
