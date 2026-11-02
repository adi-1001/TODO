/**
 * Time of day in 12-hour form everywhere in the app: "1:00 PM", "10:41 AM". Built by hand
 * instead of toLocaleTimeString, so it reads the same on every device and locale (some phones
 * would otherwise show 24-hour time or "p.m."). Durations (countdowns, "2h 10m") are not times
 * of day and keep their own formats.
 */

const HHMM = /^(\d{1,2}):(\d{2})$/;

/** Hours 0..23 and minutes from a timestamp, a Date or an "HH:MM" string. Null when not valid. */
function parts(input: number | Date | string): { h: number; m: number } | null {
  if (typeof input === 'string') {
    const r = HHMM.exec(input.trim());
    if (!r) return null;
    const h = Number(r[1]);
    const m = Number(r[2]);
    return h >= 0 && h < 24 && m >= 0 && m < 60 ? { h, m } : null;
  }
  const d = typeof input === 'number' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return null;
  return { h: d.getHours(), m: d.getMinutes() };
}

/** "1:00 PM", "12:05 AM", "10:41 AM". Invalid input gives an empty string. */
export function formatTime12h(input: number | Date | string): string {
  const p = parts(input);
  if (!p) return '';
  const period = p.h < 12 ? 'AM' : 'PM';
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${h12}:${String(p.m).padStart(2, '0')} ${period}`;
}

/** "1:00 PM – 3:00 PM". */
export function formatTimeRange12h(start: number | Date | string, end: number | Date | string): string {
  return `${formatTime12h(start)} – ${formatTime12h(end)}`;
}

/** Short axis label for a whole hour 0..24: "6a", "12p", "10p", "12a". */
export function formatHourShort(hour: number): string {
  const h = ((Math.round(hour) % 24) + 24) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? 'a' : 'p'}`;
}

/** Splits "HH:MM" for a 12-hour picker. */
export function to12hParts(hhmm: string): { hour: number; minute: number; period: 'AM' | 'PM' } {
  const p = parts(hhmm) ?? { h: 9, m: 0 };
  return { hour: p.h % 12 === 0 ? 12 : p.h % 12, minute: p.m, period: p.h < 12 ? 'AM' : 'PM' };
}

/** Joins 12-hour picker values back into "HH:MM". */
export function from12hParts(hour: number, minute: number, period: 'AM' | 'PM'): string {
  const h12 = Math.min(12, Math.max(1, Math.round(hour)));
  const h = (h12 % 12) + (period === 'PM' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${String(Math.min(59, Math.max(0, Math.round(minute)))).padStart(2, '0')}`;
}
