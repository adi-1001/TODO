import { Check, PencilLine } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { addQuestions, setTaskQuestions } from '../../db/repo';
import { useQuestionsByTask } from '../../hooks/useData';
import { useBackHandler } from '../../native/backButton';
import { useTimer } from '../../timer/TimerProvider';

export type QuestionButtonVariant = 'pill' | 'clock' | 'mini';

export interface QuestionButtonProps {
  /** `pill`: compact icon and "+1". `clock`: "+1 Question" with the total beside it. `mini`: small dark button for the Mini Timer. */
  variant?: QuestionButtonVariant;
  className?: string;
  /** Called when the bulk popover opens or closes, for example to keep the clock controls visible. */
  onOpenChange?: (open: boolean) => void;
}

const SAVED_MS = 1200;
const BATCHES = [5, 10, 25, 50];
const MAX_ADD = 10_000;
const MAX_TOTAL = 100_000;
const EDGE_PX = 8;
const GAP_PX = 6;
const MIN_PANEL_PX = 96;

const BUTTON: Record<QuestionButtonVariant, string> = {
  pill: 'relative inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-[11px] font-bold text-zinc-600 transition hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/[0.07] dark:hover:text-white',
  clock: 'btn-soft relative',
  mini: 'relative inline-flex h-8 shrink-0 items-center rounded-xl bg-white/[0.08] px-2.5 text-[11px] font-bold text-zinc-200 transition hover:bg-white/15 dark:bg-white/[0.08] dark:text-zinc-200 dark:hover:bg-white/15',
};

/** The tappable total that opens the bulk popover. */
const TOTAL: Record<QuestionButtonVariant, string> = {
  pill: 'tabular inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1 text-[11px] font-semibold text-zinc-400 transition hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-white',
  clock:
    'tabular inline-flex min-h-8 items-center rounded-lg px-2 text-sm text-zinc-500 underline decoration-zinc-300 decoration-dotted underline-offset-4 transition hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100',
  mini: 'tabular inline-flex h-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-[11px] text-zinc-400 underline decoration-zinc-600 decoration-dotted underline-offset-4 transition hover:bg-white/10 hover:text-white dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white',
};

interface Tone {
  panel: string;
  heading: string;
  muted: string;
  input: string;
  batch: string;
  primary: string;
  soft: string;
}

const LIGHT_DARK: Tone = {
  panel: 'border-zinc-200 bg-white text-zinc-900 dark:border-white/10 dark:bg-[#161922] dark:text-zinc-100',
  heading: 'text-zinc-400 dark:text-zinc-500',
  muted: 'text-zinc-500 dark:text-zinc-400',
  input:
    'border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-white/25',
  batch: 'border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/[0.04]',
  primary: 'bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-amber-300/90 dark:text-zinc-950 dark:hover:bg-amber-200',
  soft: 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-white/[0.07] dark:text-zinc-200 dark:hover:bg-white/[0.12]',
};

/** The Mini Timer is dark in both themes, so its popover matches it. */
const MINI: Tone = {
  panel: 'border-white/10 bg-zinc-800 text-white dark:border-white/10 dark:bg-zinc-800 dark:text-white',
  heading: 'text-zinc-400 dark:text-zinc-400',
  muted: 'text-zinc-400 dark:text-zinc-400',
  input:
    'border-white/10 bg-zinc-900 text-white placeholder:text-zinc-500 focus:border-amber-300/50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-amber-300/50',
  batch: 'border-white/10 text-zinc-200 hover:bg-white/10 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10',
  primary: 'bg-amber-300 text-zinc-950 hover:bg-amber-200 dark:bg-amber-300 dark:text-zinc-950 dark:hover:bg-amber-200',
  soft: 'bg-white/[0.08] text-zinc-200 hover:bg-white/15 dark:bg-white/[0.08] dark:text-zinc-200 dark:hover:bg-white/15',
};

const ACTION = 'inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-2.5 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40';

/** The pill groups "+1" and the total into one bordered control: "+1 | 12". */
const PILL_WRAP = 'rounded-lg border border-zinc-200 bg-white/60 dark:border-white/[0.08] dark:bg-white/[0.03]';

interface Placement {
  up: boolean;
  maxHeight: number | null;
  shift: number;
}

const START_PLACE: Placement = { up: false, maxHeight: null, shift: 0 };

function parseCount(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

/**
 * "+1 Question" for the timer's task. One tap logs one question; tapping the total opens a small
 * popover to add a batch, add a typed number or set the total. The popover stays inside this
 * element and listens on the trigger's own document, so it also works inside the Mini Timer's
 * Picture-in-Picture window.
 */
export function QuestionButton({ variant = 'pill', className = '', onOpenChange }: QuestionButtonProps) {
  const { activeTask } = useTimer();
  const totals = useQuestionsByTask();
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [status, setStatus] = useState('');
  const [place, setPlace] = useState<Placement>(START_PLACE);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const inputId = useId();
  const taskId = activeTask?.id ?? null;
  const tone = variant === 'mini' ? MINI : LIGHT_DARK;

  useEffect(() => () => clearTimeout(timer.current), []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setRaw('');
    setStatus('');
    if (refocus) totalRef.current?.focus();
  }, []);

  // A new task starts without the confirmation or the open popover of the previous one.
  useEffect(() => {
    clearTimeout(timer.current);
    setSaved(false);
    close(false);
  }, [taskId, close]);

  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    onOpenChangeRef.current?.(open);
  }, [open]);
  useEffect(() => () => onOpenChangeRef.current?.(false), []);

  useBackHandler(open, () => close(false));

  // Place the popover before it paints: pick the side with room, cap its height, keep it in the window.
  useLayoutEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current;
    const panel = panelRef.current;
    const win = wrap?.ownerDocument.defaultView;
    if (!wrap || !panel || !win) return;
    const rect = wrap.getBoundingClientRect();
    const need = panel.scrollHeight;
    const below = win.innerHeight - rect.bottom - GAP_PX - EDGE_PX;
    const above = rect.top - GAP_PX - EDGE_PX;
    const up = below < need && above > below;
    const room = Math.floor(up ? above : below);
    const box = panel.getBoundingClientRect();
    let shift = 0;
    if (box.right > win.innerWidth - EDGE_PX) shift = win.innerWidth - EDGE_PX - box.right;
    if (box.left + shift < EDGE_PX) shift = EDGE_PX - box.left;
    setPlace({ up, maxHeight: room < need ? Math.max(MIN_PANEL_PX, room) : null, shift: Math.round(shift) });
  }, [open]);

  // Focus the number field on devices with a mouse; on touch screens the keyboard would cover the popover.
  useEffect(() => {
    if (!open) return;
    const win = wrapRef.current?.ownerDocument.defaultView;
    if (win?.matchMedia?.('(pointer: fine)').matches) inputRef.current?.focus();
  }, [open]);

  // Close on pointer-down outside and on Escape, in the document that holds the button.
  useEffect(() => {
    if (!open) return;
    const doc = wrapRef.current?.ownerDocument;
    if (!doc) return;
    const onDown = (e: PointerEvent) => {
      const wrap = wrapRef.current;
      if (wrap && e.target && !wrap.contains(e.target as Node)) close(false);
    };
    // Capture phase, so Escape closes only the popover and not the clock behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    doc.addEventListener('pointerdown', onDown, true);
    doc.addEventListener('keydown', onKey, true);
    return () => {
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  if (!taskId) return null;
  const count = totals.get(taskId) ?? 0;

  const flash = () => {
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), SAVED_MS);
  };

  const addOne = async () => {
    try {
      await addQuestions(taskId, 1);
    } catch {
      return;
    }
    flash();
  };

  /** Runs a write. Batches keep the popover open for more taps; typed actions close it. */
  const run = async (write: () => Promise<number>, message: (total: number) => string, closeAfter: boolean) => {
    let total: number;
    try {
      total = await write();
    } catch {
      setStatus('Could not save. Try again.');
      return;
    }
    flash();
    if (closeAfter) close(true);
    else setStatus(message(total));
  };

  const n = parseCount(raw);
  const canAdd = n !== null && n >= 1 && n <= MAX_ADD;
  const canSet = n !== null && n >= 0 && n <= MAX_TOTAL;

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!canAdd || n === null) return;
    void run(() => addQuestions(taskId, n), (t) => `Added ${n}. Total ${t}.`, true);
  };

  const onSet = () => {
    if (!canSet || n === null) return;
    void run(() => setTaskQuestions(taskId, n), (t) => `Total set to ${t}.`, true);
  };

  const onBatch = (size: number) => void run(() => addQuestions(taskId, size), (t) => `Added ${size}. Total ${t}.`, false);

  const toggle = () => {
    if (open) {
      close(false);
      return;
    }
    setPlace(START_PLACE);
    setStatus('');
    setOpen(true);
  };

  const fadeOut = `transition-opacity duration-200 ${saved ? 'opacity-0' : 'opacity-100'}`;
  const fadeIn = `pointer-events-none absolute inset-0 flex items-center justify-center gap-1 transition-opacity duration-200 ${saved ? 'opacity-100' : 'opacity-0'}`;
  const countText = `${count} ${count === 1 ? 'question' : 'questions'}`;
  const iconSize = variant === 'clock' ? 16 : 14;
  const totalText = variant === 'clock' ? `${count} practiced` : variant === 'mini' ? `${count} total` : String(count);

  return (
    <span ref={wrapRef} className={`relative inline-flex shrink-0 items-center ${variant === 'pill' ? PILL_WRAP : 'gap-2'} ${className}`}>
      <button
        type="button"
        onClick={() => void addOne()}
        aria-label="Add one question practiced"
        title={`Add one question practiced (${countText} on this task)`}
        className={BUTTON[variant]}
      >
        <span className={`inline-flex items-center gap-1 ${fadeOut}`}>
          <PencilLine size={iconSize} strokeWidth={1.75} aria-hidden />
          <span className="tabular">{variant === 'clock' ? '+1 Question' : '+1'}</span>
        </span>
        <span className={fadeIn} aria-hidden>
          <Check size={iconSize} strokeWidth={1.75} />
          {variant !== 'pill' && 'Saved'}
        </span>
      </button>
      {variant === 'pill' && <span className="h-4 w-px shrink-0 bg-zinc-200 dark:bg-white/10" aria-hidden />}
      <button
        ref={totalRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${countText} on this task. Add several or set the total`}
        title="Add several questions or set the total"
        className={TOTAL[variant]}
      >
        {totalText}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {saved ? `Saved. ${countText}` : ''}
      </span>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Log questions"
          className={`custom-scroll absolute left-1/2 z-40 w-[min(17rem,calc(100dvw-1rem))] -translate-x-1/2 animate-fade-in overflow-y-auto overscroll-contain rounded-2xl border p-3 text-left shadow-xl ${tone.panel} ${
            place.up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
          style={{ maxHeight: place.maxHeight ?? undefined, translate: place.shift ? `${place.shift}px 0` : undefined }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className={`whitespace-nowrap text-[10px] font-bold uppercase tracking-widest ${tone.heading}`}>Questions</span>
            <span className={`tabular whitespace-nowrap text-[11px] ${tone.muted}`}>{count} on this task</span>
          </div>
          <div role="group" aria-label="Add a batch" className="mt-2 grid grid-cols-4 gap-1.5">
            {BATCHES.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => onBatch(b)}
                aria-label={`Add ${b} questions`}
                className={`tabular inline-flex h-8 items-center justify-center rounded-lg border text-[11px] font-bold transition ${tone.batch}`}
              >
                +{b}
              </button>
            ))}
          </div>
          <form onSubmit={onAdd} className="mt-2.5 flex items-center gap-1.5">
            <label htmlFor={inputId} className="sr-only">
              Number of questions
            </label>
            <input
              id={inputId}
              ref={inputRef}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_TOTAL}
              step={1}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Number"
              autoComplete="off"
              className={`tabular h-8 w-full min-w-0 rounded-lg border px-2 text-xs outline-none ${tone.input}`}
            />
            <button type="submit" disabled={!canAdd} className={`${ACTION} ${tone.primary}`} title={`Add this many questions (1 to ${MAX_ADD})`}>
              Add
            </button>
            <button type="button" disabled={!canSet} onClick={onSet} className={`${ACTION} ${tone.soft}`} title="Replace the total for this task">
              Set total
            </button>
          </form>
          <p role="status" aria-live="polite" className={`tabular mt-2 min-h-4 text-[11px] ${tone.muted}`}>
            {status}
          </p>
        </div>
      )}
    </span>
  );
}
