import { Lock } from 'lucide-react';
import { useCallback } from 'react';
import { usePrefs } from '../../state/PrefsProvider';
import { useTimer } from '../../timer/TimerProvider';
import { fullscreenSupported } from './clockUtils';

export interface StrictGuard {
  /** Strict Mode is on and a focus run is active. */
  active: boolean;
  /**
   * Requests browser fullscreen. Call it only from the dedicated full-screen button or from the
   * click that turns Strict Mode on during an active run. Starting, resuming, opening the clock
   * or navigating must never request it: on Android Chrome a fullscreen request in the same tap
   * as a screen change shows the page underneath for a moment while the viewport resizes.
   */
  enterFullscreen: () => void;
}

/**
 * Strict Mode state for the clock overlay. Monitoring lives in `timer/StrictMonitor`, which
 * watches the whole app; this hook only reports whether a strict run is active and offers the
 * fullscreen request. Leaving fullscreen does not end a run.
 */
export function useStrictModeGuard(): StrictGuard {
  const { prefs } = usePrefs();
  const { state } = useTimer();
  // Test Mode always runs under Strict Mode rules.
  const active = (prefs.strictMode || state.mode === 'test') && state.phase === 'focus' && state.status !== 'idle';

  const enterFullscreen = useCallback(() => {
    if (!fullscreenSupported() || document.fullscreenElement) return;
    try {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    } catch {
      /* refused or unsupported (for example iOS) */
    }
  }, []);

  return { active, enterFullscreen };
}

export function StrictModeChip() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200"
      title="Leaving Study Space for more than 3 seconds ends this session as Failed (Strict Mode)."
    >
      <Lock size={14} strokeWidth={1.75} aria-hidden />
      Strict Mode
    </span>
  );
}
