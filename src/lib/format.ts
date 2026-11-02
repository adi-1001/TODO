import { formatTime12h } from './timeFormat';
import { HOUR, MINUTE, dayStart } from './time';

/** "5 hr 40 mins", "45 mins", "0 mins". */
export function formatLong(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / MINUTE);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} ${m === 1 ? 'min' : 'mins'}`;
  return `${h} hr ${m} ${m === 1 ? 'min' : 'mins'}`;
}

/** "51h 24m", "40m". */
export function formatShort(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / MINUTE);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Countdown clock "MM:SS" or "H:MM:SS". Rounds up so 0.4s shows 00:01. */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Count-up clock "HH:MM:SS" for the stopwatch. Rounds down. */
export function formatElapsedClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Hours, minutes and seconds parts for the flip clock. */
export function clockParts(ms: number, countUp: boolean): { h: number; m: number; s: number } {
  const totalSec = Math.max(0, countUp ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
  return { h: Math.floor(totalSec / 3600), m: Math.floor((totalSec % 3600) / 60), s: totalSec % 60 };
}

export function greetingFor(ms: number): string {
  const h = new Date(ms).getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "3.2 MB" style sizes. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatHours(ms: number, digits = 1): string {
  return `${(ms / HOUR).toFixed(digits)}h`;
}

/** Time of day in 12-hour form, "4:30 PM". See lib/timeFormat. */
export function formatTimeOfDay(ms: number): string {
  return formatTime12h(ms);
}

export function formatDayTitle(key: string): string {
  return new Date(dayStart(key)).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDayShort(key: string): string {
  return new Date(dayStart(key)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatMonthTitle(key: string): string {
  return new Date(dayStart(key)).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatWeekday(key: string): string {
  return new Date(dayStart(key)).toLocaleDateString(undefined, { weekday: 'short' });
}
