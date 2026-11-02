import { Plus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { addChapterQuestions, addSubjectQuestions } from '../../db/repo';
import { useBackHandler } from '../../native/backButton';
import { showNotice } from '../../state/notice';
import type { Chapter, Subject } from '../../types';

/** Select value for questions not tied to a chapter. */
const GENERAL = '';
const QUICK_AMOUNTS = [10, 25, 50, 100] as const;
const MAX_LOG = 99999;

/** Glass input: translucent with a brighter top edge in dark mode; options keep a solid background. */
const GLASS_FIELD = 'field dark:border-white/[0.09] dark:border-t-white/[0.15] dark:bg-white/[0.04] [&>option]:bg-white dark:[&>option]:bg-[#1A1E29]';

const PILL =
  'press tabular inline-flex h-8 min-w-[2.5rem] items-center justify-center rounded-full border border-zinc-200 px-2 text-[11px] font-semibold text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:border-white/10 dark:border-t-white/[0.16] dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:border-white/20 dark:hover:bg-white/[0.05] dark:hover:text-white';

function parseAmount(raw: string): number {
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(n)) return 0;
  return Math.min(MAX_LOG, Math.max(0, Math.round(n)));
}

interface LogQuestionsPopoverProps {
  subject: Subject;
  chapters: Chapter[];
  /** Classes for the wrapper, which is also the anchor of the panel. */
  className?: string;
}

/**
 * "+ Log Questions" for a subject: a small panel with a chapter select (or General Subject
 * Practice), a number field, quick amounts and Save.
 */
export function LogQuestionsPopover({ subject, chapters, className = '' }: LogQuestionsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>(() => chapters[0]?.id ?? GENERAL);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  useBackHandler(open, () => close(true));

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    // Keep the last choice while that chapter still exists.
    if (target !== GENERAL && !chapters.some((c) => c.id === target)) setTarget(chapters[0]?.id ?? GENERAL);
    setDraft('');
    setOpen(true);
  };

  const amount = parseAmount(draft);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (amount <= 0 || busy) return;
    setBusy(true);
    try {
      if (target === GENERAL) await addSubjectQuestions(subject.id, amount);
      else await addChapterQuestions(target, amount);
      showNotice(amount === 1 ? 'Logged 1 question' : `Logged ${amount} questions`);
      close(true);
    } finally {
      setBusy(false);
    }
  };

  const selectId = `log-questions-target-${subject.id}`;
  const amountId = `log-questions-amount-${subject.id}`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="btn-soft min-h-8 px-2.5 py-1.5 text-[11px]"
      >
        <Plus size={14} strokeWidth={1.75} aria-hidden />
        Log Questions
      </button>

      {open && (
        <div role="dialog" aria-label={`Log questions for ${subject.name}`} className="card-plain absolute inset-x-2 top-full z-30 mt-1 p-2.5 shadow-lg animate-rise-in dark:bg-[#161A23] dark:shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
          <form onSubmit={(e) => void save(e)} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label htmlFor={selectId} className="sr-only">
                Chapter
              </label>
              <select id={selectId} value={target} onChange={(e) => setTarget(e.target.value)} className={`${GLASS_FIELD} h-8 min-w-0 flex-1 px-2 py-0 text-xs`}>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
                <option value={GENERAL}>General Subject Practice</option>
              </select>
              <label htmlFor={amountId} className="sr-only">
                Number of questions
              </label>
              <input
                ref={inputRef}
                id={amountId}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_LOG}
                step={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="0"
                className={`${GLASS_FIELD} tabular h-8 w-[4.5rem] shrink-0 px-2 py-0 text-center text-xs font-bold`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_AMOUNTS.map((n) => (
                <button key={n} type="button" className={PILL} onClick={() => setDraft(String(Math.min(MAX_LOG, parseAmount(draft) + n)))} aria-label={`Add ${n} to the number`}>
                  +{n}
                </button>
              ))}
              <button type="submit" className="btn-primary ml-auto min-h-8 px-3 py-1.5" disabled={amount <= 0 || busy}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
