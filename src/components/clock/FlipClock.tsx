import { memo, useState, type CSSProperties } from 'react';
import { clockParts } from '../../lib/format';
import { useTimerReadout } from '../../timer/TimerReadout';
import { useTimer } from '../../timer/TimerProvider';
import { useSolarVisual } from '../../timer/useSolarVisual';
import { GOLD_DIGIT_TEXT } from './DigitalClock';

/**
 * Six-card split-flap clock: [H][H] : [M][M] : [S][S]. FlipClock is the only part that reads
 * the ticker; each pair and each digit card is memoized, so only a card whose own digit changed
 * re-renders and flips. The flip animates transform alone: the old top half folds down
 * (rotateX 0 to -90deg, origin bottom) while the new bottom half folds in (rotateX 90deg to 0,
 * origin top).
 */

const FLIP_CSS = `
.ss-flip-card { perspective: 5em; }
.ss-flip-top, .ss-flip-bottom {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  will-change: transform;
  animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  animation-fill-mode: both;
}
.ss-flip-top { transform-origin: 50% 100%; animation-name: ss-flip-top; animation-duration: 220ms; }
.ss-flip-bottom { transform-origin: 50% 0%; animation-name: ss-flip-bottom; animation-duration: 220ms; animation-delay: 90ms; }
@keyframes ss-flip-top { from { transform: rotateX(0deg); } to { transform: rotateX(-90deg); } }
@keyframes ss-flip-bottom { from { transform: rotateX(90deg); } to { transform: rotateX(0deg); } }
@media (prefers-reduced-motion: reduce) {
  .ss-flip-top { animation: none; opacity: 0; }
  .ss-flip-bottom { animation: none; }
}
`;

/**
 * Fluid sizes: the dvw part sizes the cards on an upright phone, the dvh part keeps them short when
 * the phone is held sideways. On a 360 px wide phone six 46.8 px cards plus the em-based gaps and
 * colons take about 312 px. Gaps and colons scale with the digit font size, not the card size.
 */
const FONT_SIZE = 'clamp(1.75rem, min(10dvw, 15dvh), 6rem)';
const CARD_W = 'clamp(2.4rem, min(13dvw, 18dvh), 7.5rem)';
const CARD_H = 'clamp(3.2rem, min(17dvw, 24dvh), 9.5rem)';
const CARD_STYLE: CSSProperties = { width: CARD_W, height: CARD_H };
const COLON_STYLE: CSSProperties = { height: CARD_H };

const pad = (n: number) => String(n).padStart(2, '0');

const HALF = 'absolute inset-x-0 h-1/2 overflow-hidden bg-white border-zinc-200 dark:bg-[#171B24] dark:border-white/[0.07]';
const TOP = `${HALF} top-0 rounded-t-[0.12em] border border-b-0`;
const BOTTOM = `${HALF} bottom-0 rounded-b-[0.12em] border border-t-0`;
const TOP_TEXT = 'absolute inset-x-0 top-0 flex h-[200%] items-center justify-center';
const BOTTOM_TEXT = 'absolute inset-x-0 bottom-0 flex h-[200%] items-center justify-center';

/** Golden Hour: a 1px gold top edge on the top half (both themes, so the dark border does not win). */
const GOLD_EDGE = 'border-t-amber-400/35 dark:border-t-amber-400/35';
const CARD = 'ss-flip-card tabular relative shrink-0 select-none rounded-[0.12em] font-semibold leading-none';
const CARD_PLAIN = 'text-zinc-900 shadow-sm dark:text-zinc-50';
const CARD_GOLD_GLOW = 'shadow-[0_8px_30px_rgba(234,179,8,0.12)]';

function Half({ value, part, className = '' }: { value: string; part: 'top' | 'bottom'; className?: string }) {
  return (
    <div className={`${part === 'top' ? TOP : BOTTOM} ${className}`}>
      <span className={part === 'top' ? TOP_TEXT : BOTTOM_TEXT}>{value}</span>
    </div>
  );
}

interface FlipDigitProps {
  value: string;
  /** Golden Hour: gold top edge and a warm glow on the card. */
  edge: boolean;
  /** Gold digit colour (the seconds in Golden Hour). */
  gold: boolean;
}

/** One digit card. Flips only when its own digit changes, and re-renders when its gold flags change. */
const FlipDigit = memo(function FlipDigit({ value, edge, gold }: FlipDigitProps) {
  // Remember the digit shown before the latest change (derived during render).
  const [pair, setPair] = useState({ cur: value, prev: value });
  if (pair.cur !== value) setPair({ cur: value, prev: pair.cur });
  const { cur, prev } = pair;
  const flipping = cur !== prev;
  const top = edge ? GOLD_EDGE : '';
  const tone = gold ? `${GOLD_DIGIT_TEXT} ${edge ? CARD_GOLD_GLOW : 'shadow-sm'}` : edge ? `text-zinc-900 dark:text-zinc-50 ${CARD_GOLD_GLOW}` : CARD_PLAIN;

  return (
    <div className={`${CARD} ${tone}`} style={CARD_STYLE} aria-hidden>
      {/* Static halves: the new top, and the old bottom until the flap lands on it. */}
      <Half value={cur} part="top" className={top} />
      <Half value={flipping ? prev : cur} part="bottom" />
      {flipping && (
        <>
          <Half key={`t-${cur}`} value={prev} part="top" className={`ss-flip-top z-10 ${top}`} />
          <Half key={`b-${cur}`} value={cur} part="bottom" className="ss-flip-bottom z-10" />
        </>
      )}
      {/* 1px seam across the middle of the card. */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 h-px -translate-y-1/2 bg-zinc-300 dark:bg-black/50" />
    </div>
  );
});

interface FlipPairProps {
  value: string;
  label: string;
  edge: boolean;
  gold: boolean;
  /**
   * Final Finish Pulse on this pair: 'odd' or 'even' after each tick, null when off. Two nested
   * wrappers take the one-shot tick pulse on alternate seconds, so the animation restarts every
   * second without remounting the cards (a remount would drop their flip).
   */
  pulse: 'odd' | 'even' | null;
}

/** Two (or, past 99 hours, more) digit cards with the label centred under them. */
const FlipPair = memo(function FlipPair({ value, label, edge, gold, pulse }: FlipPairProps) {
  const digits = value.split('');
  return (
    <div className="flex flex-col items-center gap-2 short:gap-1">
      <div className={pulse === 'odd' ? 'animate-tick-pulse' : ''}>
        <div className={`flex gap-[0.06em] ${pulse === 'even' ? 'animate-tick-pulse' : ''}`}>
          {digits.map((d, i) => (
            // Keyed from the right, so the ones digit keeps its card if the hours grow a digit.
            <FlipDigit key={digits.length - i} value={d} edge={edge} gold={gold} />
          ))}
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{label}</span>
    </div>
  );
});

const DOT = 'block h-[0.11em] w-[0.11em] rounded-full';

/** Colon dots: grey, or gold in the Final Finish Pulse (pulsing only while running). */
const Colon = memo(function Colon({ finish, pulse }: { finish: boolean; pulse: boolean }) {
  const dot = `${DOT} ${finish ? `bg-[#CA8A04] dark:bg-[#EAB308] ${pulse ? 'animate-gold-pulse' : ''}` : 'bg-zinc-300 dark:bg-zinc-600'}`;
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-[0.22em] px-[0.12em] short:px-[0.3em]" style={COLON_STYLE} aria-hidden>
      <span className={dot} />
      <span className={dot} />
    </div>
  );
});

/**
 * Reads the ticker and the Solar Horizon visual once and hands plain values to the memoized
 * pairs, so a tick re-renders only the pair whose digits changed (the seconds), and a phase
 * change re-renders the cards once.
 */
export const FlipClock = memo(function FlipClock() {
  const { display, countUp } = useTimerReadout();
  const { running } = useTimer();
  const { golden, finish } = useSolarVisual();
  const { h, m, s } = clockParts(display, countUp);
  const hh = pad(h);
  const mm = pad(m);
  const ss = pad(s);
  const pulsing = finish && running;
  const secondsPulse = pulsing ? (s % 2 === 1 ? 'odd' : 'even') : null;
  return (
    <div role="timer" aria-label="Timer" className="flex items-start justify-center" style={{ fontSize: FONT_SIZE }}>
      <style>{FLIP_CSS}</style>
      <FlipPair value={hh} label="Hours" edge={golden} gold={false} pulse={null} />
      <Colon finish={finish} pulse={pulsing} />
      <FlipPair value={mm} label="Minutes" edge={golden} gold={false} pulse={null} />
      <Colon finish={finish} pulse={pulsing} />
      <FlipPair value={ss} label="Seconds" edge={golden} gold={golden} pulse={secondsPulse} />
      <span className="sr-only">{`${hh}:${mm}:${ss}`}</span>
    </div>
  );
});
