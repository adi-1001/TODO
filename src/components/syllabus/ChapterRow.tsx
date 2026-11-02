import { History, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { memo, useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { addChapterQuestions, deleteChapter, scheduleBrushUp, setChapterStatus, setChapterTarget, updateChapter } from '../../db/repo';
import { formatShort } from '../../lib/format';
import { CHAPTER_MILESTONES, chapterProgress, type ChapterChecks, type MilestoneKey } from '../../lib/syllabus';
import type { Chapter, ChapterStatus } from '../../types';
import { QuestionCounter } from '../ui/QuestionCounter';
import { TargetPresets } from '../ui/TargetPresets';
import { STATUS_GLOW, STATUS_META, STATUS_ORDER } from './shared';

interface ChapterRowProps {
  chapter: Chapter;
  focusMs: number;
  openTasks: number;
  /** Questions practiced on this chapter: its tasks plus manual chapter adjustments. */
  questions: number;
  /** Target Questions of the chapter's tasks, summed, or null when none has one. */
  questionTarget: number | null;
  /** Days since last study when the chapter needs a brush-up, otherwise null. */
  brushUpDays: number | null;
  /** A brush-up task for this chapter is already on the Study Board. */
  brushUpScheduled: boolean;
  onQuickAdd: (chapter: Chapter) => void;
}

/** Calm amber label and the 1-click brush-up for a chapter not studied in 14 or more days. */
function BrushUp({ chapter, days, scheduled }: { chapter: Chapter; days: number; scheduled: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="tabular inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
        <History size={12} strokeWidth={1.75} aria-hidden />
        Needs Brush-up • {days}d ago
      </span>
      {scheduled ? (
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Brush-up in Pending Topics</span>
      ) : (
        <button
          type="button"
          className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-amber-800 hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-200 dark:hover:bg-amber-300/10"
          onClick={() => {
            setBusy(true);
            void scheduleBrushUp(chapter.id).finally(() => setBusy(false));
          }}
          disabled={busy}
          aria-label={`Schedule a 25 minute brush-up for ${chapter.title}`}
        >
          <Plus size={14} strokeWidth={1.75} aria-hidden />
          Schedule 25m Brush-up
        </button>
      )}
    </div>
  );
}

/**
 * Grid template shared by the header and every row at xl. Below xl each row is a stacked card.
 * Columns: chapter, status, four milestone checks, questions practiced, time, open tasks, actions.
 */
export const CHAPTER_GRID =
  'xl:grid xl:grid-cols-[minmax(0,1fr)_8.75rem_4rem_4rem_4rem_4rem_7rem_4.5rem_3.5rem_4.5rem] xl:items-center xl:gap-2.5';

function checkChange(key: MilestoneKey, value: boolean): Partial<ChapterChecks> {
  return { [key]: value } as Partial<ChapterChecks>;
}

/** One chapter: a table row on wide screens, a card on phones. */
export const ChapterRow = memo(function ChapterRow({ chapter, focusMs, openTasks, questions, questionTarget, brushUpDays, brushUpScheduled, onQuickAdd }: ChapterRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chapter.title);
  const [confirming, setConfirming] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  /** Set once the edit is saved or cancelled, so a blur after Enter or Escape does nothing. */
  const closed = useRef(false);
  const meta = STATUS_META[chapter.status];
  const progress = chapterProgress(chapter);

  const chapterId = chapter.id;
  const onAddQuestions = useCallback((delta: number) => addChapterQuestions(chapterId, delta), [chapterId]);

  const startEdit = () => {
    closed.current = false;
    setDraft(chapter.title);
    setEditing(true);
  };

  const save = () => {
    if (closed.current) return;
    closed.current = true;
    const next = draft.trim();
    setEditing(false);
    if (next && next !== chapter.title) void updateChapter(chapter.id, { title: next });
  };

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closed.current = true;
      setEditing(false);
    }
  };

  const cellLabel = 'text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 xl:sr-only';
  const targetLine = questionTarget !== null ? `${Math.min(questions, questionTarget)} of ${questionTarget} target Qs` : '';
  const questionsLabel = `Questions practiced for ${chapter.title}`;

  return (
    <div role="row" className="relative border-b border-zinc-200 px-4 py-3.5 last:border-b-0 dark:border-white/[0.07] xl:py-2.5">
      {/* Status horizon: a thin top light and a soft wash in the status colour. */}
      {STATUS_GLOW[chapter.status] && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-10 overflow-hidden">
          <span className={`absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent ${STATUS_GLOW[chapter.status]?.line}`} />
          <span className={`absolute inset-0 bg-gradient-to-b to-transparent ${STATUS_GLOW[chapter.status]?.wash}`} />
        </span>
      )}
      <div className={`flex flex-col gap-3 ${CHAPTER_GRID}`}>
        {/* Title and progress */}
        <div role="cell" className="flex min-w-0 items-center gap-1.5">
          {editing ? (
            <>
              <label htmlFor={`chapter-title-${chapter.id}`} className="sr-only">
                Chapter title
              </label>
              <input
                id={`chapter-title-${chapter.id}`}
                className="field py-1.5"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onTitleKey}
                onBlur={save}
                maxLength={120}
                autoFocus
              />
            </>
          ) : (
            <>
              <span className="relative min-w-[120px] break-words whitespace-normal text-sm font-semibold leading-relaxed text-zinc-900 dark:text-zinc-100">{chapter.title}</span>
              <span
                className={`tabular shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                  progress >= 100
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-300/10 dark:text-emerald-200'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300'
                }`}
                title="Chapter progress"
              >
                <span className="sr-only">Progress </span>
                {progress}%
              </span>
              <span className="flex-1" aria-hidden />
              <button type="button" className="icon-btn shrink-0" onClick={startEdit} aria-label={`Rename ${chapter.title}`}>
                <Pencil size={14} strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>

        {/* Status */}
        <div role="cell" className="flex items-center justify-between gap-2 xl:block">
          <span className={cellLabel} aria-hidden>
            Status
          </span>
          <label htmlFor={`chapter-status-${chapter.id}`} className="sr-only">
            Status of {chapter.title}
          </label>
          <span className={`relative inline-flex items-center rounded-full border ${meta.pill}`}>
            <span className={`pointer-events-none absolute left-2.5 h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
            <select
              id={`chapter-status-${chapter.id}`}
              value={chapter.status}
              onChange={(e) => void setChapterStatus(chapter.id, e.target.value as ChapterStatus)}
              className="min-h-8 cursor-pointer appearance-none rounded-full border-0 bg-transparent py-1 pl-6 pr-3 text-[11px] font-semibold text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 [&>option]:bg-white [&>option]:text-zinc-900 dark:[&>option]:bg-[#1A1E29] dark:[&>option]:text-zinc-100"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
          </span>
        </div>

        {/* Milestones: 2 by 2 tiles on phones, one column each at xl */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:contents">
          {CHAPTER_MILESTONES.map((m) => {
            const done = chapter[m.key];
            return (
              <div role="cell" key={m.key} className="min-w-0 xl:flex xl:justify-center">
                <label
                  title={m.label}
                  className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition xl:min-h-8 xl:p-2 ${
                    done
                      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-300/25 dark:border-t-emerald-200/40 dark:bg-emerald-400/[0.1] dark:text-emerald-100 dark:shadow-[0_0_14px_rgba(16,185,129,0.22)]'
                      : 'border-zinc-200 text-zinc-700 dark:border-white/10 dark:text-zinc-200 xl:border-transparent xl:dark:border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={(e) => void updateChapter(chapter.id, checkChange(m.key, e.target.checked))}
                    aria-label={`${m.label}: ${chapter.title}`}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded accent-emerald-600 dark:accent-emerald-400"
                  />
                  <span className="whitespace-normal break-normal leading-snug xl:sr-only" aria-hidden>
                    {m.short} Done
                  </span>
                </label>
              </div>
            );
          })}
        </div>

        {/* Questions practiced, time, open tasks */}
        <div className="flex flex-col gap-3 xl:contents">
          <div role="cell" className="flex items-start justify-between gap-2 xl:flex xl:flex-col xl:items-center xl:gap-0.5">
            <span className={`${cellLabel} pt-2.5`}>
              Questions Practiced
              {questionTarget !== null && <span className="tabular block font-medium normal-case">{targetLine}</span>}
            </span>
            <div className="xl:hidden">
              <QuestionCounter count={questions} onAdd={onAddQuestions} label={questionsLabel} />
            </div>
            <div className="hidden xl:block">
              <QuestionCounter compact count={questions} onAdd={onAddQuestions} label={questionsLabel} />
            </div>
            <button
              type="button"
              className="press hidden items-center gap-1 rounded-md px-1.5 py-0.5 text-center text-[10px] font-semibold leading-snug text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white xl:inline-flex"
              onClick={() => setTargetOpen((v) => !v)}
              aria-expanded={targetOpen}
              aria-label={`Target Questions for ${chapter.title}`}
            >
              <Target size={11} strokeWidth={1.75} aria-hidden />
              <span className="tabular whitespace-nowrap">{questionTarget !== null ? targetLine : 'Set target'}</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:contents">
            <div role="cell" className="flex flex-col gap-1 xl:items-center">
              <span className={cellLabel}>Total Time Spent</span>
              <span className="tabular py-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{formatShort(focusMs)}</span>
            </div>
            <div role="cell" className="flex flex-col gap-1 xl:items-center">
              <span className={cellLabel}>Open tasks</span>
              <span className="tabular py-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{openTasks}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div role="cell" className="flex flex-wrap items-center gap-1 xl:flex-nowrap xl:justify-end">
          <button
            type="button"
            className="btn-soft press px-2.5 py-1.5 xl:hidden"
            onClick={() => setTargetOpen((v) => !v)}
            aria-expanded={targetOpen}
            aria-label={`Target Questions for ${chapter.title}`}
          >
            <Target size={14} strokeWidth={1.75} aria-hidden />
            {chapter.targetQuestions !== null ? `Target ${chapter.targetQuestions} Qs` : 'Set target'}
          </button>
          <button type="button" className="btn-soft px-2.5 py-1.5 xl:hidden" onClick={() => onQuickAdd(chapter)}>
            <Plus size={14} strokeWidth={1.75} aria-hidden />
            Quick Add Task
          </button>
          <button type="button" className="icon-btn hidden xl:inline-flex" onClick={() => onQuickAdd(chapter)} aria-label={`Quick Add Task for ${chapter.title}`} title="Quick Add Task">
            <Plus size={16} strokeWidth={1.75} />
          </button>
          <button type="button" className="icon-btn ml-auto xl:ml-0" onClick={() => setConfirming(true)} aria-label={`Delete ${chapter.title}`} title="Delete chapter">
            <Trash2 size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {targetOpen && (
        <div className="glass mt-3 animate-fade-in space-y-2 p-3">
          <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">Target Questions for this chapter</div>
          <TargetPresets value={chapter.targetQuestions} onChange={(n) => void setChapterTarget(chapter.id, n)} label={`Target Questions for ${chapter.title}`} allowNone compact />
          <p className="muted whitespace-normal break-normal text-[11px] leading-relaxed">
            {chapter.targetQuestions !== null
              ? 'Every question logged on this chapter or its tasks counts toward this target, and the Backlog card uses it.'
              : questionTarget !== null
                ? `No chapter target, so its tasks' targets count (${questionTarget} Qs).`
                : 'No target yet. The Backlog card estimates 30 Qs for each unfinished Ref. Book or PYQ set.'}
          </p>
        </div>
      )}

      {brushUpDays !== null && (
        <div className="mt-2.5 xl:mt-1.5">
          <BrushUp chapter={chapter} days={brushUpDays} scheduled={brushUpScheduled} />
        </div>
      )}

      {confirming && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-white/[0.07] dark:bg-white/[0.03]">
          <span className="text-xs text-zinc-700 dark:text-zinc-200">Delete this chapter? Its tasks stay on the board.</span>
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="btn bg-rose-50 px-2.5 py-1.5 text-rose-700 hover:bg-rose-100 dark:bg-rose-300/10 dark:text-rose-200 dark:hover:bg-rose-300/15"
              onClick={() => void deleteChapter(chapter.id)}
              autoFocus
            >
              Delete
            </button>
            <button type="button" className="btn-ghost px-2.5 py-1.5" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        </div>
      )}
    </div>
  );
});
