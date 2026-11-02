import type { Chapter, ChapterStatus } from '../types';

/** The four exam-prep milestones of a chapter, in order. */
export const CHAPTER_MILESTONES = [
  { key: 'theoryDone', label: 'Theory / Notes Done', short: 'Theory', weight: 25 },
  { key: 'referenceBookDone', label: 'Reference Book / Module Done', short: 'Ref. Book', weight: 35 },
  { key: 'pyqDone', label: 'PYQs (Past Questions) Done', short: 'PYQs', weight: 25 },
  { key: 'revisionDone', label: 'Revision Done', short: 'Revision', weight: 15 },
] as const;

export type MilestoneKey = (typeof CHAPTER_MILESTONES)[number]['key'];
export type ChapterChecks = Pick<Chapter, MilestoneKey>;

/** Theory, reference book and PYQs: the three that make a chapter Completed. */
const COMPLETION_WEIGHT = 85;

/**
 * Chapter progress 0..100 from its milestones (Theory 25, Reference Book 35, PYQs 25,
 * Revision 15). A chapter marked Completed by hand counts at least 85, the same as having the
 * three completion milestones, so Revision still adds the last 15.
 */
export function chapterProgress(c: Pick<Chapter, MilestoneKey | 'status'>): number {
  let p = 0;
  for (const m of CHAPTER_MILESTONES) if (c[m.key] === true) p += m.weight;
  if (c.status === 'completed') p = Math.max(p, COMPLETION_WEIGHT);
  return p;
}

/** Average progress of the chapters, 0..100, rounded. 0 for no chapters. */
export function subjectProgress(chapters: Pick<Chapter, MilestoneKey | 'status' | 'deleted'>[]): number {
  const live = chapters.filter((c) => !c.deleted);
  if (live.length === 0) return 0;
  return Math.round(live.reduce((a, c) => a + chapterProgress(c), 0) / live.length);
}

/**
 * The status after a milestone changed:
 * - Theory, Reference Book and PYQs all done: Completed.
 * - Theory done, practice left: Practice Pending.
 * - Some other milestone done: Ongoing.
 * - Nothing done: unchanged, unless it was Completed or Practice Pending, which go back to Ongoing.
 * A status chosen by hand stays until the next milestone change.
 */
export function autoChapterStatus(prev: ChapterStatus, c: ChapterChecks): ChapterStatus {
  if (c.theoryDone && c.referenceBookDone && c.pyqDone) return 'completed';
  if (c.theoryDone) return 'practice_pending';
  if (c.referenceBookDone || c.pyqDone || c.revisionDone) return 'ongoing';
  return prev === 'completed' || prev === 'practice_pending' ? 'ongoing' : prev;
}
