import type { Block, ScheduleDay, ScheduleOverride, ScheduleSlot } from '../types';
import { HOUR, MINUTE, addDays, atTime, dayStart, weekStartKey } from './time';

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Display order, Monday first. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const SCHEDULE_PREFIX = 'schedule-';

export function weekdayOf(day: string): number {
  return new Date(dayStart(day)).getDay();
}

export function scheduleDayId(weekday: number): string {
  return `weekday-${weekday}`;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidSlot(s: Pick<ScheduleSlot, 'start' | 'end'>): boolean {
  return typeof s.start === 'string' && typeof s.end === 'string' && HHMM.test(s.start) && HHMM.test(s.end) && s.end > s.start;
}

export function sortSlots(slots: ScheduleSlot[] | null | undefined): ScheduleSlot[] {
  return (Array.isArray(slots) ? [...slots] : []).filter((s) => s !== null && typeof s === 'object' && isValidSlot(s)).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

/**
 * The class slots that apply on a date: that date's override when one exists, otherwise the
 * weekday's slots when the weekday is active, otherwise none.
 */
export function effectiveSlots(day: string, days: ScheduleDay[], overrides: ScheduleOverride[]): ScheduleSlot[] {
  const override = overrides.find((o) => o.id === day && !o.deleted);
  if (override) return sortSlots(override.slots);
  const weekday = days.find((d) => d.weekday === weekdayOf(day) && !d.deleted);
  return weekday && weekday.active ? sortSlots(weekday.slots) : [];
}

export function hasOverride(day: string, overrides: ScheduleOverride[]): boolean {
  return overrides.some((o) => o.id === day && !o.deleted);
}

/** Virtual class blocks for the timeline. They are computed, never stored. */
export function scheduledBlocks(day: string, days: ScheduleDay[], overrides: ScheduleOverride[]): Block[] {
  return effectiveSlots(day, days, overrides).map((s) => ({
    id: `${SCHEDULE_PREFIX}${day}-${s.id}`,
    updatedAt: 0,
    kind: 'class',
    label: s.label.trim() || 'Class',
    start: atTime(day, s.start),
    end: atTime(day, s.end),
  }));
}

export function isScheduledBlockId(id: string): boolean {
  return id.startsWith(SCHEDULE_PREFIX);
}

/** The slot id inside a virtual block id, or null for stored blocks. */
export function slotIdOf(blockId: string, day: string): string | null {
  const prefix = `${SCHEDULE_PREFIX}${day}-`;
  return blockId.startsWith(prefix) ? blockId.slice(prefix.length) : null;
}

/** Class time left on `day` after `now`, in ms, from scheduled and logged class blocks. */
export function classMsRemaining(blocks: Block[], now: number): number {
  let total = 0;
  for (const b of blocks) {
    if (b.deleted || b.kind !== 'class') continue;
    total += Math.max(0, b.end - Math.max(b.start, now));
  }
  return total;
}

/** The seven day keys of the week containing `day`, Monday first. */
export function weekDays(day: string): string[] {
  const from = weekStartKey(day);
  return Array.from({ length: 7 }, (_, i) => addDays(from, i));
}

export function slotMinutes(s: ScheduleSlot): number {
  const [h1, m1] = s.start.split(':').map(Number);
  const [h2, m2] = s.end.split(':').map(Number);
  return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
}

export function formatSlotHours(slots: ScheduleSlot[]): string {
  const ms = slots.reduce((a, s) => a + slotMinutes(s) * MINUTE, 0);
  const h = Math.floor(ms / HOUR);
  const m = Math.round((ms % HOUR) / MINUTE);
  return m ? `${h}h ${m}m` : `${h}h`;
}
