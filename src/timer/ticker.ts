import { useSyncExternalStore } from 'react';

/**
 * A tiny external store that publishes the current time every 250 ms while a run is active.
 * Only the timer digit components subscribe, so the tick never re-renders the dashboard,
 * the board or the charts.
 */

type Listener = () => void;

const TICK_MS = 250;
let now = Date.now();
let active = false;
let handle: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  now = Date.now();
  for (const l of listeners) l();
}

function restart(): void {
  if (handle) clearInterval(handle);
  handle = null;
  if (active && listeners.size > 0) handle = setInterval(emit, TICK_MS);
}

export function setTickerActive(on: boolean): void {
  active = on;
  emit();
  restart();
}

export function subscribeTicker(l: Listener): () => void {
  listeners.add(l);
  if (listeners.size === 1) restart();
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) restart();
  };
}

export function getTickerNow(): number {
  return now;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') emit();
  });
}

export function useTickerNow(): number {
  return useSyncExternalStore(subscribeTicker, getTickerNow, getTickerNow);
}
