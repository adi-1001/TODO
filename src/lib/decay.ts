import type { Chapter, FocusSession, Task } from '../types';
import { countedSessions } from './stats';
import { dayKey, daysBetween } from './time';

/** A finished or revised chapter needs a brush-up after this many days without study. */
export const BRUSH_UP_DAYS = 14;
export const BRUSH_UP_PREFIX = 'brushup-';

/**
 * When each chapter was last studied: its stored `lastStudiedAt`, or the end of its latest
 * focus session if that is later (sessions synced from an older device do not touch the
 * chapter record). Null when neither exists yet.
 */
export function lastStudiedByChapter(chapters: Chapter[], sessions: FocusSession[]): Map<string, number | null> {
  const latest = new Map<string, number>();
  for (const s of countedSessions(sessions)) {
    if (!s.chapterId) continue;
    if (s.end > (latest.get(s.chapterId) ?? 0)) latest.set(s.chapterId, s.end);
  }
  const out = new Map<string, number | null>();
  for (const c of chapters) {
    const a = c.lastStudiedAt ?? 0;
    const b = latest.get(c.id) ?? 0;
    const v = Math.max(a, b);
    out.set(c.id, v > 0 ? v : null);
  }
  return out;
}

/**
 * Whole days since the chapter was last studied, when it needs a brush-up: it is Completed or
 * has Revision Done, and 14 or more calendar days have passed. Otherwise null.
 */
export function brushUpDays(chapter: Chapter, lastStudied: number | null, today: string): number | null {
  if (chapter.deleted || lastStudied === null) return null;
  if (chapter.status !== 'completed' && !chapter.revisionDone) return null;
  const days = daysBetween(dayKey(lastStudied), today);
  return days >= BRUSH_UP_DAYS ? days : null;
}

/** Brush-up task id: one per chapter per day, so a double tap creates one task. */
export function brushUpTaskId(chapterId: string, day: string): string {
  return `${BRUSH_UP_PREFIX}${chapterId}-${day}`;
}

/** Chapters that have a brush-up task still open on the Study Board. */
export function chaptersWithOpenBrushUp(tasks: Task[]): Set<string> {
  const out = new Set<string>();
  for (const t of tasks) {
    if (t.deleted || t.column === 'completed' || !t.chapterId || !t.id.startsWith(BRUSH_UP_PREFIX)) continue;
    out.add(t.chapterId);
  }
  return out;
}
