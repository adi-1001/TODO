import { Hourglass, Sparkles, Sunset, type LucideIcon } from 'lucide-react';
import { memo, type CSSProperties } from 'react';
import { SOLAR, type SolarVisual } from '../../lib/solarPhase';
import { useTimerReadout } from '../../timer/TimerReadout';
import { useTimer } from '../../timer/TimerProvider';
import { useSolarVisual } from '../../timer/useSolarVisual';
import { phasePillText } from './clockUtils';

/** Grows with the width on a phone held upright and is held back by the height when it is sideways. */
export const CLOCK_DIGITS_STYLE: CSSProperties = { fontSize: 'clamp(2.75rem, min(16dvw, 22dvh), 7.5rem)' };

const GPU: CSSProperties = { willChange: 'transform, opacity' };

/**
 * Golden Hour digit colour: GOLD_DIGIT (#F5BE86) on the dark clock, a deeper amber on the light
 * one, where #F5BE86 on #FAFAFA would be too faint to read.
 */
export const GOLD_DIGIT_TEXT = 'text-[#B45309] dark:text-[#F5BE86]';
/** Final Finish Pulse colon colour: GOLD_COLON (#EAB308), a step deeper in light mode. */
export const GOLD_COLON_TEXT = 'text-[#CA8A04] dark:text-[#EAB308]';

/**
 * Countdown digits with the Solar Horizon colouring: gold seconds in Golden Hour, a pulsing gold
 * colon and a tick pulse on the seconds in the Final Finish Pulse (only while running). This is
 * a ticker leaf, like TimerDigits. The tick pulse restarts every second without remounting: two
 * nested wrappers take the one-shot animation on alternate seconds.
 */
export const SolarDigits = memo(function SolarDigits({ className = '' }: { className?: string }) {
  const { text } = useTimerReadout();
  const { running } = useTimer();
  const visual = useSolarVisual();
  const cut = text.lastIndexOf(':');
  if (cut < 0) {
    return (
      <span className={`tabular inline-block ${className}`} style={GPU} aria-live="off">
        {text}
      </span>
    );
  }
  const secs = text.slice(cut + 1);
  const pulse = visual.finish && running;
  const odd = Number(secs) % 2 === 1;
  return (
    <span className={`tabular inline-block ${className}`} style={GPU} aria-live="off">
      {text.slice(0, cut)}
      <span className={`inline-block ${visual.finish ? GOLD_COLON_TEXT : ''} ${pulse ? 'animate-gold-pulse' : ''}`}>:</span>
      <span className={`inline-block ${pulse && odd ? 'animate-tick-pulse' : ''}`}>
        <span className={`inline-block ${visual.golden ? GOLD_DIGIT_TEXT : ''} ${pulse && !odd ? 'animate-tick-pulse' : ''}`}>{secs}</span>
      </span>
    </span>
  );
});

/**
 * Frosted Solar Horizon phase pill ("Final Stretch • Wrap up current concept"). Renders nothing
 * outside the phases that carry a message. Re-renders only when the phase changes; a new message
 * fades in.
 */
/** Icon for a phase pill: an hourglass for checkpoints and the break ending, a sunset for Golden Hour, sparkles for the finish. */
export function phaseIconFor(visual: SolarVisual): LucideIcon {
  if (visual === SOLAR.breakEnd) return Hourglass;
  if (visual.finish) return Sparkles;
  return visual.golden ? Sunset : Hourglass;
}

export const PhasePill = memo(function PhasePill({ className = '' }: { className?: string }) {
  const visual = useSolarVisual();
  const text = phasePillText(visual);
  if (!text) return null;
  const Icon = phaseIconFor(visual);
  return (
    <div
      key={text}
      role="status"
      className={`inline-flex max-w-full animate-fade-in items-center justify-center gap-1.5 whitespace-normal break-normal rounded-full border border-amber-500/30 bg-amber-50/80 px-3 py-1 text-center text-[11px] font-semibold leading-snug text-amber-800 shadow-sm backdrop-blur-md sm:text-xs short:py-0.5 short:text-[11px] dark:border-amber-300/20 dark:border-t-amber-200/35 dark:bg-amber-300/[0.08] dark:text-amber-200 ${className}`}
    >
      <Icon size={14} strokeWidth={1.75} className="shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
});

/** Minimal digital clock. Only SolarDigits ticks. */
export const DigitalClock = memo(function DigitalClock() {
  return (
    <div role="timer" aria-label="Timer" style={CLOCK_DIGITS_STYLE}>
      <SolarDigits className="font-semibold leading-none tracking-tight text-zinc-900 dark:text-white" />
    </div>
  );
});
