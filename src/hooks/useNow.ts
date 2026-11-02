import { useCallback, useSyncExternalStore } from 'react';
import { dayKey } from '../lib/time';

/**
 * One shared clock per refresh interval. Every component that asks for the time with the same
 * interval shares a single timer, and they all update in the same frame. Components that only
 * need the date (useToday) re-render once a day instead of every 30 seconds.
 */

interface Clock {
  now: number;
  listeners: Set<() => void>;
  handle: ReturnType<typeof setInterval> | null;
}

const clocks = new Map<number, Clock>();
let visibilityHooked = false;

function clockFor(ms: number): Clock {
  let c = clocks.get(ms);
  if (!c) {
    c = { now: Date.now(), listeners: new Set(), handle: null };
    clocks.set(ms, c);
  }
  return c;
}

function tick(c: Clock): void {
  c.now = Date.now();
  for (const l of c.listeners) l();
}

/** Coming back to the page refreshes every clock at once (timers may have been paused). */
function hookVisibility(): void {
  if (visibilityHooked || typeof document === 'undefined') return;
  visibilityHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    for (const c of clocks.values()) if (c.listeners.size > 0) tick(c);
  });
}

function subscribe(ms: number, listener: () => void): () => void {
  const c = clockFor(ms);
  hookVisibility();
  if (c.listeners.size === 0) {
    c.now = Date.now();
    c.handle = setInterval(() => tick(c), ms);
  }
  c.listeners.add(listener);
  return () => {
    c.listeners.delete(listener);
    if (c.listeners.size === 0 && c.handle) {
      clearInterval(c.handle);
      c.handle = null;
    }
  };
}

/** Current time, refreshed every `intervalMs` (shared with other components using the same interval). */
export function useNow(intervalMs = 1000): number {
  const sub = useCallback((l: () => void) => subscribe(intervalMs, l), [intervalMs]);
  const get = useCallback(() => clockFor(intervalMs).now, [intervalMs]);
  return useSyncExternalStore(sub, get, get);
}

/**
 * The time on a shared clock while `active`, otherwise 0. When inactive the value does not
 * change, so the component does not re-render.
 */
export function useNowWhile(active: boolean, intervalMs: number): number {
  const sub = useCallback((l: () => void) => subscribe(intervalMs, l), [intervalMs]);
  const get = useCallback(() => (active ? clockFor(intervalMs).now : 0), [active, intervalMs]);
  return useSyncExternalStore(sub, get, get);
}

const DAY_CHECK_MS = 30_000;

/** Today's local day key. Checked every 30 seconds, but the component re-renders only when the date changes. */
export function useToday(): string {
  const sub = useCallback((l: () => void) => subscribe(DAY_CHECK_MS, l), []);
  const get = useCallback(() => dayKey(clockFor(DAY_CHECK_MS).now), []);
  return useSyncExternalStore(sub, get, get);
}
