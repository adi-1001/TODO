import type { Segment, TimerMode, TimerSelection } from '../types';
import { HOUR, MINUTE } from '../lib/time';

export type TimerStatus = 'idle' | 'running' | 'paused';
export type TimerPhase = 'focus' | 'break';
export type BreakKind = 'short' | 'long';

export interface TimerState {
  status: TimerStatus;
  phase: TimerPhase;
  mode: TimerMode;
  /** Pomodoro length, or the length a Quick Start continues into. 0 for the stopwatch. */
  minutes: number;
  taskId: string | null;
  /** Closed segments of the current phase. */
  segments: Segment[];
  /** Start of the open segment while running. */
  runningSince: number | null;
  /** Planned length of the current phase in ms. 0 for the stopwatch (no end). */
  targetMs: number;
  /** Length of the current countdown phase in ms, used for progress. */
  phaseMs: number;
  /** True during the first 3 minutes of a Quick Start run. */
  quickStartPending: boolean;
  breakKind: BreakKind | null;
  /** Focus runs finished since the last long break. */
  cycle: number;
  /**
   * Focus time from earlier pieces of this run that were already logged for another task
   * (the task was switched mid-run). Counted for the countdown, never logged again.
   */
  carriedMs: number;
  /** Test Mode: the subject of the current section, or null before one is chosen. */
  sectionSubjectId: string | null;
  /** Test Mode: focus ms of finished section pieces, keyed by subject id ('' for no subject). */
  laps: Record<string, number>;
}

export const TEST_DEFAULT_MINUTES = 180;
export const MAX_TEST_MINUTES = 600;
export const TEST_PRESETS = [60, 120, 180];

export const QUICK_START_MS = 3 * MINUTE;
export const ADD_FIVE_MS = 5 * MINUTE;
export const MAX_POMODORO_MINUTES = 240;

export interface CompletedRun {
  phase: TimerPhase;
  mode: TimerMode;
  taskId: string | null;
  segments: Segment[];
  targetMs: number;
  breakKind: BreakKind | null;
  /** Test Mode section subject for this piece, otherwise null. */
  sectionSubjectId: string | null;
}

export type TickEvent = 'none' | 'quick-start-continued' | 'finished' | 'break-finished';

export interface TickResult {
  state: TimerState;
  event: TickEvent;
  /** Exact moment the phase target was reached, for events other than 'none'. */
  at?: number;
  completed?: CompletedRun;
}

const clampMinutes = (m: number) => Math.min(MAX_POMODORO_MINUTES, Math.max(1, Math.round(Number.isFinite(m) ? m : 25)));

const clampTestMinutes = (m: number) => Math.min(MAX_TEST_MINUTES, Math.max(1, Math.round(Number.isFinite(m) && m > 0 ? m : TEST_DEFAULT_MINUTES)));

export function normalizeSelection(sel: TimerSelection): TimerSelection {
  const mode: TimerMode = sel.mode === 'quickstart' || sel.mode === 'stopwatch' || sel.mode === 'test' ? sel.mode : 'pomodoro';
  if (mode === 'pomodoro') return { mode, minutes: clampMinutes(sel.minutes) };
  if (mode === 'test') return { mode, minutes: clampTestMinutes(sel.minutes) };
  if (mode === 'quickstart') return { mode, minutes: 3 };
  return { mode, minutes: 0 };
}

function idleTargetMs(sel: TimerSelection): number {
  if (sel.mode === 'pomodoro' || sel.mode === 'test') return sel.minutes * MINUTE;
  if (sel.mode === 'quickstart') return QUICK_START_MS;
  return 0;
}

export function initialTimer(sel: TimerSelection = { mode: 'pomodoro', minutes: 25 }, taskId: string | null = null, cycle = 0): TimerState {
  const s = normalizeSelection(sel);
  const ms = idleTargetMs(s);
  return {
    status: 'idle',
    phase: 'focus',
    mode: s.mode,
    minutes: s.minutes,
    taskId,
    segments: [],
    runningSince: null,
    targetMs: ms,
    phaseMs: ms,
    quickStartPending: false,
    breakKind: null,
    cycle,
    carriedMs: 0,
    sectionSubjectId: null,
    laps: {},
  };
}

/** The selection a state was started with, as shown in the timer pill. */
export function selectionOf(s: TimerState): TimerSelection {
  if (s.mode === 'pomodoro' || s.mode === 'test') return { mode: s.mode, minutes: s.minutes };
  return normalizeSelection({ mode: s.mode, minutes: 0 });
}

function closedMs(s: TimerState): number {
  let total = 0;
  for (const seg of s.segments) total += Math.max(0, seg.end - seg.start);
  return total;
}

export function elapsedMs(s: TimerState, now: number): number {
  const open = s.runningSince !== null ? Math.max(0, now - s.runningSince) : 0;
  return (s.carriedMs || 0) + closedMs(s) + open;
}

/** Focus time of the whole run so far, including pieces logged for an earlier task. */
export function runFocusMs(s: TimerState, now: number): number {
  return s.phase === 'focus' && s.status !== 'idle' ? elapsedMs(s, now) : 0;
}

export function isCountUp(s: TimerState): boolean {
  return s.phase === 'focus' && s.mode === 'stopwatch';
}

/** Time left in the current phase. The stopwatch has no end and reports 0. */
export function remainingMs(s: TimerState, now: number): number {
  if (s.status === 'idle') return s.targetMs;
  if (isCountUp(s)) return 0;
  return Math.max(0, s.targetMs - elapsedMs(s, now));
}

/** What the clock shows: elapsed time for the stopwatch, remaining time otherwise. */
export function displayMs(s: TimerState, now: number): number {
  return isCountUp(s) ? elapsedMs(s, now) : remainingMs(s, now);
}

/** 0..1 progress through the current phase. The stopwatch sweeps once per hour. */
export function phaseProgress(s: TimerState, now: number): number {
  if (s.status === 'idle') return 0;
  if (isCountUp(s)) return (elapsedMs(s, now) % HOUR) / HOUR;
  if (s.phaseMs <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - remainingMs(s, now) / s.phaseMs));
}

export function setSelection(s: TimerState, sel: TimerSelection): TimerState {
  if (s.status !== 'idle') return s;
  return initialTimer(sel, s.taskId, s.cycle);
}

export function setTask(s: TimerState, taskId: string | null): TimerState {
  return { ...s, taskId };
}

/**
 * Changes the task during a run. In an active focus run the time so far is returned as a
 * completed run for the previous task, and the same countdown or stopwatch continues for the
 * new task: the displayed time and progress do not change. Otherwise only the task changes.
 */
export function switchTask(s: TimerState, taskId: string | null, now: number): { state: TimerState; completed: CompletedRun | null } {
  if (taskId === s.taskId) return { state: s, completed: null };
  if (s.status === 'idle' || s.phase !== 'focus') return { state: setTask(s, taskId), completed: null };
  return splitRun(s, now, { taskId });
}

const lapKey = (subjectId: string | null) => subjectId ?? '';

/**
 * Closes the current piece of an active focus run and continues the same countdown with
 * `patch` applied. The piece is returned for logging, and in Test Mode it is added to the
 * current section's lap.
 */
function splitRun(s: TimerState, now: number, patch: Partial<Pick<TimerState, 'taskId' | 'sectionSubjectId'>>): { state: TimerState; completed: CompletedRun | null } {
  const segments = closeAt(s, now);
  const pieceMs = segments.reduce((a, seg) => a + Math.max(0, seg.end - seg.start), 0);
  const laps = s.mode === 'test' && pieceMs > 0 ? { ...s.laps, [lapKey(s.sectionSubjectId)]: (s.laps[lapKey(s.sectionSubjectId)] ?? 0) + pieceMs } : s.laps;
  const next: TimerState = {
    ...s,
    ...patch,
    segments: [],
    runningSince: s.status === 'running' ? now : null,
    carriedMs: (s.carriedMs || 0) + pieceMs,
    laps,
  };
  return { state: next, completed: pieceMs > 0 ? completedFrom(s, segments) : null };
}

/**
 * Test Mode: moves the clock to another subject's section. The time so far is logged for the
 * previous section and added to its lap; the paper's countdown carries on unchanged.
 */
export function switchSection(s: TimerState, subjectId: string | null, now: number): { state: TimerState; completed: CompletedRun | null } {
  if (s.mode !== 'test' || subjectId === s.sectionSubjectId) return { state: s, completed: null };
  if (s.status === 'idle' || s.phase !== 'focus') return { state: { ...s, sectionSubjectId: subjectId }, completed: null };
  return splitRun(s, now, { sectionSubjectId: subjectId });
}

export interface Lap {
  subjectId: string | null;
  ms: number;
}

/** Time per section so far in a Test Mode run, including the open piece. Largest first. */
export function testLaps(s: TimerState, now: number): Lap[] {
  const totals = new Map<string, number>(Object.entries(s.laps ?? {}));
  if (s.mode === 'test' && s.status !== 'idle' && s.phase === 'focus') {
    const open = s.segments.reduce((a, seg) => a + Math.max(0, seg.end - seg.start), 0) + (s.runningSince !== null ? Math.max(0, now - s.runningSince) : 0);
    const k = lapKey(s.sectionSubjectId);
    if (open > 0) totals.set(k, (totals.get(k) ?? 0) + open);
  }
  return [...totals.entries()]
    .filter(([, ms]) => ms > 0)
    .map(([k, ms]) => ({ subjectId: k === '' ? null : k, ms }))
    .sort((a, b) => b.ms - a.ms);
}

export interface BreakSettings {
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;
}

/** Runs of this length or more earn a longer break. */
export const LONG_RUN_MS = 40 * MINUTE;
const LONG_RUN_BREAK_MINUTES = 10;

/**
 * The break after a focus run. `cycle` counts finished runs including this one. The long
 * break comes every `longBreakEvery` runs; otherwise a run of 40 minutes or more gets 10
 * minutes (kept between the short and the long break), and shorter runs get the short break.
 * A short break of 0 turns off breaks except the long one.
 */
export function breakMinutesFor(focusMs: number, cycle: number, s: BreakSettings): { kind: BreakKind; minutes: number } {
  if (breakKindFor(cycle, s.longBreakEvery) === 'long') return { kind: 'long', minutes: Math.max(0, s.longBreakMinutes) };
  const short = Math.max(0, s.shortBreakMinutes);
  if (short === 0) return { kind: 'short', minutes: 0 };
  if (focusMs >= LONG_RUN_MS) return { kind: 'short', minutes: Math.max(short, Math.min(LONG_RUN_BREAK_MINUTES, Math.max(short, s.longBreakMinutes))) };
  return { kind: 'short', minutes: short };
}

/** The selection for the focus block after a break: a Quick Start continues as a plain Pomodoro. */
export function nextBlockSelection(s: TimerState): TimerSelection {
  if (s.mode === 'quickstart') return { mode: 'pomodoro', minutes: s.minutes };
  return selectionOf(s);
}

export function start(s: TimerState, sel: TimerSelection, taskId: string | null, now: number, continueMinutes = 25): TimerState {
  const n = normalizeSelection(sel);
  const common = {
    status: 'running' as const,
    phase: 'focus' as const,
    mode: n.mode,
    taskId,
    segments: [],
    runningSince: now,
    breakKind: null,
    cycle: s.cycle,
    carriedMs: 0,
    sectionSubjectId: null,
    laps: {},
  };
  if (n.mode === 'quickstart') {
    return { ...common, minutes: clampMinutes(continueMinutes), targetMs: QUICK_START_MS, phaseMs: QUICK_START_MS, quickStartPending: true };
  }
  if (n.mode === 'stopwatch') {
    return { ...common, minutes: 0, targetMs: 0, phaseMs: 0, quickStartPending: false };
  }
  return { ...common, minutes: n.minutes, targetMs: n.minutes * MINUTE, phaseMs: n.minutes * MINUTE, quickStartPending: false };
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running' || s.runningSince === null) return s;
  const segments = now > s.runningSince ? [...s.segments, { start: s.runningSince, end: now }] : s.segments;
  return { ...s, status: 'paused', segments, runningSince: null };
}

export function resume(s: TimerState, now: number): TimerState {
  if (s.status !== 'paused') return s;
  return { ...s, status: 'running', runningSince: now };
}

export function addFive(s: TimerState): TimerState {
  if (s.status === 'idle' || isCountUp(s)) return s;
  return { ...s, targetMs: s.targetMs + ADD_FIVE_MS, phaseMs: s.phaseMs + ADD_FIVE_MS };
}

function closeAt(s: TimerState, at: number): Segment[] {
  if (s.runningSince === null) return s.segments;
  const end = Math.max(s.runningSince, at);
  return end > s.runningSince ? [...s.segments, { start: s.runningSince, end }] : s.segments;
}

function completedFrom(s: TimerState, segments: Segment[]): CompletedRun {
  return { phase: s.phase, mode: s.mode, taskId: s.taskId, segments, targetMs: s.targetMs, breakKind: s.breakKind, sectionSubjectId: s.mode === 'test' ? s.sectionSubjectId : null };
}

/** Idle state after a run or a break, keeping the selection, task and cycle. */
function idleAfter(s: TimerState, cycle: number): TimerState {
  return initialTimer(selectionOf(s), s.taskId, cycle);
}

export function reset(s: TimerState): TimerState {
  return idleAfter(s, s.cycle);
}

export function breakKindFor(cycle: number, longEvery: number): BreakKind {
  return longEvery > 0 && cycle > 0 && cycle % longEvery === 0 ? 'long' : 'short';
}

/** Starts a break at `at` (normally the exact moment the focus run finished). */
export function startBreak(s: TimerState, kind: BreakKind, ms: number, at: number): TimerState {
  return {
    ...s,
    status: 'running',
    phase: 'break',
    segments: [],
    runningSince: at,
    targetMs: ms,
    phaseMs: ms,
    quickStartPending: false,
    breakKind: kind,
    cycle: kind === 'long' ? 0 : s.cycle,
    carriedMs: 0,
    sectionSubjectId: null,
    laps: {},
  };
}

/**
 * Advances the timer. A Quick Start that reaches zero rolls into the continuation length in
 * the same run. A countdown that reaches zero finishes, and its last segment is closed at the
 * exact moment the target was reached, even when the tick arrives late. That moment is
 * returned as `at`, so every tab that ticks computes the same records.
 */
export function tick(s: TimerState, now: number): TickResult {
  if (s.status !== 'running' || s.runningSince === null) return { state: s, event: 'none' };
  if (isCountUp(s)) return { state: s, event: 'none' };
  if (remainingMs(s, now) > 0) return { state: s, event: 'none' };
  const at = s.runningSince + (s.targetMs - (s.carriedMs || 0) - closedMs(s));
  if (s.phase === 'focus' && s.quickStartPending) {
    const extra = s.minutes * MINUTE;
    return { state: { ...s, quickStartPending: false, targetMs: s.targetMs + extra, phaseMs: extra }, event: 'quick-start-continued', at };
  }
  const segments = closeAt(s, Math.min(now, at));
  if (s.phase === 'break') {
    return { state: idleAfter(s, s.cycle), event: 'break-finished', at, completed: completedFrom(s, segments) };
  }
  return { state: idleAfter(s, s.cycle + 1), event: 'finished', at, completed: completedFrom(s, segments) };
}

/** Ends the current phase now: Complete or Stop during focus, Skip during a break. */
export function finish(s: TimerState, now: number): { state: TimerState; completed: CompletedRun | null } {
  if (s.status === 'idle') return { state: s, completed: null };
  const segments = closeAt(s, now);
  return { state: idleAfter(s, s.cycle), completed: completedFrom(s, segments) };
}

/** How many multiples of `intervalMs` lie in (prevMs, nextMs]. */
export function bellCrossings(prevMs: number, nextMs: number, intervalMs: number): number {
  if (intervalMs <= 0 || nextMs <= prevMs) return 0;
  return Math.floor(nextMs / intervalMs) - Math.floor(prevMs / intervalMs);
}

export function isTimerState(v: unknown): v is TimerState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    (o.status === 'idle' || o.status === 'running' || o.status === 'paused') &&
    (o.phase === 'focus' || o.phase === 'break') &&
    (o.mode === 'pomodoro' || o.mode === 'quickstart' || o.mode === 'stopwatch' || o.mode === 'test') &&
    typeof o.minutes === 'number' &&
    Array.isArray(o.segments) &&
    typeof o.targetMs === 'number' &&
    typeof o.phaseMs === 'number' &&
    typeof o.cycle === 'number'
  );
}

/** Fills fields added after a state was saved or sent by an older tab. */
export function normalizeTimerState(s: TimerState): TimerState {
  const carriedMs = typeof s.carriedMs === 'number' && Number.isFinite(s.carriedMs) ? s.carriedMs : 0;
  const sectionSubjectId = typeof s.sectionSubjectId === 'string' ? s.sectionSubjectId : null;
  const laps: Record<string, number> = {};
  if (s.laps && typeof s.laps === 'object') {
    for (const [k, v] of Object.entries(s.laps)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) laps[k] = v;
  }
  return { ...s, carriedMs, sectionSubjectId, laps };
}

/** Test Mode runs never end in a break. */
export function breaksAfter(s: TimerState): boolean {
  return s.mode !== 'test';
}
