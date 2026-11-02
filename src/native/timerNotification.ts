import { NOTIFICATION_ICON, isNativeApp } from './platform';

/**
 * The running timer outside the page.
 *
 * - Android app: an ongoing foreground-service notification with Pause or Resume, +5 Min and
 *   Complete buttons. The service also keeps the app process alive while the timer runs.
 * - Chrome on Android (web): the Media Session API. Chrome only shows a media notification
 *   while a media element plays, so a near-silent loop plays while the timer runs. The
 *   notification shows the task, the end time and a progress bar, with play, pause, forward
 *   (+5 minutes) and next (Complete) controls. Playing it can pause music in other apps,
 *   which is why it is a setting.
 */

export interface TimerNotice {
  running: boolean;
  /** Task title, or "General Focus". */
  title: string;
  /** Subject and mode, for example "Physics, 25m focus". */
  subtitle: string;
  /** One line with the time left and end time. */
  status: string;
  /** Countdown position for the progress bar, in ms. */
  positionMs: number;
  durationMs: number;
  inBreak: boolean;
  countUp: boolean;
}

export interface TimerActions {
  toggle: () => void;
  addFive: () => void;
  complete: () => void;
}

const SERVICE_ID = 7001;
const CHANNEL_TIMER = 'timer';
const BUTTON_TOGGLE = 1;
const BUTTON_ADD_FIVE = 2;
const BUTTON_COMPLETE = 3;

let actions: TimerActions | null = null;

export function setTimerActions(a: TimerActions | null): void {
  actions = a;
}

/* ---------- Android app: foreground service ---------- */

type FgsModule = typeof import('@capawesome-team/capacitor-android-foreground-service');
let fgs: Promise<FgsModule['ForegroundService']> | null = null;
let serviceRunning = false;
let lastNativeText = '';

function foregroundService(): Promise<FgsModule['ForegroundService']> {
  fgs ??= import('@capawesome-team/capacitor-android-foreground-service').then(async ({ ForegroundService, Importance }) => {
    try {
      await ForegroundService.createNotificationChannel({ id: CHANNEL_TIMER, name: 'Timer', description: 'The running focus timer', importance: Importance.Low });
    } catch {
      /* exists already */
    }
    await ForegroundService.addListener('buttonClicked', ({ buttonId }) => {
      if (buttonId === BUTTON_TOGGLE) actions?.toggle();
      else if (buttonId === BUTTON_ADD_FIVE) actions?.addFive();
      else if (buttonId === BUTTON_COMPLETE) actions?.complete();
    });
    return ForegroundService;
  });
  return fgs;
}

async function showNative(n: TimerNotice): Promise<void> {
  const FS = await foregroundService();
  const buttons = [
    { id: BUTTON_TOGGLE, title: n.running ? 'Pause' : 'Resume' },
    ...(n.countUp ? [] : [{ id: BUTTON_ADD_FIVE, title: '+5 Min' }]),
    { id: BUTTON_COMPLETE, title: n.inBreak ? 'Skip Break' : n.countUp ? 'Stop' : 'Complete' },
  ];
  const options = {
    id: SERVICE_ID,
    title: n.title,
    body: `${n.subtitle}. ${n.status}`,
    smallIcon: NOTIFICATION_ICON,
    buttons,
    silent: true,
    notificationChannelId: CHANNEL_TIMER,
  };
  const text = JSON.stringify(options);
  if (serviceRunning && text === lastNativeText) return;
  lastNativeText = text;
  if (!serviceRunning) {
    try {
      const { display } = await FS.checkPermissions();
      if (display !== 'granted') await FS.requestPermissions();
    } catch {
      /* older Android: no runtime permission */
    }
    await FS.startForegroundService(options);
    serviceRunning = true;
  } else {
    await FS.updateForegroundService(options);
  }
}

async function stopNative(): Promise<void> {
  if (!serviceRunning) return;
  serviceRunning = false;
  lastNativeText = '';
  try {
    await (await foregroundService()).stopForegroundService();
  } catch {
    /* already stopped */
  }
}

/* ---------- Web: Media Session ---------- */

let audio: HTMLAudioElement | null = null;
let audioUrl: string | null = null;
let lastWebTitle = '';

/** 10 seconds of 16-bit noise at about -90 dB: inaudible, but real media for Chrome. */
function quietLoopUrl(): string {
  if (audioUrl) return audioUrl;
  const rate = 8000;
  const samples = rate * 10;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) v.setInt16(44 + i * 2, (i * 7919) % 3 === 0 ? 1 : -1, true);
  audioUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return audioUrl;
}

export function mediaSessionSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'mediaSession' in navigator &&
    navigator.mediaSession !== null &&
    typeof Audio !== 'undefined' &&
    typeof MediaMetadata === 'function' &&
    typeof URL.createObjectURL === 'function'
  );
}

function setHandlers(on: boolean): void {
  const ms = navigator.mediaSession;
  const set = (action: MediaSessionAction, fn: (() => void) | null) => {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* action not supported in this browser */
    }
  };
  set('play', on ? () => actions?.toggle() : null);
  set('pause', on ? () => actions?.toggle() : null);
  set('seekforward', on ? () => actions?.addFive() : null);
  set('nexttrack', on ? () => actions?.complete() : null);
  set('stop', on ? () => actions?.complete() : null);
}

function showWeb(n: TimerNotice): void {
  if (!mediaSessionSupported()) return;
  if (!audio) {
    audio = new Audio(quietLoopUrl());
    audio.loop = true;
    setHandlers(true);
  }
  if (n.running && audio.paused) void audio.play().catch(() => undefined);
  if (!n.running && !audio.paused) audio.pause();

  const ms = navigator.mediaSession;
  const title = `${n.status}, ${n.title}`;
  if (title !== lastWebTitle) {
    lastWebTitle = title;
    ms.metadata = new MediaMetadata({
      title,
      artist: n.subtitle,
      album: 'Study Space',
      artwork: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  }
  ms.playbackState = n.running ? 'playing' : 'paused';
  if (n.durationMs > 0 && typeof ms.setPositionState === 'function') {
    try {
      ms.setPositionState({ duration: n.durationMs / 1000, position: Math.min(n.durationMs, Math.max(0, n.positionMs)) / 1000, playbackRate: 1 });
    } catch {
      /* invalid state for this browser */
    }
  }
}

function stopWeb(): void {
  if (!audio) return;
  audio.pause();
  audio = null;
  lastWebTitle = '';
  if (!mediaSessionSupported()) return;
  setHandlers(false);
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = 'none';
}

/* ---------- Public API ---------- */

/** Shows or updates the notification. `web` says whether the Media Session path is allowed. */
export function showTimerNotice(n: TimerNotice, web: boolean): void {
  // A notification is a convenience: any failure here must never reach the timer or the page.
  try {
    if (isNativeApp()) void showNative(n).catch((e) => console.error('Timer notification failed', e));
    else if (web) showWeb(n);
    else stopWeb();
  } catch (e) {
    console.error('Timer notification failed', e);
  }
}

export function hideTimerNotice(): void {
  try {
    if (isNativeApp()) void stopNative().catch(() => undefined);
    else stopWeb();
  } catch {
    /* nothing to hide */
  }
}
