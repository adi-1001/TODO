import { testKindLabel } from '../../lib/tests';
import { MINUTE } from '../../lib/time';
import type { ChapterStatus, TestEvent } from '../../types';

/** The title shown for a test: its own title, or the kind when the title is empty. */
export function testTitle(t: Pick<TestEvent, 'title' | 'kind'>): string {
  return t.title.trim() || testKindLabel(t.kind);
}

/** Toggle chips used by the test dialogs. */
export const CHIP = 'tabular inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition';
export const CHIP_ON = 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-300/80 dark:bg-amber-300/90 dark:text-zinc-950';
export const CHIP_OFF =
  'border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/20 dark:hover:text-white';

/** Solid surface used by every Syllabus Tracker card. */
export const SYLLABUS_CARD = 'card-plain min-w-0';

/** Top horizon light per status: Ongoing sky, Practice Pending sunset amber, Completed emerald. */
export const STATUS_GLOW: Partial<Record<ChapterStatus, { line: string; wash: string }>> = {
  ongoing: { line: 'via-sky-400/70', wash: 'from-sky-400/[0.07]' },
  practice_pending: { line: 'via-amber-400/80', wash: 'from-amber-400/[0.08]' },
  completed: { line: 'via-emerald-400/70', wash: 'from-emerald-400/[0.07]' },
};

export const STATUS_ORDER: ChapterStatus[] = ['not_started', 'ongoing', 'practice_pending', 'completed'];

/** Neutral, amber, sky and emerald. Never red. */
export const STATUS_META: Record<ChapterStatus, { label: string; pill: string; dot: string }> = {
  not_started: {
    label: 'Not Started',
    pill: 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-300',
    dot: 'bg-zinc-400 dark:bg-zinc-500',
  },
  ongoing: {
    label: 'Ongoing',
    pill: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-200',
    dot: 'bg-sky-500 dark:bg-sky-300',
  },
  practice_pending: {
    label: 'Practice Pending',
    pill: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200',
    dot: 'bg-amber-500 dark:bg-amber-300',
  },
  completed: {
    label: 'Completed',
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-200',
    dot: 'bg-emerald-500 dark:bg-emerald-300',
  },
};

/** Always "Xh Ym", so empty totals read "0h 0m". */
export function hm(ms: number): string {
  const totalMin = Math.floor((Number.isFinite(ms) ? Math.max(0, ms) : 0) / MINUTE);
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}

/** Whole percentage, 0 when there is nothing to divide by. */
export function percent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}
