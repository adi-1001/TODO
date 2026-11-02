import { Expand, Eye, Minimize2, Play, Shield, Shrink } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSettings, useSubjects } from '../../hooks/useData';
import { useTickerNow } from '../../timer/ticker';
import { MAX_TEST_MINUTES, TEST_DEFAULT_MINUTES, TEST_PRESETS, testLaps } from '../../timer/timerMachine';
import { useIdle } from '../../hooks/useIdle';
import { useLiveSessions } from '../../hooks/useLiveSessions';
import { useNow, useToday } from '../../hooks/useNow';
import { useWakeLock } from '../../hooks/useWakeLock';
import { formatTimeOfDay } from '../../lib/format';
import { focusMsInRange } from '../../lib/stats';
import { dayEnd, dayStart } from '../../lib/time';
import { usePrefs } from '../../state/PrefsProvider';
import { useUI } from '../../state/UIProvider';
import { useTimer } from '../../timer/TimerProvider';
import { TimerProgressBar } from '../../timer/TimerReadout';
import { useSolarVisual } from '../../timer/useSolarVisual';
import { SolarAura } from '../ui/SolarAura';
import type { TimerMode } from '../../types';
import { Segmented } from '../ui/controls';
import { QuestionButton } from '../ui/QuestionButton';
import { TaskPicker } from '../ui/TaskPicker';
import { BreakScreen } from './BreakScreen';
import { ClockControls } from './ClockControls';
import { DigitalClock, PhasePill } from './DigitalClock';
import { FlipClock } from './FlipClock';
import { StrictModeChip, useStrictModeGuard } from './StrictModeGuard';
import { exitFullscreenAndWait, exitFullscreenQuietly, formatHoursMinutes, fullscreenSupported, isActivatableTarget, isTypingTarget, type ClockPopover } from './clockUtils';

const POMODORO_CHIPS = [15, 25, 50];

/**
 * Distraction-free clock overlay. Always mounted from App; opens on `useUI().clockOpen`.
 * The overlay mounts and unmounts in one frame with an opaque background, so the page under it
 * never shows through a fade. Only its content fades in.
 */
export function FullScreenClock() {
  const { clockOpen } = useUI();
  return createPortal(clockOpen ? <ClockOverlay /> : null, document.body);
}

const TodayTotal = memo(function TodayTotal() {
  const sessions = useLiveSessions();
  const today = useToday();
  const ms = useMemo(() => focusMsInRange(sessions, dayStart(today), dayEnd(today)), [sessions, today]);
  return <div className="tabular text-sm font-semibold text-zinc-700 dark:text-zinc-200">{formatHoursMinutes(ms)}</div>;
});

const WallClock = memo(function WallClock() {
  const now = useNow(1000);
  return <div className="tabular text-sm font-semibold text-zinc-700 dark:text-zinc-200">{formatTimeOfDay(now)}</div>;
});

/**
 * Solar Horizon backlight behind the focus and break screens. Its own component, so a phase
 * change re-renders only this layer. It breathes in Golden Hour while the timer runs; paused, it
 * keeps the colour and stands still. The overlay behind it stays opaque.
 */
const ClockAura = memo(function ClockAura() {
  const visual = useSolarVisual();
  const { running } = useTimer();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <SolarAura
        tone={visual.tone}
        breathe={visual.golden && running}
        className="absolute left-1/2 top-[46%] h-[min(120dvh,820px)] w-[min(140dvw,960px)] -translate-x-1/2 -translate-y-1/2"
      />
    </div>
  );
});

function TopStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{label}</div>
      {children}
    </div>
  );
}

function ClockOverlay() {
  const timer = useTimer();
  const { state, running, activeTask, modeLabel } = timer;
  const { prefs, setPrefs } = usePrefs();
  const { setClockOpen, modal } = useUI();
  const settings = useSettings();
  const guard = useStrictModeGuard();
  const held = useWakeLock(state.status !== 'idle');

  const [popover, setPopover] = useState<ClockPopover>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => document.fullscreenElement !== null);
  const controlsHidden = useIdle(3000, running && popover === null && !pickerOpen && !questionsOpen);

  const idle = state.status === 'idle';
  const paused = state.status === 'paused';
  const inBreak = state.phase === 'break' && !idle;
  // The big centre Start (IdleSetup) is on screen; the dock then leaves Start out.
  const centreStartShown = !inBreak && idle;

  // Lock page scroll behind the overlay.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Leave fullscreen first and remove the overlay only after the viewport has resized, so the
  // page underneath never appears mid-resize. Strict Mode watches the whole app, so closing the
  // clock never ends a strict run.
  const closingRef = useRef(false);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    void exitFullscreenAndWait().then(() => setClockOpen(false));
  }, [setClockOpen]);

  const testSummaryOpen = timer.testSummary !== null;

  /**
   * Start, pause or resume. Only Start Test asks for fullscreen: it turns on Strict Mode rules
   * for the paper, the tap is inside the already open clock, and no screen change happens.
   */
  const primary = useCallback(() => {
    if (state.status === 'running') timer.pause();
    else if (state.status === 'paused') timer.resume();
    else {
      if (state.mode === 'test') guard.enterFullscreen();
      timer.start();
    }
  }, [state.status, state.mode, timer, guard]);

  /** Turning Strict Mode on during an active focus run is the one other fullscreen request. */
  const toggleStrict = () => {
    const on = !prefs.strictMode;
    setPrefs({ strictMode: on });
    if (on && state.phase === 'focus' && !idle) guard.enterFullscreen();
  };

  // Keyboard: Space toggles, N opens the note, Escape closes a popover first. An open task list
  // handles Escape itself before this listener sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal || testSummaryOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (popover) setPopover(null);
        else requestClose();
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' || e.code === 'Space') {
        if (isActivatableTarget(e.target)) return;
        e.preventDefault();
        primary();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setPopover('note');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, testSummaryOpen, popover, requestClose, primary]);

  /** The dedicated fullscreen button: the only general way into browser fullscreen. */
  const toggleFullscreen = () => {
    if (document.fullscreenElement) exitFullscreenQuietly();
    else guard.enterFullscreen();
  };

  const fade = `transition-opacity duration-500 ${controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`;
  // Leaving fullscreen never ends a strict run, so the toggle is always offered where supported.
  const showFullscreenToggle = fullscreenSupported();

  return (
    // The outer layer is opaque from its first frame and never animates. z-[60] keeps it above
    // the Mini Timer (z-50) and the bottom nav (z-40), and below dialogs (z-[70]). It scrolls
    // when the content is taller than a short screen, so nothing is ever cut off.
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full-screen clock"
      className={`custom-scroll fixed inset-0 z-[60] h-[100dvh] w-[100dvw] touch-manipulation overflow-y-auto overflow-x-hidden overscroll-none bg-[#FAFAFA] text-zinc-900 dark:bg-[#0B0D12] dark:text-zinc-100 ${
        controlsHidden ? 'cursor-none' : ''
      }`}
    >
      <ClockAura />
      <div
        className="relative flex min-h-[100dvh] animate-fade-in flex-col justify-between p-3 sm:p-6"
      >
      {/* Top bar */}
      <header className={`relative flex shrink-0 items-start justify-between gap-3 px-2 pt-2 sm:px-2 sm:pt-1 short:px-1 short:pt-0 ${fade}`}>
        <div className="flex flex-wrap items-start gap-x-5 gap-y-2 short:gap-x-4 short:gap-y-1">
          <TopStat label="Today">
            <TodayTotal />
          </TopStat>
          <TopStat label="Time">
            <WallClock />
          </TopStat>
          <div className="flex flex-col items-start gap-1 pt-0.5">
            {guard.active && <StrictModeChip />}
            {held && <span className="text-[10px] text-zinc-400 dark:text-zinc-500">Screen stays on</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {showFullscreenToggle && (
            <button
              type="button"
              className="icon-btn h-10 w-10 short:h-8 short:w-8"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit browser full screen' : 'Enter browser full screen'}
              title={isFullscreen ? 'Exit browser full screen' : 'Enter browser full screen'}
            >
              {isFullscreen ? <Shrink size={18} strokeWidth={1.75} /> : <Expand size={18} strokeWidth={1.75} />}
            </button>
          )}
          <button type="button" className="icon-btn h-10 w-10 short:h-8 short:w-8" onClick={requestClose} aria-label="Close full-screen clock" title="Close full-screen clock">
            <Minimize2 size={18} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* Banners */}
      <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex flex-col items-center gap-2 px-4 sm:top-24 short:top-12">
        {timer.eyeRestDue && (
          <div role="status" className="pointer-events-auto flex w-full max-w-md animate-fade-in items-center gap-3 rounded-2xl border border-sky-500/20 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md dark:border-sky-300/15 dark:bg-[#12151C]/90">
            <Eye size={18} strokeWidth={1.75} className="shrink-0 text-sky-700 dark:text-sky-300" aria-hidden />
            <p className="flex-1 text-sm text-zinc-700 dark:text-zinc-200">Look at something about 20 feet away for 20 seconds.</p>
            <button type="button" className="btn-ghost shrink-0 px-2.5 py-1.5" onClick={timer.dismissEyeRest}>
              Dismiss
            </button>
          </div>
        )}
        {timer.strictStoppedAt !== null && (
          <div role="status" className="pointer-events-auto flex w-full max-w-md animate-fade-in items-start gap-3 rounded-2xl border border-zinc-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#12151C]/90">
            <Shield size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />
            <p className="flex-1 text-sm text-zinc-700 dark:text-zinc-200">The session stopped because Study Space was left for more than 3 seconds. It is saved as Failed (Strict Mode).</p>
            <button type="button" className="btn-ghost shrink-0 px-2.5 py-1.5" onClick={timer.clearStrictStop}>
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Centre */}
      <main className="flex w-full min-w-0 flex-1 flex-col items-center justify-center py-4 text-center short:py-1.5">
        {inBreak ? (
          <BreakScreen />
        ) : (
          <>
            {/* Task and +1 sit side by side on a phone held sideways to save height. */}
            <div className="flex max-w-full flex-col items-center gap-3 short:flex-row short:flex-wrap short:justify-center short:gap-x-3 short:gap-y-1">
              <TaskPicker variant="clock" align="center" side="auto" className="max-w-full" onOpenChange={setPickerOpen} />
              {activeTask && <QuestionButton variant="clock" onOpenChange={setQuestionsOpen} />}
            </div>
            {/* The phase pill's row is reserved for the whole run, so the pill never moves the clock. */}
            {!idle && (
              <div className="mt-3 flex min-h-7 w-full max-w-xl items-center justify-center px-2 short:mt-1 short:min-h-6">
                <PhasePill />
              </div>
            )}
            <div className={`flex w-full justify-center ${idle ? 'mt-6 short:mt-1.5' : 'mt-3 short:mt-1'}`}>{settings.clockStyle === 'flip' ? <FlipClock /> : <DigitalClock />}</div>
            <TimerProgressBar className="mt-8 w-[min(80dvw,560px)] short:mt-2.5 short:w-[min(72dvw,640px)]" />
            <div className="mt-4 text-sm font-medium text-zinc-500 short:mt-1.5 short:text-xs dark:text-zinc-400">{paused ? 'Paused' : modeLabel}</div>
            {state.mode === 'test' && !idle && <SectionSwitcher />}
            {timer.justContinued && (
              <div className="mt-2 text-sm text-zinc-500 short:mt-1 short:text-xs dark:text-zinc-400" role="status">
                Continuing into a <span className="tabular">{state.minutes}</span>-minute focus
              </div>
            )}
            {centreStartShown && <IdleSetup onStart={primary} />}
          </>
        )}
      </main>

      <ClockControls hidden={controlsHidden} popover={popover} setPopover={setPopover} onPrimary={primary} showPrimary={!centreStartShown} onToggleStrict={toggleStrict} />
      </div>
    </div>
  );
}

const SECTION_PILL = 'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition';

/**
 * Test Mode section switcher: one pill per subject. Tapping a pill moves the clock to that
 * subject's section; each pill shows its minutes so far. Only this row reads the ticker.
 */
const SectionSwitcher = memo(function SectionSwitcher() {
  const { state, setSection } = useTimer();
  const subjects = useSubjects();
  const now = useTickerNow();
  const minutes = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of testLaps(state, now)) m.set(l.subjectId ?? '', Math.floor(l.ms / 60_000));
    return m;
  }, [state, Math.floor(now / 15_000)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (subjects.length === 0) {
    return <p className="mt-4 text-xs text-zinc-500 short:mt-1.5 dark:text-zinc-400">Add subjects in the Syllabus Tracker to time each section of the paper.</p>;
  }
  const current = state.sectionSubjectId;
  return (
    <div className="mt-5 flex max-w-xl flex-col items-center gap-2 short:mt-1.5 short:max-w-3xl short:flex-row short:flex-wrap short:justify-center short:gap-1.5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Section</div>
      <div role="radiogroup" aria-label="Test section" className="flex flex-wrap justify-center gap-1.5">
        {subjects.map((s) => {
          const on = current === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSection(s.id)}
              className={`${SECTION_PILL} ${
                on
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-300/80 dark:bg-amber-300/90 dark:text-zinc-950'
                  : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/20'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              {s.name}
              <span className={`tabular ${on ? 'opacity-80' : 'text-zinc-400 dark:text-zinc-500'}`}>{minutes.get(s.id) ?? 0}m</span>
            </button>
          );
        })}
      </div>
      {current === null && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Tap the subject you are answering to time it.</p>}
    </div>
  );
});

/** Mode, length and the big Start button, shown while the timer is idle. */
function IdleSetup({ onStart }: { onStart: () => void }) {
  const { state, setSelection } = useTimer();
  const settings = useSettings();
  const test = state.mode === 'test';
  const chips = test ? TEST_PRESETS : POMODORO_CHIPS;
  const maxMinutes = test ? MAX_TEST_MINUTES : 240;
  const isChip = chips.includes(state.minutes);
  const [custom, setCustom] = useState(() => ((state.mode === 'pomodoro' || test) && !isChip ? String(state.minutes) : ''));

  const changeMode = (mode: TimerMode) => {
    setCustom('');
    setSelection({ mode, minutes: mode === 'pomodoro' ? settings.defaultPomodoroMinutes : mode === 'test' ? TEST_DEFAULT_MINUTES : 0 });
  };

  const onCustom = (raw: string) => {
    setCustom(raw);
    const n = Math.round(Number(raw));
    if (raw !== '' && Number.isFinite(n) && n >= 1 && n <= maxMinutes) setSelection({ mode: test ? 'test' : 'pomodoro', minutes: n });
  };

  return (
    // One centred column, or one row under the clock on a phone held sideways (wraps only when it must).
    <div className="mt-8 flex flex-col items-center gap-5 short:mt-2 short:flex-row short:flex-wrap short:justify-center short:gap-2">
      <Segmented<TimerMode>
        label="Timer mode"
        value={state.mode}
        onChange={changeMode}
        options={[
          { value: 'pomodoro', label: 'Pomodoro' },
          { value: 'quickstart', label: '3m Quick Start' },
          { value: 'stopwatch', label: 'Stopwatch' },
          { value: 'test', label: 'Test Mode' },
        ]}
      />
      {test && (
        <p className="max-w-md text-xs text-zinc-500 short:hidden dark:text-zinc-400">
          Exam simulation: background audio stops, bells and eye-rest prompts pause, and Strict Mode applies until you submit. Tap a subject during the paper to time each section.
        </p>
      )}
      {(state.mode === 'pomodoro' || test) && (
        <div className="flex flex-wrap items-center justify-center gap-2 short:gap-1.5">
          <div role="radiogroup" aria-label={test ? 'Test length' : 'Pomodoro length'} className="flex gap-2 short:gap-1.5">
            {chips.map((m) => {
              const active = state.minutes === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setCustom('');
                    setSelection({ mode: test ? 'test' : 'pomodoro', minutes: m });
                  }}
                  className={`tabular min-h-8 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition short:px-3 ${
                    active
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-300/80 dark:bg-amber-300/90 dark:text-zinc-950'
                      : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/20 dark:hover:text-white'
                  }`}
                >
                  {m}m
                </button>
              );
            })}
          </div>
          <label
            className={`flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
              !isChip ? 'border-zinc-900 text-zinc-900 dark:border-amber-300/80 dark:text-amber-200' : 'border-zinc-200 text-zinc-600 dark:border-white/10 dark:text-zinc-300'
            }`}
          >
            Custom
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={maxMinutes}
              value={custom}
              onChange={(e) => onCustom(e.target.value)}
              placeholder={isChip ? '' : String(state.minutes)}
              aria-label={`Custom ${test ? 'test' : 'Pomodoro'} length in minutes (1 to ${maxMinutes})`}
              className="tabular w-12 bg-transparent text-center outline-none placeholder:text-zinc-400"
            />
            <span className="text-zinc-400 dark:text-zinc-500">min</span>
          </label>
        </div>
      )}
      <button
        type="button"
        onClick={onStart}
        className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-8 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-zinc-700 short:rounded-xl short:px-5 short:py-2 short:text-sm dark:bg-amber-300/90 dark:text-zinc-950 dark:hover:bg-amber-200"
      >
        <Play size={18} strokeWidth={1.75} />
        {test ? 'Start Test' : 'Start'}
      </button>
    </div>
  );
}
