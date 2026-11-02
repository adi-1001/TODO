import type { Chapter, MistakeCounts, TestEvent, TestKind, TestResult } from '../types';
import { addDays, daysBetween } from './time';

export const TEST_KINDS: { value: TestKind; label: string }[] = [
  { value: 'coaching', label: 'Coaching Test' },
  { value: 'unit', label: 'Unit Test' },
  { value: 'assignment', label: 'Assignment or Deadline' },
  { value: 'other', label: 'Other' },
];

export function testKindLabel(kind: TestKind): string {
  return TEST_KINDS.find((k) => k.value === kind)?.label ?? 'Test';
}

export const MISTAKE_TYPES: { key: keyof MistakeCounts; label: string; hint: string }[] = [
  { key: 'conceptual', label: 'Conceptual Gap', hint: 'Did not know the theory or formula' },
  { key: 'calculation', label: 'Calculation or Silly Mistake', hint: 'Knew it, made an arithmetic or reading error' },
  { key: 'timePressure', label: 'Time Pressure', hint: 'Could not reach or finish the question in time' },
  { key: 'guessed', label: 'Guessed or Panic Attempt', hint: 'Answered without being sure' },
];

export const MISTAKE_COLORS: Record<keyof MistakeCounts, string> = {
  conceptual: '#F5A35C',
  calculation: '#6FA8DC',
  timePressure: '#E79AA6',
  guessed: '#B39DDB',
};

const live = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);

/** Tests on or after today, soonest first. */
export function upcomingTests(tests: TestEvent[], today: string): TestEvent[] {
  return live(tests)
    .filter((t) => t.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Tests whose date has passed (or is today) and that have no result yet, latest first. */
export function testsAwaitingResult(tests: TestEvent[], results: TestResult[], today: string): TestEvent[] {
  const done = new Set(live(results).map((r) => r.testId));
  return live(tests)
    .filter((t) => t.date <= today && !done.has(t.id) && t.kind !== 'assignment')
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** "today", "tomorrow", "in 6 days", "2 days ago". */
export function countdownText(date: string, today: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d > 1) return `in ${d} days`;
  if (d === -1) return 'yesterday';
  return `${-d} days ago`;
}

/** Linked chapters that are not completed yet. */
export function chaptersLeft(test: TestEvent, chapters: Chapter[]): number {
  const byId = new Map(chapters.filter((c) => !c.deleted).map((c) => [c.id, c]));
  return test.chapterIds.filter((id) => {
    const c = byId.get(id);
    return c !== undefined && c.status !== 'completed';
  }).length;
}

export function resultPercent(r: Pick<TestResult, 'scored' | 'total'>): number {
  if (!(r.total > 0)) return 0;
  return Math.round((Math.max(0, r.scored) / r.total) * 1000) / 10;
}

export function totalMistakes(m: MistakeCounts): number {
  return m.conceptual + m.calculation + m.timePressure + m.guessed;
}

/**
 * The next occurrence date of a repeating series whose latest test is on `latest`: the first
 * date `latest + k * every` (k >= 1) that is on or after `today`.
 */
export function nextOccurrenceDate(latest: string, every: number, today: string): string {
  const step = Math.max(1, Math.round(every));
  const gap = daysBetween(latest, today);
  const k = Math.max(1, Math.ceil(gap / step));
  return addDays(latest, k * step);
}

export interface NewOccurrence {
  id: string;
  seriesId: string;
  date: string;
  from: TestEvent;
}

/**
 * Next occurrences to create for repeating series whose latest test is before today. Ids are
 * `<seriesId>@<date>`, so running this on two devices creates the same records.
 */
export function pendingOccurrences(tests: TestEvent[], today: string): NewOccurrence[] {
  const latestBySeries = new Map<string, TestEvent>();
  for (const t of live(tests)) {
    const series = t.seriesId ?? t.id;
    const cur = latestBySeries.get(series);
    if (!cur || t.date > cur.date) latestBySeries.set(series, t);
  }
  const all = new Set(tests.map((t) => t.id));
  const out: NewOccurrence[] = [];
  for (const [seriesId, latest] of latestBySeries) {
    if (!latest.repeatEveryDays || latest.date >= today) continue;
    const date = nextOccurrenceDate(latest.date, latest.repeatEveryDays, today);
    const id = `${seriesId}@${date}`;
    if (!all.has(id)) out.push({ id, seriesId, date, from: latest });
  }
  return out;
}

export function fixTaskId(testId: string, chapterId: string): string {
  return `fix-${testId}-${chapterId}`;
}
