import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Task, TimerSelection } from '../types';
import {
  addFive as addFiveFn,
  bellCrossings,
  breakMinutesFor,
  breaksAfter,
  displayMs,
  elapsedMs,
  finish,
  initialTimer,
  isCountUp,
  isTimerState,
  nextBlockSelection,
  normalizeTimerState,
  pause as pauseFn,
  reset as resetFn,
  resume as resumeFn,
  selectionOf,
  setSelection as setSelectionFn,
  setTask as setTaskFn,
  start as startFn,
  startBreak,
  switchSection as switchSectionFn,
  switchTask as switchTaskFn,
  testLaps,
  tick,
  type Lap,
  type CompletedRun,
  type TimerState,
} from './timerMachine';
import { setTickerActive } from './ticker';
import { soundEngine } from '../audio/soundEngine';
import { syncEngine } from '../sync/syncEngine';
import { addBreakFromRun, addSession, changeHydration } from '../db/repo';
import { db } from '../db/db';
import { usePrefs } from '../state/PrefsProvider';
import { useSettings, useTasks } from '../hooks/useData';
import { useToday } from '../hooks/useNow';
import { formatClock, formatElapsedClock } from '../lib/format';
import { MINUTE, addDays, dayKey } from '../lib/time';

export const TIMER_KEY = 'study-space:timer';
const QUEUED_KEY = 'study-space:first-task-queued';
const CLAIM_KEY = 'study-space:sound-claims';
const EYE_REST_INTERVAL_MS = 20 * MINUTE;
const EYE_REST_SHOW_MS = 20_000;

export const BREAK_PROMPTS = [
  'Drink a glass of water and walk around the room for 2 minutes.',
  'Stand up and do 10 slow shoulder rolls.',
  'Stretch your neck and wrists away from the screen.',
  'Look out of a window at something far away and breathe slowly.',
  'Stand, reach both arms overhead and hold the stretch for 20 seconds.',
  'Walk to the kitchen, refill your water, and come back slowly.',
  'Roll your ankles and wrists in small circles, ten each way.',
  'Sit back, close your eyes and take five slow breaths.',
  'Stand up and gently touch your toes, or reach as far as is comfortable.',
  'Open a window or step outside for a minute of fresh air.',
];

function summaryOf(s: TimerState, at: number, early: boolean): TestSummary {
  const laps = testLaps(s, at);
  return { endedAt: at, plannedMinutes: s.minutes, totalMs: laps.reduce((a, l) => a + l.ms, 0), submittedEarly: early, laps };
}

function randomPrompt(previous: string | null): string {
  const options = BREAK_PROMPTS.filter((p) => p !== previous);
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Lets only one tab play each one-time sound. The check is not atomic, but tabs tick at
 * different moments, so in practice the first tab to reach the event claims it.
 */
function claimEvent(id: string): boolean {
  try {
    const claims = JSON.parse(localStorage.getItem(CLAIM_KEY) ?? '[]') as string[];
    if (claims.includes(id)) return false;
    localStorage.setItem(CLAIM_KEY, JSON.stringify([...claims.slice(-40), id]));
  } catch {
    /* storage unavailable: play anyway */
  }
  return true;
}

export interface TestSummary {
  endedAt: number;
  plannedMinutes: number;
  totalMs: number;
  /** True when the student pressed Submit Test before the time ran out. */
  submittedEarly: boolean;
  laps: Lap[];
}

export interface TimerValue {
  state: TimerState;
  activeTask: Task | null;
  modeLabel: string;
  running: boolean;
  /** True for a few seconds after a Quick Start rolls into its Pomodoro. */
  justContinued: boolean;
  /** True while the 20-20-20 reminder is showing. */
  eyeRestDue: boolean;
  dismissEyeRest: () => void;
  /** Movement prompt for the current break, or null outside breaks. */
  breakPrompt: string | null;
  nextBreakPrompt: () => void;
  /** Time of the last run stopped by Strict Mode, cleared by the UI. */
  strictStoppedAt: number | null;
  clearStrictStop: () => void;
  start: (opts?: { selection?: TimerSelection; taskId?: string | null }) => void;
  toggle: () => void;
  pause: () => void;
  resume: () => void;
  addFive: () => void;
  /**
   * Complete (Pomodoro, Quick Start) or Stop (Stopwatch) logs the focus run and starts the
   * recovery break at once; during a break it skips to idle.
   */
  complete: () => void;
  skipBreak: () => void;
  /** Ends the break (when one is running) and starts the next focus block with the same task. */
  startNextBlock: () => void;
  /** Ends the focus run at `at` (default now) and logs it as Failed (Strict Mode). */
  abortStrict: (at?: number) => void;
  reset: () => void;
  setSelection: (sel: TimerSelection) => void;
  /**
   * Chooses the task. During an active focus run the time so far is logged for the previous
   * task and the same countdown continues for the new one.
   */
  setTask: (taskId: string | null) => void;
  drinkWater: () => void;
  /** Test Mode: moves the clock to another subject's section. */
  setSection: (subjectId: string | null) => void;
  /** Time per subject of the test that just ended, until the student closes the summary. */
  testSummary: TestSummary | null;
  clearTestSummary: () => void;
}

const Ctx = createContext<TimerValue | null>(null);

function loadTimer(sel: TimerSelection): TimerState {
  try {
    const raw = JSON.parse(localStorage.getItem(TIMER_KEY) ?? 'null') as unknown;
    if (isTimerState(raw)) return normalizeTimerState(raw);
  } catch {
    /* ignore */
  }
  return initialTimer(sel);
}

export function modeLabelFor(s: TimerState): string {
  if (s.phase === 'break') return s.breakKind === 'long' ? 'Long break' : 'Short break';
  if (s.mode === 'stopwatch') return 'Stopwatch';
  if (s.mode === 'test') return `Test Mode, ${s.minutes}m paper`;
  if (s.mode === 'quickstart') {
    if (s.status === 'idle' || s.quickStartPending) return '3m Quick Start';
    return `Quick Start, ${s.minutes}m focus`;
  }
  return `${s.minutes}m focus`;
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const { prefs, setPrefs } = usePrefs();
  const settings = useSettings();
  const tasks = useTasks();
  const today = useToday();

  const [state, setState] = useState<TimerState>(() => loadTimer(prefs.timer));
  const [justContinued, setJustContinued] = useState(false);
  const [eyeRestDue, setEyeRestDue] = useState(false);
  const [breakPrompt, setBreakPrompt] = useState<string | null>(() => (state.phase === 'break' && state.status !== 'idle' ? randomPrompt(null) : null));
  const [strictStoppedAt, setStrictStoppedAt] = useState<number | null>(null);
  const [testSummary, setTestSummary] = useState<TestSummary | null>(null);

  const stateRef = useRef(state);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const prevElapsedRef = useRef(elapsedMs(state, Date.now()));
  const titleRef = useRef('');
  const eyeTimer = useRef<ReturnType<typeof setTimeout>>();

  const apply = useCallback((next: TimerState, broadcast: boolean) => {
    stateRef.current = next;
    setState(next);
    localStorage.setItem(TIMER_KEY, JSON.stringify(next));
    if (broadcast) syncEngine.postTimer(next);
  }, []);

  /**
   * After a paper the timer goes back to a normal Pomodoro, so the next Start Focus on a task
   * does not start another three-hour test.
   */
  const afterTest = useCallback(
    (idle: TimerState): TimerState => {
      const sel: TimerSelection = { mode: 'pomodoro', minutes: settingsRef.current.defaultPomodoroMinutes };
      setPrefs({ timer: sel });
      return setSelectionFn(idle, sel);
    },
    [setPrefs],
  );

  useEffect(() => {
    setTickerActive(state.status === 'running');
  }, [state.status, state.runningSince]);

  const log = useCallback((run: CompletedRun | null | undefined, failed = false) => {
    if (!run) return;
    if (run.phase === 'break') void addBreakFromRun(run);
    else void addSession(run, failed ? 'failed_strict' : 'completed');
  }, []);

  const showEyeRest = useCallback(() => {
    setEyeRestDue(true);
    clearTimeout(eyeTimer.current);
    eyeTimer.current = setTimeout(() => setEyeRestDue(false), EYE_REST_SHOW_MS);
  }, []);

  // Timer state from other tabs.
  useEffect(
    () =>
      syncEngine.onTimer((incoming) => {
        const remote = normalizeTimerState(incoming);
        prevElapsedRef.current = elapsedMs(remote, Date.now());
        if (remote.phase === 'break' && remote.status !== 'idle') setBreakPrompt((p) => p ?? randomPrompt(null));
        else setBreakPrompt(null);
        apply(remote, false);
      }),
    [apply],
  );

  // Tick loop: runs through refs, so nothing re-renders unless a transition happens.
  useEffect(() => {
    if (state.status !== 'running') return;
    const step = () => {
      const now = Date.now();
      const current = stateRef.current;
      const s = settingsRef.current;
      const elapsed = elapsedMs(current, now);
      const runId = current.segments[0]?.start ?? current.runningSince ?? 0;

      // Test Mode: no interval bells and no eye-rest prompts for the whole paper.
      if (current.phase === 'focus' && current.mode !== 'test') {
        const prev = prevElapsedRef.current;
        if (s.bellEnabled && s.bellIntervalMinutes > 0) {
          const n = bellCrossings(prev, elapsed, s.bellIntervalMinutes * MINUTE);
          if (n > 0 && claimEvent(`bell-${runId}-${Math.floor(elapsed / (s.bellIntervalMinutes * MINUTE))}`)) soundEngine.chime();
        }
        if (s.eyeRestEnabled && bellCrossings(prev, elapsed, EYE_REST_INTERVAL_MS) > 0) {
          showEyeRest();
          if (claimEvent(`eye-${runId}-${Math.floor(elapsed / EYE_REST_INTERVAL_MS)}`)) soundEngine.eyeRestTone();
        }
      }
      prevElapsedRef.current = elapsed;

      const result = tick(current, now);
      if (result.event === 'quick-start-continued') {
        apply(result.state, false);
        setJustContinued(true);
        setTimeout(() => setJustContinued(false), 5000);
      } else if (result.event === 'finished') {
        log(result.completed);
        const at = result.at ?? now;
        if (claimEvent(`done-${runId}`)) soundEngine.chime();
        const { kind, minutes } = breakMinutesFor(elapsedMs(current, at), result.state.cycle, s);
        prevElapsedRef.current = 0;
        if (!breaksAfter(current)) {
          // Time is up: show the paper's summary, no break.
          setTestSummary(summaryOf(current, at, false));
          apply(afterTest(result.state), false);
        } else if (minutes > 0) {
          apply(startBreak(result.state, kind, minutes * MINUTE, at), false);
          setBreakPrompt((p) => randomPrompt(p));
        } else {
          apply(result.state, false);
        }
      } else if (result.event === 'break-finished') {
        log(result.completed);
        if (claimEvent(`break-${runId}`)) soundEngine.chime();
        prevElapsedRef.current = 0;
        setBreakPrompt(null);
        apply(result.state, false);
      }

      // Tab title shows the clock while a run is active; written only when it changes.
      const shown = stateRef.current;
      const text = shown.status === 'idle' ? 'Study Space' : `${isCountUp(shown) ? formatElapsedClock(displayMs(shown, now)) : formatClock(displayMs(shown, now))} - Study Space`;
      if (text !== titleRef.current) {
        titleRef.current = text;
        document.title = text;
      }
    };
    step();
    const id = setInterval(step, 250);
    const onVisible = () => step();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [state.status, state.phase, apply, log, showEyeRest]);

  // Title when not running.
  useEffect(() => {
    if (state.status === 'running') return;
    const text = state.status === 'paused' ? `Paused - Study Space` : 'Study Space';
    titleRef.current = text;
    document.title = text;
  }, [state.status]);

  // Queue tomorrow's first task chosen in yesterday's Evening Review, once per day.
  useEffect(() => {
    if (localStorage.getItem(QUEUED_KEY) === today) return;
    let cancelled = false;
    void db.eveningReviews.get(addDays(today, -1)).then((review) => {
      if (cancelled) return;
      const taskId = review && !review.deleted ? review.tomorrowFirstTaskId : null;
      if (!taskId || stateRef.current.status !== 'idle') return;
      const task = tasks.find((t) => t.id === taskId && t.column !== 'completed');
      if (!task) return;
      localStorage.setItem(QUEUED_KEY, today);
      apply(setTaskFn(stateRef.current, task.id), true);
    });
    return () => {
      cancelled = true;
    };
  }, [today, tasks, apply]);

  const start = useCallback<TimerValue['start']>(
    (opts) => {
      soundEngine.unlock();
      let current = stateRef.current;
      if (current.status !== 'idle') {
        const done = finish(current, Date.now());
        log(done.completed);
        current = done.state;
      }
      const sel = opts?.selection ?? selectionOf(current);
      const taskId = opts && 'taskId' in opts ? (opts.taskId ?? null) : current.taskId;
      const next = startFn(current, sel, taskId, Date.now(), settingsRef.current.defaultPomodoroMinutes);
      prevElapsedRef.current = 0;
      setBreakPrompt(null);
      if (next.mode === 'test') {
        // Exam-hall rules: silence background audio and clear any eye-rest prompt.
        soundEngine.stop();
        setEyeRestDue(false);
        setTestSummary(null);
      }
      if (opts?.selection) setPrefs({ timer: selectionOf(next) });
      apply(next, true);
    },
    [apply, log, setPrefs],
  );

  const pause = useCallback(() => apply(pauseFn(stateRef.current, Date.now()), true), [apply]);
  const resume = useCallback(() => {
    soundEngine.unlock();
    apply(resumeFn(stateRef.current, Date.now()), true);
  }, [apply]);

  const toggle = useCallback(() => {
    const s = stateRef.current;
    if (s.status === 'running') pause();
    else if (s.status === 'paused') resume();
    else start();
  }, [pause, resume, start]);

  const addFive = useCallback(() => apply(addFiveFn(stateRef.current), true), [apply]);

  const complete = useCallback(() => {
    const current = stateRef.current;
    const now = Date.now();
    const runMs = elapsedMs(current, now);
    const { state: next, completed } = finish(current, now);
    if (!completed) return;
    log(completed);
    prevElapsedRef.current = 0;
    if (current.phase === 'focus') {
      soundEngine.chime();
      // Submit Test: the summary instead of a break.
      if (!breaksAfter(current)) {
        setTestSummary(summaryOf(current, now, true));
        setBreakPrompt(null);
        apply(afterTest(next), true);
        return;
      }
      // A focus run of at least a minute goes straight into the recovery break.
      if (runMs >= MINUTE) {
        const counted = { ...next, cycle: next.cycle + 1 };
        const { kind, minutes } = breakMinutesFor(runMs, counted.cycle, settingsRef.current);
        if (minutes > 0) {
          setBreakPrompt((p) => randomPrompt(p));
          apply(startBreak(counted, kind, minutes * MINUTE, now), true);
          return;
        }
        setBreakPrompt(null);
        apply(counted, true);
        return;
      }
    }
    setBreakPrompt(null);
    apply(next, true);
  }, [apply, log]);

  const skipBreak = useCallback(() => {
    if (stateRef.current.phase === 'break') complete();
  }, [complete]);

  const abortStrict = useCallback(
    (at?: number) => {
      const current = stateRef.current;
      if (current.phase !== 'focus' || current.status === 'idle') return;
      const end = Math.min(Date.now(), at ?? Date.now());
      const { state: next, completed } = finish(current, end);
      log(completed, true);
      prevElapsedRef.current = 0;
      setStrictStoppedAt(Date.now());
      apply(current.mode === 'test' ? afterTest(next) : next, true);
    },
    [apply, log],
  );

  const reset = useCallback(() => {
    prevElapsedRef.current = 0;
    setBreakPrompt(null);
    apply(resetFn(stateRef.current), true);
  }, [apply]);

  const setSelection = useCallback(
    (sel: TimerSelection) => {
      const next = setSelectionFn(stateRef.current, sel);
      setPrefs({ timer: selectionOf(next) });
      apply(next, true);
    },
    [apply, setPrefs],
  );

  const setTask = useCallback(
    (taskId: string | null) => {
      const { state: next, completed } = switchTaskFn(stateRef.current, taskId, Date.now());
      log(completed);
      apply(next, true);
    },
    [apply, log],
  );

  const setSection = useCallback(
    (subjectId: string | null) => {
      const { state: next, completed } = switchSectionFn(stateRef.current, subjectId, Date.now());
      if (next === stateRef.current) return;
      log(completed);
      apply(next, true);
    },
    [apply, log],
  );

  const startNextBlock = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'break' || current.status === 'idle') {
      if (current.status === 'idle') start();
      return;
    }
    start({ selection: nextBlockSelection(current), taskId: current.taskId });
  }, [start]);

  const drinkWater = useCallback(() => {
    void changeHydration(dayKey(Date.now()), 1, settingsRef.current.hydrationGoal);
  }, []);

  const activeTask = useMemo(() => tasks.find((t) => t.id === state.taskId) ?? null, [tasks, state.taskId]);

  const value = useMemo<TimerValue>(
    () => ({
      state,
      activeTask,
      modeLabel: modeLabelFor(state),
      running: state.status === 'running',
      justContinued,
      eyeRestDue,
      dismissEyeRest: () => setEyeRestDue(false),
      breakPrompt,
      nextBreakPrompt: () => setBreakPrompt((p) => randomPrompt(p)),
      strictStoppedAt,
      clearStrictStop: () => setStrictStoppedAt(null),
      start,
      toggle,
      pause,
      resume,
      addFive,
      complete,
      skipBreak,
      startNextBlock,
      abortStrict,
      reset,
      setSelection,
      setTask,
      drinkWater,
      setSection,
      testSummary,
      clearTestSummary: () => setTestSummary(null),
    }),
    [
      state,
      activeTask,
      justContinued,
      eyeRestDue,
      breakPrompt,
      strictStoppedAt,
      start,
      toggle,
      pause,
      resume,
      addFive,
      complete,
      skipBreak,
      startNextBlock,
      abortStrict,
      reset,
      setSelection,
      setTask,
      drinkWater,
      setSection,
      testSummary,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTimer(): TimerValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTimer must be used inside TimerProvider');
  return v;
}
