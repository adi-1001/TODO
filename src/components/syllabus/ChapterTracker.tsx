import { ListChecks, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { addChapter } from '../../db/repo';
import type { TaskDialogOptions } from '../../state/UIProvider';
import type { Chapter, ChapterStatus, Subject } from '../../types';
import { EmptyState, Segmented } from '../ui/controls';
import { CHAPTER_GRID, ChapterRow } from './ChapterRow';
import { STATUS_META, SYLLABUS_CARD } from './shared';
import { BRUSH_UP_DAYS, brushUpDays } from '../../lib/decay';
import { CHAPTER_MILESTONES } from '../../lib/syllabus';

type Filter = 'all' | ChapterStatus | 'revision';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'practice_pending', label: 'Practice Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'revision', label: 'Needs Revision' },
];

interface ChapterTrackerProps {
  subject: Subject;
  chapters: Chapter[];
  msByChapter: Map<string, number>;
  openTasksByChapter: Map<string, number>;
  questionsByChapter: Map<string, number>;
  /** Target Questions of the chapter's tasks, summed. */
  questionTargetByChapter: Map<string, number>;
  /** Last studied time per chapter (stored or from sessions). */
  lastStudied: Map<string, number | null>;
  /** Chapters with a brush-up task still open. */
  brushUpOpen: Set<string>;
  today: string;
  openTask: (options?: TaskDialogOptions) => void;
}

/** Chapters of one subject with a status filter, an add row and the chapter table. */
export function ChapterTracker({ subject, chapters, msByChapter, openTasksByChapter, questionsByChapter, questionTargetByChapter, lastStudied, brushUpOpen, today, openTask }: ChapterTrackerProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Rows are memoized, so hand them a callback that never changes identity.
  const openTaskRef = useRef(openTask);
  useEffect(() => {
    openTaskRef.current = openTask;
  }, [openTask]);
  const onQuickAdd = useCallback((c: Chapter) => {
    openTaskRef.current({ subjectId: c.subjectId, chapterId: c.id, category: c.status === 'completed' ? 'pending' : 'current' });
  }, []);

  /** Days since last study for chapters that need a brush-up. */
  const decay = useMemo(() => {
    const out = new Map<string, number>();
    for (const c of chapters) {
      const d = brushUpDays(c, lastStudied.get(c.id) ?? null, today);
      if (d !== null) out.set(c.id, d);
    }
    return out;
  }, [chapters, lastStudied, today]);

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: chapters.length, not_started: 0, ongoing: 0, practice_pending: 0, completed: 0, revision: decay.size };
    for (const c of chapters) out[c.status] += 1;
    return out;
  }, [chapters, decay]);

  const visible = useMemo(
    () => (filter === 'all' ? chapters : filter === 'revision' ? chapters.filter((c) => decay.has(c.id)) : chapters.filter((c) => c.status === filter)),
    [chapters, filter, decay],
  );

  const options = useMemo(
    () =>
      FILTERS.map((f) => ({
        value: f.value,
        label: (
          <>
            {f.label}
            <span className="tabular rounded-md bg-zinc-200/70 px-1.5 text-[10px] font-bold text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300">{counts[f.value]}</span>
          </>
        ),
      })),
    [counts],
  );

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTitle('');
    await addChapter(subject.id, t);
    inputRef.current?.focus();
  };

  const inputId = `new-chapter-${subject.id}`;
  const filterName = FILTERS.find((f) => f.value === filter)?.label ?? 'All';

  return (
    <section className={SYLLABUS_CARD} aria-labelledby="syllabus-chapters-title">
      <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-white/[0.07] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="syllabus-chapters-title" className="section-title flex min-w-0 items-start gap-2">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} aria-hidden />
            <span className="min-w-0 break-words whitespace-normal leading-relaxed">{subject.name} chapters</span>
          </h2>
          <div className="max-w-full">
            <Segmented label="Chapter status filter" value={filter} onChange={setFilter} options={options} size="sm" wrap />
          </div>
        </div>

        <form onSubmit={add} className="flex items-center gap-2">
          <label htmlFor={inputId} className="sr-only">
            New chapter title
          </label>
          <input
            id={inputId}
            ref={inputRef}
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a chapter and press Enter"
            maxLength={120}
            autoComplete="off"
          />
          <button type="submit" className="btn-primary shrink-0" disabled={!title.trim()}>
            <Plus size={14} strokeWidth={1.75} aria-hidden />
            <span className="hidden sm:inline">Add Chapter</span>
            <span className="sr-only sm:hidden">Add Chapter</span>
          </button>
        </form>
      </div>

      {chapters.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState icon={<ListChecks size={20} strokeWidth={1.75} />} title="No chapters yet. Add the first one above." hint="Each chapter tracks theory, reference book, past questions, revision and time spent." />
        </div>
      ) : visible.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState
            icon={<ListChecks size={20} strokeWidth={1.75} />}
            title={`No ${filterName.toLowerCase()} chapters.`}
            hint={
              filter === 'completed'
                ? 'Chapters you mark Completed show up here.'
                : filter === 'practice_pending'
                  ? 'Chapters with theory done and practice still left show up here.'
                  : filter === 'revision'
                    ? `Finished or revised chapters show up here after ${BRUSH_UP_DAYS} days without study.`
                    : 'Choose another filter to see the rest.'
            }
          />
        </div>
      ) : (
        <div role="table" aria-label={`${subject.name} chapters, ${filter === 'all' ? 'all' : filter === 'revision' ? 'needs revision' : STATUS_META[filter].label}`}>
          <div role="rowgroup" className="hidden border-b border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-white/[0.07] dark:bg-white/[0.02] xl:block">
            <div role="row" className={`${CHAPTER_GRID} text-[10px] font-semibold uppercase leading-tight tracking-wide text-zinc-500 dark:text-zinc-400`}>
              <span role="columnheader">Chapter</span>
              <span role="columnheader">Status</span>
              {CHAPTER_MILESTONES.map((m) => (
                <span key={m.key} role="columnheader" className="text-center" title={m.label}>
                  <span aria-hidden>{m.short}</span>
                  <span className="sr-only">{m.label}</span>
                </span>
              ))}
              <span role="columnheader" className="text-center">
                Questions Practiced
              </span>
              <span role="columnheader" className="text-center">
                Total Time Spent
              </span>
              <span role="columnheader" className="text-center">
                Open tasks
              </span>
              <span role="columnheader" className="text-right">
                <span className="sr-only">Actions</span>
              </span>
            </div>
          </div>
          <div role="rowgroup">
            {visible.map((c) => (
              <ChapterRow
                key={c.id}
                chapter={c}
                focusMs={msByChapter.get(c.id) ?? 0}
                openTasks={openTasksByChapter.get(c.id) ?? 0}
                questions={questionsByChapter.get(c.id) ?? 0}
                questionTarget={questionTargetByChapter.get(c.id) ?? null}
                brushUpDays={decay.get(c.id) ?? null}
                brushUpScheduled={brushUpOpen.has(c.id)}
                onQuickAdd={onQuickAdd}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
