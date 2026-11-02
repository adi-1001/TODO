import { useSyncExternalStore } from 'react';

/** A short one-line message at the bottom of the screen, for example after the Back button. */

let current: { id: number; text: string } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showNotice(text: string, ms = 3000): void {
  current = { id: (current?.id ?? 0) + 1, text };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    emit();
  }, ms);
  emit();
}

export function useNotice(): { id: number; text: string } | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
