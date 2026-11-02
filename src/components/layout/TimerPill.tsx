import { memo } from 'react';
import { Check, Maximize2, Pause, PictureInPicture2, Play, SkipForward, Square } from 'lucide-react';
import type { TimerSelection } from '../../types';
import { usePrefs } from '../../state/PrefsProvider';
import { useUI } from '../../state/UIProvider';
import { useTimer } from '../../timer/TimerProvider';
import { TimerDigits, TimerProgressBar, TimerRing } from '../../timer/TimerReadout';
import { useSolarVisual } from '../../timer/useSolarVisual';
import { phaseIconFor } from '../clock/DigitalClock';
import { phasePillHead, phasePillText } from '../clock/clockUtils';
import { QuestionButton } from '../ui/QuestionButton';
import { SolarAura } from '../ui/SolarAura';
import { TaskPicker } from '../ui/TaskPicker';
import { TEST_DEFAULT_MINUTES } from '../../timer/timerMachine';

const PRESET_MINUTES = [15, 25, 50];

interface Choice {
  value: string;
  label: string;
  selection: TimerSelection;
}

function choicesFor(currentMinutes: number | null, testMinutes: number = TEST_DEFAULT_MINUTES): Choice[] {
  const pomodoro = [...PRESET_MINUTES];
  if (currentMinutes !== null && !pomodoro.includes(currentMinutes)) pomodoro.push(currentMinutes);
  pomodoro.sort((a, b) => a - b);
  return [
    { value: 'quickstart', label: '3m Quick Start', selection: { mode: 'quickstart', minutes: 3 } },
    ...pomodoro.map((m) => ({ value: `p${m}`, label: `${m}m`, selection: { mode: 'pomodoro', minutes: m } as TimerSelection })),
    { value: 'stopwatch', label: 'Infinite Stopwatch', selection: { mode: 'stopwatch', minutes: 0 } },
    { value: 'test', label: `Test Mode (${testMinutes}m)`, selection: { mode: 'test', minutes: testMinutes } },
  ];
}

const ICON_BTN = 'icon-btn press h-9 w-9 shrink-0 sm:h-8 sm:w-8';

/**
 * Solar Horizon light for an active run: a soft glow behind the ring and a thin Liquid bar along
 * the bottom edge, both clipped to the card's corners. Re-renders only when the phase changes;
 * the bar is its own ticker leaf. It does not breathe, so the dashboard stays still.
 */
const PillGlow = memo(function PillGlow() {
  const visual = useSolarVisual();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <SolarAura tone={visual.tone} className="absolute -left-16 top-1/2 h-56 w-72 -translate-y-1/2" />
      <TimerProgressBar className="absolute inset-x-0 bottom-0" trackClassName="h-[3px]" spark={false} />
    </div>
  );
});

/**
 * The phase message, when the current phase has one: the full text as a small line under the
 * task on a phone, and its short head as a chip beside the task from sm up.
 */
const PhaseNote = memo(function PhaseNote() {
  const visual = useSolarVisual();
  const text = phasePillText(visual);
  if (!text) return null;
  const Icon = phaseIconFor(visual);
  return (
    <span
      key={text}
      role="status"
      title={text}
      className="flex basis-full animate-fade-in items-center gap-1.5 text-[11px] font-semibold leading-snug text-amber-700 dark:text-amber-200 sm:basis-auto sm:rounded-full sm:border sm:border-amber-500/30 sm:bg-amber-50 sm:px-2 sm:py-0.5 sm:dark:border-amber-300/20 sm:dark:bg-amber-300/[0.08]"
    >
      <Icon size={12} strokeWidth={1.75} className="shrink-0" aria-hidden />
      <span className="whitespace-normal break-normal sm:hidden">{text}</span>
      <span className="hidden whitespace-nowrap sm:inline">{phasePillHead(text)}</span>
    </span>
  );
});

/**
 * Active timer bar in the dashboard header. On a phone it is a two-row card: the ring, digits
 * and controls on top, and a full-width task selector below, so a long title gets the whole
 * width. From sm up the two groups join one row around the task selector. The digits, ring and
 * bar re-render on their own; this component re-renders only on timer transitions.
 */
export const TimerPill = memo(function TimerPill() {
  const timer = useTimer();
  const { prefs, setPrefs } = usePrefs();
  const { setClockOpen } = useUI();
  const { state, running } = timer;
  const active = state.status !== 'idle';
  const onBreak = active && state.phase === 'break';
  const stopwatch = state.mode === 'stopwatch';

  const value = state.mode === 'pomodoro' ? `p${state.minutes}` : state.mode;
  const choices = choicesFor(state.mode === 'pomodoro' ? state.minutes : null, state.mode === 'test' ? state.minutes : TEST_DEFAULT_MINUTES);

  const playLabel = running ? 'Pause' : state.status === 'paused' ? 'Resume' : state.mode === 'quickstart' ? 'Quick Start' : 'Start';
  const endLabel = stopwatch ? 'Stop stopwatch' : state.mode === 'test' ? 'Submit Test' : 'Complete session';

  // Strict Mode watches the whole app, so starting from here just starts.
  const onPlay = () => timer.toggle();

  return (
    <div className="relative flex w-full min-w-0 flex-col gap-2.5 rounded-2xl border border-zinc-200 bg-white p-3.5 dark:border-white/[0.08] dark:border-t-white/[0.14] dark:bg-white/[0.03] sm:w-auto sm:max-w-full sm:flex-row sm:items-center sm:gap-2 sm:py-2 sm:pl-3 sm:pr-2">
      {active && <PillGlow />}

      {/* Row 1 on a phone. From sm up its two groups sit either side of the task selector. */}
      <div className="relative flex min-w-0 items-center justify-between gap-2 sm:contents">
        <div className="relative flex shrink-0 items-center gap-2.5 sm:order-1 sm:gap-2">
          <TimerRing size={30} stroke={3} solar className="sm:h-6 sm:w-6" />
          <TimerDigits className="shrink-0 text-xl font-semibold leading-none tracking-tight text-zinc-900 dark:text-white sm:text-base" />
        </div>

        <div className="relative flex shrink-0 items-center gap-1.5 sm:order-3 sm:gap-1">
          <QuestionButton variant="pill" />
          <button
            type="button"
            onClick={onPlay}
            aria-label={playLabel}
            className="press inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-amber-300 px-3 text-xs font-bold text-zinc-950 shadow-sm transition hover:bg-amber-200 sm:h-8 sm:px-2.5 dark:bg-amber-300/90 dark:text-zinc-950 dark:hover:bg-amber-200"
          >
            {running ? <Pause size={14} strokeWidth={1.75} aria-hidden /> : <Play size={14} strokeWidth={1.75} aria-hidden />}
            <span className="hidden whitespace-nowrap sm:inline">{playLabel}</span>
          </button>
          {onBreak ? (
            <button type="button" onClick={timer.skipBreak} className={ICON_BTN} title="Skip break" aria-label="Skip break">
              <SkipForward size={14} strokeWidth={1.75} />
            </button>
          ) : (
            active && (
              <button type="button" onClick={timer.complete} className={ICON_BTN} title={endLabel} aria-label={endLabel}>
                {stopwatch ? <Square size={14} strokeWidth={1.75} /> : <Check size={14} strokeWidth={1.75} />}
              </button>
            )
          )}
          <button type="button" onClick={() => setClockOpen(true)} className={ICON_BTN} title="Expand Full-Screen Clock" aria-label="Expand Full-Screen Clock">
            <Maximize2 size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setPrefs({ miniOpen: !prefs.miniOpen })}
            className={`icon-btn press hidden h-8 w-8 shrink-0 sm:inline-flex ${prefs.miniOpen ? 'bg-amber-100 text-amber-900 dark:bg-amber-300/[0.12] dark:text-amber-200' : ''}`}
            title="Floating Mini-Timer"
            aria-label="Floating Mini-Timer"
            aria-pressed={prefs.miniOpen}
          >
            <PictureInPicture2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Row 2 on a phone: the task selector across the full width. It wraps rather than squeezes. */}
      <div className="relative flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 sm:order-2 sm:flex-1">
        <TaskPicker variant="bar" side="auto" className="min-w-[140px] flex-1 sm:min-w-[200px]" />
        {onBreak ? (
          <span className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-xl bg-emerald-500/10 px-2.5 text-[11px] font-semibold text-emerald-700 sm:h-8 dark:bg-emerald-400/10 dark:text-emerald-200">Break</span>
        ) : (
          <>
            <label className="sr-only" htmlFor="timer-pill-select">
              Timer mode
            </label>
            {/* Mode changes only while idle, so a phone shows the select only then. */}
            <select
              id="timer-pill-select"
              value={value}
              disabled={active}
              onChange={(e) => {
                const c = choices.find((x) => x.value === e.target.value);
                if (c) timer.setSelection(c.selection);
              }}
              className={`tabular h-9 shrink-0 cursor-pointer rounded-xl border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-600 focus:outline-none disabled:cursor-default disabled:opacity-60 sm:h-8 dark:border-white/[0.08] dark:bg-[#14171F] dark:text-zinc-300 ${
                active ? 'hidden sm:block' : 'block'
              }`}
            >
              {choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </>
        )}
        {active && <PhaseNote />}
      </div>
    </div>
  );
});
