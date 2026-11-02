import { useEffect, useRef } from 'react';
import { watchAppVisibility } from '../native/appState';
import { CHANNEL_STRICT, cancelNotifications, notifyAt, notifyNow } from '../native/notify';
import { usePrefs } from '../state/PrefsProvider';
import { useTimer } from './TimerProvider';

/** How long the student may be away before a strict run ends. */
export const STRICT_GRACE_MS = 3000;

const WARN_ID = 41_001;
const DONE_ID = 41_002;
const TITLE = 'Strict Mode session ended';
const BODY = 'You left Study Space for more than 3 seconds, so this session is saved as Failed (Strict Mode).';

/**
 * App-wide Strict Mode. While a strict focus run is running, moving between views, opening
 * dialogs or closing the clock is fine. Leaving the app (Home, another app, another tab) for
 * more than 3 seconds ends the run as Failed (Strict Mode), closed at the moment the app was
 * left. In the Android app a native notification is also scheduled for that moment, because
 * the WebView may pause JavaScript in the background; it is cancelled when the student comes
 * back in time.
 */
export function StrictMonitor() {
  const { prefs } = usePrefs();
  const { state, abortStrict } = useTimer();
  // Test Mode always runs under Strict Mode rules, without changing the saved setting.
  const active = (prefs.strictMode || state.mode === 'test') && state.phase === 'focus' && state.status === 'running';
  const abortRef = useRef(abortStrict);
  abortRef.current = abortStrict;

  useEffect(() => {
    if (!active) return;
    let leftAt: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ended = false;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      void cancelNotifications([WARN_ID]);
    };
    const end = (at: number, notify: boolean) => {
      if (ended) return;
      ended = true;
      clear();
      if (notify) void notifyNow(DONE_ID, TITLE, BODY, CHANNEL_STRICT);
      abortRef.current(at);
    };
    const onLeave = (at: number) => {
      if (leftAt !== null || ended) return;
      leftAt = at;
      timer = setTimeout(() => end(at, true), STRICT_GRACE_MS);
      void notifyAt(WARN_ID, TITLE, BODY, at + STRICT_GRACE_MS, CHANNEL_STRICT);
    };
    const onReturn = (at: number) => {
      if (leftAt === null || ended) return;
      // JavaScript may have been paused in the background, so check the time on return.
      if (at - leftAt > STRICT_GRACE_MS) end(leftAt, false);
      else {
        clear();
        leftAt = null;
      }
    };

    const stop = watchAppVisibility(onLeave, onReturn);
    if (document.visibilityState === 'hidden') onLeave(Date.now());
    return () => {
      stop();
      if (timer) clearTimeout(timer);
      if (!ended) void cancelNotifications([WARN_ID]);
    };
  }, [active]);

  return null;
}
