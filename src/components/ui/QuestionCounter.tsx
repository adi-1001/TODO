import { Minus, Plus } from 'lucide-react';
import { memo, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useBackHandler } from '../../native/backButton';

/** Batch amounts logged in one tap. */
export const QUESTION_BATCHES = [5, 10, 25, 50] as const;

/** Largest number accepted from the typed field. */
const MAX_TYPED = 99999;

export interface QuestionCounterProps {
  /** Current total. */
  count: number;
  /** Adds `delta` (negative to remove). */
  onAdd: (delta: number) => Promise<unknown>;
  /** Sets the total directly. When absent, Set total adds the difference through `onAdd`. */
  onSetTotal?: (total: number) => Promise<unknown>;
  /** Accessible name of the control, for example "Questions practiced for Kinematics". */
  label: string;
  /**
   * Compact: only `- count +` in the row; the typed editor and the batch pills open in a small
   * floating panel under the count. Otherwise the batch pills sit under the row and the editor
   * replaces them in place.
   */
  compact?: boolean;
  className?: string;
}

/** Tactile press: a short scale-down on the transform transition (icon-btn and PILL use `transition`). */
const PRESS = 'active:scale-[0.98] disabled:active:scale-100';
const STEP = `icon-btn h-8 w-8 shrink-0 border border-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/10 ${PRESS}`;
const PILL = `tabular inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-full border border-zinc-200 px-2 text-[11px] font-semibold text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/20 dark:hover:bg-white/[0.05] dark:hover:text-white ${PRESS}`;
const ACTION = 'inline-flex h-8 shrink-0 items-center justify-center rounded-lg px-2.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

function parseTyped(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_TYPED, Math.max(0, Math.round(n)));
}

/** `- count +` for questions, with a typed editor (Set total, Add) and batch pills +5 +10 +25 +50. */
export const QuestionCounter = memo(function QuestionCounter({ count, onAdd, onSetTotal, label, compact = false, className = '' }: QuestionCounterProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const countRef = useRef<HTMLButtonElement>(null);

  const close = (refocus = false) => {
    setEditing(false);
    if (refocus) countRef.current?.focus();
  };
  useBackHandler(editing, () => close(true));

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setEditing(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [editing]);

  const open = () => {
    setDraft('');
    setEditing(true);
  };

  const add = (e?: FormEvent) => {
    e?.preventDefault();
    const n = parseTyped(draft);
    if (n === null || n === 0) return;
    void onAdd(n);
    close(true);
  };

  const setTotal = () => {
    const n = parseTyped(draft);
    if (n === null) return;
    if (n !== count) void (onSetTotal ? onSetTotal(n) : onAdd(n - count));
    close(true);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };

  const typed = parseTyped(draft);

  const pills = (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`Log a batch: ${label}`}>
      {QUESTION_BATCHES.map((n) => (
        <button
          key={n}
          type="button"
          className={PILL}
          onClick={() => {
            void onAdd(n);
            if (editing) close(true);
          }}
          aria-label={`Add ${n} questions`}
        >
          +{n}
        </button>
      ))}
    </div>
  );

  const editor = (
    <form onSubmit={add} className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_TYPED}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder={String(count)}
        aria-label={`Number of questions: ${label}`}
        className="field tabular h-8 w-[4.5rem] min-w-0 px-2 py-0 text-center text-xs font-bold"
      />
      <button
        type="button"
        onClick={setTotal}
        disabled={typed === null}
        className={`${ACTION} text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.07]`}
      >
        Set total
      </button>
      <button
        type="submit"
        disabled={typed === null || typed === 0}
        className={`${ACTION} bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-amber-300/90 dark:text-zinc-950 dark:hover:bg-amber-200`}
      >
        Add
      </button>
    </form>
  );

  return (
    <div ref={rootRef} className={`relative flex min-w-0 flex-col gap-1.5 ${compact ? 'items-center' : 'items-end'} ${className}`}>
      <div className="flex items-center gap-1" role="group" aria-label={label}>
        <button type="button" onClick={() => void onAdd(-1)} disabled={count <= 0} className={STEP} aria-label="One fewer question">
          <Minus size={14} strokeWidth={1.75} />
        </button>
        <button
          ref={countRef}
          type="button"
          onClick={() => (editing ? close() : open())}
          aria-expanded={editing}
          aria-label={`${count} questions. Tap to type a number`}
          title="Tap to type a number"
          className={`tabular h-8 min-w-[2.5rem] rounded-lg px-1.5 text-center text-xs font-bold text-zinc-900 transition hover:bg-zinc-100 dark:text-white dark:hover:bg-white/[0.06] ${
            editing ? 'bg-zinc-100 dark:bg-white/[0.06]' : ''
          }`}
        >
          <span aria-live="polite">{count}</span>
        </button>
        <button type="button" onClick={() => void onAdd(1)} className={STEP} aria-label="One more question">
          <Plus size={14} strokeWidth={1.75} />
        </button>
      </div>

      {compact ? (
        editing && (
          <div
            role="dialog"
            aria-label={`Log questions: ${label}`}
            className="card-plain absolute right-0 top-full z-30 mt-1 flex w-max max-w-[15rem] flex-col gap-2 p-2 shadow-lg"
          >
            {editor}
            {pills}
          </div>
        )
      ) : editing ? (
        editor
      ) : (
        pills
      )}
    </div>
  );
});
