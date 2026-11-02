import { isNativeApp } from './platform';

/**
 * Calls `onLeave` when the app stops being visible (Home, another app, another tab, screen
 * off) and `onReturn` when it comes back. In the Android app both the page visibility and
 * Capacitor's app state are watched, since either can report first. Repeated reports of the
 * same state are passed through; callers keep their own state.
 */
export function watchAppVisibility(onLeave: (at: number) => void, onReturn: (at: number) => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') onLeave(Date.now());
    else onReturn(Date.now());
  };
  document.addEventListener('visibilitychange', onVisibility);

  let removeNative: (() => void) | null = null;
  let disposed = false;
  if (isNativeApp()) {
    void import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) onReturn(Date.now());
        else onLeave(Date.now());
      });
      if (disposed) void handle.remove();
      else removeNative = () => void handle.remove();
    });
  }

  return () => {
    disposed = true;
    document.removeEventListener('visibilitychange', onVisibility);
    removeNative?.();
  };
}
