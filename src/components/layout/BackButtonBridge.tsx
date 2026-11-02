import { useEffect, useRef } from 'react';
import { handleBack } from '../../native/backButton';
import { isNativeApp } from '../../native/platform';
import { showNotice, useNotice } from '../../state/notice';
import { usePrefs } from '../../state/PrefsProvider';
import { useUI } from '../../state/UIProvider';
import { useTimer } from '../../timer/TimerProvider';

export const STRICT_BACK_MESSAGE = 'Strict Mode active: Stop or complete the session before exiting';

/**
 * The Android Back button (and the swipe-back gesture), in this order:
 * 1. close the open dialog, drawer or popover;
 * 2. close the Full-Screen Clock, unless a strict run is active;
 * 3. go back to the Dashboard from another page;
 * 4. on the Dashboard, minimize to the home screen (timers keep running), unless a strict
 *    run is active, since leaving the app would end it.
 * In a browser the Back button moves through page history as usual; Escape closes layers.
 */
export function BackButtonBridge() {
  const { view, navigate, clockOpen, setClockOpen, modal, closeModal } = useUI();
  const { prefs } = usePrefs();
  const { state } = useTimer();
  const strict = (prefs.strictMode || state.mode === 'test') && state.phase === 'focus' && state.status === 'running';
  const live = useRef({ view, navigate, clockOpen, setClockOpen, modal, closeModal, strict });
  live.current = { view, navigate, clockOpen, setClockOpen, modal, closeModal, strict };

  useEffect(() => {
    if (!isNativeApp()) return;
    let remove: (() => void) | null = null;
    let disposed = false;
    void import('@capacitor/app')
      .then(async ({ App }) => {
        const handle = await App.addListener('backButton', () => {
          const s = live.current;
          if (handleBack()) return;
          if (s.modal) {
            s.closeModal();
            return;
          }
          if (s.clockOpen) {
            if (s.strict) showNotice(STRICT_BACK_MESSAGE);
            else s.setClockOpen(false);
            return;
          }
          if (s.view !== 'dashboard') {
            s.navigate('dashboard');
            return;
          }
          if (s.strict) {
            showNotice(STRICT_BACK_MESSAGE);
            return;
          }
          void App.minimizeApp().catch(() => undefined);
        });
        if (disposed) void handle.remove();
        else remove = () => void handle.remove();
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      remove?.();
    };
  }, []);

  return null;
}

/** The one-line notice from showNotice, above the bottom navigation. */
export function NoticeToast() {
  const notice = useNotice();
  if (!notice) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[90] flex justify-center px-4 lg:bottom-6">
      <p key={notice.id} role="status" className="animate-fade-in max-w-sm rounded-2xl bg-zinc-900 px-4 py-2.5 text-center text-xs font-semibold text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
        {notice.text}
      </p>
    </div>
  );
}
