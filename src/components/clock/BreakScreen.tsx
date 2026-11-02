import { Footprints, GlassWater, RotateCcw, SkipForward } from 'lucide-react';
import { useHydration, useSettings } from '../../hooks/useData';
import { useToday } from '../../hooks/useNow';
import { useTimer } from '../../timer/TimerProvider';
import { TimerProgressBar } from '../../timer/TimerReadout';
import { CLOCK_DIGITS_STYLE, PhasePill, SolarDigits } from './DigitalClock';

/**
 * Shown instead of the focus clock while a break runs. Upright phones and desktops get one
 * centred column. A phone held sideways (`short:`) gets two columns: the countdown and the skip
 * button on the left, the movement prompt and water on the right. The left wrapper is
 * `display: contents` in the single column, so its children keep the original order there, with
 * the skip button moved last by `order`.
 */
export function BreakScreen() {
  const { state, breakPrompt, nextBreakPrompt, drinkWater, startNextBlock } = useTimer();
  const settings = useSettings();
  const today = useToday();
  const glasses = useHydration(today);
  const paused = state.status === 'paused';

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center short:grid short:max-w-4xl short:grid-cols-12 short:items-center short:gap-4">
      <div className="contents short:col-span-5 short:flex short:flex-col short:items-center">
        {/* Reserved for the "Break ending in 30s" pill, so it appears without moving the countdown. */}
        <div className="mb-2 flex min-h-7 w-full items-center justify-center short:mb-1 short:min-h-6">
          <PhasePill />
        </div>
        <div className="mb-3 text-[11px] font-bold uppercase tracking-widest text-emerald-700/80 short:mb-1 dark:text-emerald-300/80">
          {state.breakKind === 'long' ? 'Long break' : 'Short break'}
          {paused && <span className="text-zinc-400 dark:text-zinc-500"> / Paused</span>}
        </div>
        <div role="timer" aria-label="Break time left" style={CLOCK_DIGITS_STYLE}>
          <SolarDigits className="font-semibold leading-none tracking-tight text-zinc-900 dark:text-white" />
        </div>
        {/* Recovery tone, warming to gold in the last 30 seconds. */}
        <TimerProgressBar className="mt-6 w-[min(80dvw,560px)] short:mt-3 short:w-full" />
        <button type="button" className="btn-primary order-1 mt-5 short:order-none short:mt-3" onClick={startNextBlock}>
          <SkipForward size={14} strokeWidth={1.75} />
          Skip Break / Start Next Block
        </button>
      </div>

      <div className="mt-8 w-full rounded-2xl border border-zinc-200 bg-white p-5 text-left short:col-span-7 short:mt-0 short:p-3 dark:border-white/[0.07] dark:bg-[#12151C]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 short:h-8 short:w-8 dark:bg-emerald-400/10 dark:text-emerald-300">
            <Footprints size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Move a little</div>
            <p className="mt-1 text-base font-medium text-zinc-800 short:mt-0.5 short:text-sm dark:text-zinc-100" aria-live="polite">
              {breakPrompt ?? 'Stand up, stretch and rest your eyes.'}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 short:mt-2.5">
          <button type="button" className="btn-soft" onClick={nextBreakPrompt}>
            <RotateCcw size={14} strokeWidth={1.75} />
            Another idea
          </button>
          <button type="button" className="btn-soft" onClick={drinkWater}>
            <GlassWater size={14} strokeWidth={1.75} />
            +1 Glass of Water
          </button>
          <span className="muted tabular ml-auto text-xs" aria-live="polite">
            Water today: {glasses} / {settings.hydrationGoal}
          </span>
        </div>
      </div>
    </div>
  );
}
