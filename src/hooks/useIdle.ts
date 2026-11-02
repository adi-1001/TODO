import { useEffect, useState } from 'react';

const EVENTS = ['mousemove', 'pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

/** True after `ms` without pointer or keyboard activity. Resets on any activity. */
export function useIdle(ms: number, enabled = true): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIdle(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    arm();
    for (const e of EVENTS) window.addEventListener(e, arm, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const e of EVENTS) window.removeEventListener(e, arm);
    };
  }, [ms, enabled]);

  return idle;
}
