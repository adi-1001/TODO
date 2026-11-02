import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SoundChoice, Theme, TimerSelection } from '../types';
import { soundEngine } from '../audio/soundEngine';
import { syncEngine } from '../sync/syncEngine';
import { generateSyncId } from '../lib/syncId';
import { normalizeSelection } from '../timer/timerMachine';
import { isAndroidBrowser } from '../native/platform';

/** Preferences that belong to this device only (not synced). */
export interface Prefs {
  theme: Theme;
  syncId: string;
  /** Last chosen background sound, used by Play. */
  sound: SoundChoice;
  volume: number;
  timer: TimerSelection;
  miniOpen: boolean;
  strictMode: boolean;
  /**
   * Web only: show the running timer in the Android notification area through the Media
   * Session API (plays a near-silent loop, which can pause music in other apps). The Android
   * app always shows its own timer notification.
   */
  timerNotification: boolean;
}

export const PREFS_KEY = 'study-space:prefs';

function defaults(): Prefs {
  return {
    theme: 'light',
    syncId: generateSyncId(),
    sound: 'brown',
    volume: 0.5,
    timer: { mode: 'pomodoro', minutes: 25 },
    miniOpen: false,
    strictMode: false,
    timerNotification: isAndroidBrowser(),
  };
}

const SOUNDS = ['brown', 'rain', 'storm', 'drone'];

/** Reads stored preferences, including version 1 names (syncCode, preset). */
export function loadPrefs(): Prefs {
  const d = defaults();
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Record<string, unknown>;
  } catch {
    /* use defaults */
  }
  const syncId = typeof raw.syncId === 'string' && raw.syncId.trim() ? raw.syncId : typeof raw.syncCode === 'string' && raw.syncCode.trim() ? raw.syncCode : d.syncId;
  let timer = d.timer;
  if (raw.timer && typeof raw.timer === 'object') timer = normalizeSelection(raw.timer as TimerSelection);
  else if (typeof raw.preset === 'number') timer = raw.preset === 3 ? { mode: 'quickstart', minutes: 3 } : normalizeSelection({ mode: 'pomodoro', minutes: raw.preset });
  const sound = typeof raw.sound === 'string' && (SOUNDS.includes(raw.sound) || raw.sound.startsWith('custom:')) ? (raw.sound as SoundChoice) : d.sound;
  const prefs: Prefs = {
    theme: raw.theme === 'dark' ? 'dark' : 'light',
    syncId,
    sound,
    volume: typeof raw.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : d.volume,
    timer,
    miniOpen: raw.miniOpen === true,
    strictMode: raw.strictMode === true,
    timerNotification: typeof raw.timerNotification === 'boolean' ? raw.timerNotification : d.timerNotification,
  };
  // Keep a newly generated Sync ID stable across reloads.
  if (syncId !== raw.syncId) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }
  return prefs;
}

interface PrefsValue {
  prefs: Prefs;
  setPrefs: (changes: Partial<Prefs>) => void;
  toggleTheme: () => void;
}

const Ctx = createContext<PrefsValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setState] = useState<Prefs>(loadPrefs);

  const setPrefs = useCallback((changes: Partial<Prefs>) => {
    setState((p) => {
      const next = { ...p, ...changes };
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFS_KEY) setState(loadPrefs());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', prefs.theme === 'dark');
    root.style.colorScheme = prefs.theme;
    const color = prefs.theme === 'dark' ? '#0B0D12' : '#F5F5F7';
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
  }, [prefs.theme]);

  useEffect(() => {
    soundEngine.setVolume(prefs.volume);
  }, [prefs.volume]);

  useEffect(() => {
    // Sync problems show in Settings; they must never surface as an unhandled rejection.
    syncEngine.start(prefs.syncId).catch((e) => console.error('Sync could not start', e));
  }, [prefs.syncId]);

  const value = useMemo<PrefsValue>(
    () => ({ prefs, setPrefs, toggleTheme: () => setPrefs({ theme: prefs.theme === 'dark' ? 'light' : 'dark' }) }),
    [prefs, setPrefs],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrefs must be used inside PrefsProvider');
  return v;
}
