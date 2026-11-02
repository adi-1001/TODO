import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { addNote } from '../../db/repo';
import type { SolarVisual } from '../../lib/solarPhase';
import { MINUTE } from '../../lib/time';

/** The frosted phase pill text of a Solar Horizon visual, or null. */
export function phasePillText(v: SolarVisual): string | null {
  return v.pill;
}

/** The short head of a phase pill text, before the " • " separator. */
export function phasePillHead(text: string): string {
  const at = text.indexOf(' • ');
  return at > 0 ? text.slice(0, at) : text;
}

/** Popovers in the clock control bar. */
export type ClockPopover = 'audio' | 'note' | null;

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Buttons and links handle Space themselves, so the global shortcut leaves them alone. */
export function isActivatableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest('button, a[href], [role="button"], [role="switch"], [role="radio"]') !== null;
}

export function fullscreenSupported(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === 'function';
}

export function exitFullscreenQuietly(): void {
  if (typeof document === 'undefined' || !document.fullscreenElement) return;
  try {
    void document.exitFullscreen().catch(() => undefined);
  } catch {
    /* not supported */
  }
}

/**
 * Leaves browser fullscreen and resolves once the viewport has settled. On Android Chrome the
 * address bar comes back and the viewport resizes after the exit, so the clock overlay should
 * stay on screen until then; removing it first shows the page underneath jumping. Resolves at
 * once when the page is not in fullscreen, and after `timeoutMs` if the browser never reports.
 */
export function exitFullscreenAndWait(timeoutMs = 500): Promise<void> {
  if (typeof document === 'undefined' || !document.fullscreenElement) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      document.removeEventListener('fullscreenchange', onChange);
      // One frame for the resized layout to paint under the overlay.
      requestAnimationFrame(() => resolve());
    };
    const onChange = () => {
      if (!document.fullscreenElement) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    document.addEventListener('fullscreenchange', onChange);
    try {
      void document.exitFullscreen().catch(finish);
    } catch {
      finish();
    }
  });
}

/** "0h 0m" style total, so an empty day still reads as a time. */
export function formatHoursMinutes(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / MINUTE);
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}

/** Context saved with a Quick Note from the clock or the Mini Timer. */
export function noteContext(taskTitle: string | undefined, modeLabel: string): string {
  return `${taskTitle ?? 'General'}, ${modeLabel}`;
}

/** State for a one-line Quick Note form that shows "Saved" for 2 seconds. */
export function useQuickNote(context: string) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => () => clearTimeout(timer.current), []);

  const submit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const clean = text.trim();
      if (!clean) return;
      await addNote(clean, contextRef.current);
      setText('');
      setSaved(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 2000);
    },
    [text],
  );

  return { text, setText, saved, submit };
}
