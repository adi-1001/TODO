import { liveQuery, type Subscription } from 'dexie';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Shared, cached live queries. Each key has at most one Dexie subscription, however many
 * components read it, and the last result is kept after they unmount. A view that mounts
 * again therefore renders its data in the first frame instead of an empty state, which is
 * what caused the flash when switching tabs on a phone.
 */

interface Entry<T> {
  value: T;
  loaded: boolean;
  querier: () => Promise<T> | T;
  listeners: Set<() => void>;
  sub: Subscription | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

/** Keep the subscription this long after the last reader leaves, so quick tab switches stay live. */
const KEEP_ALIVE_MS = 60_000;

const entries = new Map<string, Entry<unknown>>();

function entryFor<T>(key: string, querier: () => Promise<T> | T, initial: T): Entry<T> {
  let e = entries.get(key) as Entry<T> | undefined;
  if (!e) {
    e = { value: initial, loaded: false, querier, listeners: new Set(), sub: null, idleTimer: null };
    entries.set(key, e as Entry<unknown>);
  }
  return e;
}

function start<T>(e: Entry<T>): void {
  if (e.sub) return;
  e.sub = liveQuery(e.querier).subscribe({
    next: (v) => {
      e.value = v;
      e.loaded = true;
      for (const l of e.listeners) l();
    },
    error: (err) => console.error('Live query failed', err),
  });
}

function stop<T>(e: Entry<T>): void {
  e.sub?.unsubscribe();
  e.sub = null;
}

function subscribe<T>(e: Entry<T>, listener: () => void): () => void {
  e.listeners.add(listener);
  if (e.idleTimer) {
    clearTimeout(e.idleTimer);
    e.idleTimer = null;
  }
  start(e);
  return () => {
    e.listeners.delete(listener);
    if (e.listeners.size === 0 && !e.idleTimer) {
      e.idleTimer = setTimeout(() => {
        e.idleTimer = null;
        if (e.listeners.size === 0) stop(e);
      }, KEEP_ALIVE_MS);
    }
  };
}

/**
 * Reads a live query by key. `querier` must depend only on values that are part of `key`.
 * Returns the cached value (or `initial` before the first result).
 */
export function useLiveStore<T>(key: string, querier: () => Promise<T> | T, initial: T): T {
  const e = entryFor(key, querier, initial);
  const sub = useCallback((l: () => void) => subscribe(e, l), [e]);
  const get = useCallback(() => e.value, [e]);
  return useSyncExternalStore(sub, get, get);
}

/** True once the query for `key` has produced at least one result. */
export function isLiveStoreLoaded(key: string): boolean {
  return entries.get(key)?.loaded ?? false;
}
