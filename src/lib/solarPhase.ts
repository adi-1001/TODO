/**
 * Solar Horizon: the ambient light of the clock evolves through the session. Pure functions;
 * every result is one of a fixed set of frozen objects, so a caller can compare results by
 * identity and re-render only when the phase actually changes.
 *
 * Phases: 1 Deep Flow (midnight sky), 2 Momentum (teal), 3 Golden Hour (sunset gold),
 * 4 Final Finish Pulse (radiant gold), 0 Recovery (a break).
 */

export type VisualMode = 'pomodoro' | 'quickstart' | 'test' | 'stopwatch' | 'break';
export type SolarTone = 'sky' | 'teal' | 'gold' | 'radiant' | 'recovery';

export interface SolarVisual {
  phase: 0 | 1 | 2 | 3 | 4;
  tone: SolarTone;
  /** Frosted pill text for this phase, or null. */
  pill: string | null;
  /** Phase 3 and 4: the aura breathes, seconds digits turn gold and cards get a gold top edge. */
  golden: boolean;
  /** Phase 4: colon dots pulse gold and the seconds cards pulse on every tick. */
  finish: boolean;
}

export const SOLAR_TONES: SolarTone[] = ['sky', 'teal', 'gold', 'radiant', 'recovery'];

/** Text colour for the seconds digits in Golden Hour. */
export const GOLD_DIGIT = '#F5BE86';
/** Colon dots in the Final Finish Pulse. */
export const GOLD_COLON = '#EAB308';

const v = (phase: SolarVisual['phase'], tone: SolarTone, pill: string | null): SolarVisual =>
  Object.freeze({ phase, tone, pill, golden: phase >= 3, finish: phase === 4 });

const POMODORO_PILL = 'Final Stretch • Wrap up current concept';
const QUICK_PILL = 'Final 45s • Lock in your momentum';
const TEST_HALF_PILL = 'Halfway Mark • Check question pace';
const TEST_FINAL_PILL = 'Final Stretch • Review & mark remaining questions';
const STOPWATCH_PILL = 'Deep Focus Mastery • 45m+ Continuous Session';
const BREAK_PILL = 'Break ending in 30s • Ready for next block';

/** Every visual the engine can return. Compare results with `===`. */
export const SOLAR = Object.freeze({
  idle: v(1, 'sky', null),
  p1: v(1, 'sky', null),
  p2: v(2, 'teal', null),
  p3: v(3, 'gold', POMODORO_PILL),
  p4: v(4, 'radiant', POMODORO_PILL),
  q3: v(3, 'gold', QUICK_PILL),
  q4: v(4, 'radiant', QUICK_PILL),
  t2: v(2, 'teal', TEST_HALF_PILL),
  t3: v(3, 'gold', TEST_FINAL_PILL),
  t4: v(4, 'radiant', TEST_FINAL_PILL),
  s3: v(3, 'gold', STOPWATCH_PILL),
  recovery: v(0, 'recovery', null),
  breakEnd: v(3, 'gold', BREAK_PILL),
});

const MIN = 60;

/**
 * The visual phase for a mode, given elapsed and total seconds of the current phase.
 * `totalSeconds` is ignored for the stopwatch. Out-of-range input is clamped.
 *
 * - Pomodoro: 0-49% sky, 50-79% teal, Golden Hour from 80% (on 25m or longer, never more
 *   than the last 10 minutes), Final Finish Pulse in the last 60 seconds.
 * - Quick Start (3 minutes): 0-49% sky, 50-74% teal, 75% on Golden Hour, the last 20/180 of
 *   the run (20 s) Final Finish Pulse.
 * - Test: 0-49% sky, 50-79% teal (Halfway Mark), 80% on Golden Hour, the last 120 s (or the last
 *   10% of a short paper) Final Finish Pulse.
 * - Stopwatch: under 20m sky, 20-45m teal, 45m on Golden Hour mastery. No finish pulse.
 * - Break: recovery, the last 30 seconds Golden Hour "get ready".
 */
export function getTimerVisualPhase(mode: VisualMode, elapsedSeconds: number, totalSeconds: number): SolarVisual {
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  if (mode === 'stopwatch') {
    if (elapsed >= 45 * MIN) return SOLAR.s3;
    if (elapsed >= 20 * MIN) return SOLAR.p2;
    return SOLAR.p1;
  }
  const total = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  if (total <= 0) return mode === 'break' ? SOLAR.recovery : SOLAR.p1;
  const done = Math.min(elapsed, total);
  const left = total - done;
  const frac = done / total;

  if (mode === 'break') return left <= 30 ? SOLAR.breakEnd : SOLAR.recovery;

  if (mode === 'quickstart') {
    if (left < (total * 20) / 180) return SOLAR.q4;
    if (frac >= 0.75) return SOLAR.q3;
    if (frac >= 0.5) return SOLAR.p2;
    return SOLAR.p1;
  }

  if (mode === 'test') {
    if (left <= Math.min(120, total * 0.1)) return SOLAR.t4;
    if (frac >= 0.8) return SOLAR.t3;
    if (frac >= 0.5) return SOLAR.t2;
    return SOLAR.p1;
  }

  // Pomodoro.
  if (left < 60) return SOLAR.p4;
  const goldenAt = total >= 25 * MIN ? Math.max(total * 0.8, total - 10 * MIN) : total * 0.8;
  if (done >= goldenAt) return SOLAR.p3;
  if (frac >= 0.5) return SOLAR.p2;
  return SOLAR.p1;
}

/** Tone of the ambient glow for a share (0..1) of the daily focus goal. */
export function goalTone(share: number): Extract<SolarTone, 'sky' | 'teal' | 'gold'> {
  if (share >= 0.8) return 'gold';
  if (share >= 0.5) return 'teal';
  return 'sky';
}
