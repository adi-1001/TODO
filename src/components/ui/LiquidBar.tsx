import { memo, type CSSProperties } from 'react';
import type { SolarTone } from '../../lib/solarPhase';

/** Gradient fill per tone: the bar warms from sky through teal to amber gold. */
const FILL: Record<SolarTone, string> = {
  sky: 'bg-gradient-to-r from-sky-500 to-sky-300',
  teal: 'bg-gradient-to-r from-sky-400 via-teal-400 to-teal-300',
  gold: 'bg-gradient-to-r from-sky-400 via-teal-400 to-amber-400',
  radiant: 'bg-gradient-to-r from-teal-400 via-amber-400 to-amber-300',
  recovery: 'bg-gradient-to-r from-emerald-500 to-cyan-300',
};

export interface LiquidBarProps {
  /** 0..1 */
  value: number;
  tone?: SolarTone;
  label?: string;
  /** Track height and outer spacing, for example "h-2 mt-3". */
  className?: string;
  /** Fill class to use instead of the tone gradient. */
  fillClassName?: string;
  /** Glowing dot on the leading tip. */
  spark?: boolean;
  /** Slow diagonal light sheen across the filled part. */
  sheen?: boolean;
  /** Transition length of the fill in ms. Use a short one for bars that follow a ticking timer. */
  durationMs?: number;
  /** Plays a one-time grow-in when the bar first appears. */
  growIn?: boolean;
}

/**
 * Liquid Light-Sweep progress bar. The fill and the spark move with translateX only, and the
 * sheen is a transform animation, so the bar never triggers layout or paint of its neighbours.
 */
export const LiquidBar = memo(function LiquidBar({
  value,
  tone = 'gold',
  label,
  className = 'h-2',
  fillClassName,
  spark = true,
  sheen = true,
  durationMs = 1000,
  growIn = false,
}: LiquidBarProps) {
  const ratio = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const shift: CSSProperties = { transform: `translate3d(${(ratio - 1) * 100}%, 0, 0)`, transitionDuration: `${durationMs}ms` };
  return (
    <div
      className={`relative w-full ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`absolute inset-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/[0.07] ${growIn ? 'origin-left animate-bar-grow' : ''}`}>
        <div className={`relative h-full w-full overflow-hidden rounded-full transition-transform ease-out ${fillClassName ?? FILL[tone]}`} style={shift}>
          {sheen && ratio > 0 && (
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-white/45 to-transparent" />
          )}
        </div>
      </div>
      {spark && ratio > 0.005 && (
        // Same translation as the fill, outside the clipped track so the glow is not cut off.
        <div aria-hidden className="pointer-events-none absolute inset-0 transition-transform ease-out" style={shift}>
          <span className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_12px_#F59E0B]" />
        </div>
      )}
    </div>
  );
});
