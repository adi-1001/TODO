export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day key, YYYY-MM-DD. */
export function dayKey(input: number | Date): string {
  const d = typeof input === 'number' ? new Date(input) : input;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight for a day key, as epoch ms. */
export function dayStart(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Local midnight of the following day, as epoch ms (DST safe). */
export function dayEnd(key: string): number {
  return dayStart(addDays(key, 1));
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export function startOfDayMs(ms: number): number {
  return dayStart(dayKey(ms));
}

/** Monday of the week containing the given day key. */
export function weekStartKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  const offset = (dow + 6) % 7;
  return addDays(key, -offset);
}

export function monthStartKey(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1 + n, 1));
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Inclusive list of day keys from `from` to `to`. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  let k = from;
  let guard = 0;
  while (k <= to && guard < 4000) {
    out.push(k);
    k = addDays(k, 1);
    guard++;
  }
  return out;
}

/** Last `n` day keys ending with `end` (inclusive), oldest first. */
export function lastNDays(end: string, n: number): string[] {
  return dayRange(addDays(end, -(n - 1)), end);
}

/** Milliseconds since local midnight for a timestamp. */
export function msIntoDay(ms: number): number {
  return ms - startOfDayMs(ms);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). DST safe. */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY);
}

/** Combine a day key and "HH:MM" into epoch ms. */
export function atTime(key: string, hhmm: string): number {
  const [h, min] = hhmm.split(':').map(Number);
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}
