import { Check, ChevronDown, Search } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useChapterMap, useSubjectMap, useTasks } from '../../hooks/useData';
import { useBackHandler } from '../../native/backButton';
import { useTimer } from '../../timer/TimerProvider';
import type { Chapter, Subject, Task } from '../../types';
import { Dot } from './controls';

export type TaskPickerVariant = 'pill' | 'bar' | 'clock' | 'mini';

export interface TaskPickerProps {
  /**
   * `pill`: compact trigger. `bar`: full-width selector row for the dashboard timer bar (the
   * caller sets its width). `clock`: large title for the Full-Screen Clock. `mini`: small trigger
   * for the Mini Timer.
   */
  variant?: TaskPickerVariant;
  /** Horizontal alignment of the list against the trigger. The list is also kept inside the window. */
  align?: 'start' | 'center' | 'end';
  /** Which side of the trigger the list opens on. `auto` opens upward when there is more room above. */
  side?: 'below' | 'above' | 'auto';
  /** Extra classes for the outer wrapper, for example a max width. */
  className?: string;
  /** Called when the list opens or closes, for example to keep the clock controls visible. */
  onOpenChange?: (open: boolean) => void;
}

export const GENERAL_FOCUS_LABEL = 'General Focus (No Task)';

/** Largest list height in px (22rem); smaller when the window has less room. */
const PANEL_MAX_PX = 352;
const EDGE_PX = 8;
const GAP_PX = 8;

interface Group {
  key: string;
  name: string;
  color: string | null;
  tasks: Task[];
}

function kindLabel(task: Task): string {
  if (task.quickRevision) return 'Quick Revision';
  return task.category === 'current' ? 'Current Topic' : 'Pending Topic';
}

function groupTasks(tasks: Task[], subjects: Map<string, Subject>, chapters: Map<string, Chapter>, query: string): Group[] {
  const q = query.trim().toLowerCase();
  const open = tasks
    .filter((t) => t.column !== 'completed')
    .filter((t) => {
      if (!q) return true;
      const subject = subjects.get(t.subjectId)?.name ?? '';
      const chapter = t.chapterId ? (chapters.get(t.chapterId)?.title ?? '') : '';
      return t.title.toLowerCase().includes(q) || subject.toLowerCase().includes(q) || chapter.toLowerCase().includes(q);
    })
    // Current topics first, then pending, each in creation order.
    .sort((a, b) => (a.column === b.column ? a.createdAt - b.createdAt : a.column === 'current' ? -1 : 1));

  const bySubject = new Map<string, Task[]>();
  const other: Task[] = [];
  for (const t of open) {
    if (!subjects.has(t.subjectId)) {
      other.push(t);
      continue;
    }
    const list = bySubject.get(t.subjectId);
    if (list) list.push(t);
    else bySubject.set(t.subjectId, [t]);
  }
  const groups: Group[] = [];
  for (const s of subjects.values()) {
    const list = bySubject.get(s.id);
    if (list) groups.push({ key: s.id, name: s.name, color: s.color, tasks: list });
  }
  if (other.length) groups.push({ key: 'other', name: 'Other', color: null, tasks: other });
  return groups;
}

interface Tone {
  panel: string;
  input: string;
  heading: string;
  option: string;
  optionOn: string;
  second: string;
  note: string;
  empty: string;
}

const LIGHT_DARK: Tone = {
  panel: 'border-zinc-200 bg-white text-zinc-900 dark:border-white/10 dark:bg-[#161922] dark:text-zinc-100',
  input:
    'border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-white/25',
  heading: 'text-zinc-400 dark:text-zinc-500',
  option: 'text-zinc-700 hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]',
  optionOn: 'bg-zinc-100 text-zinc-900 dark:bg-white/[0.08] dark:text-white',
  second: 'text-zinc-400 dark:text-zinc-500',
  note: 'text-zinc-500 dark:text-zinc-400',
  empty: 'text-zinc-400 dark:text-zinc-500',
};

/** The Mini Timer is dark in both themes, so its list matches it. */
const MINI: Tone = {
  panel: 'border-white/10 bg-zinc-800 text-white dark:border-white/10 dark:bg-zinc-800 dark:text-white',
  input:
    'border-white/10 bg-zinc-900 text-white placeholder:text-zinc-500 focus:border-amber-300/50 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-amber-300/50',
  heading: 'text-zinc-400 dark:text-zinc-400',
  option: 'text-zinc-200 hover:bg-white/10 focus-visible:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/10 dark:focus-visible:bg-white/10',
  optionOn: 'bg-white/[0.12] text-white dark:bg-white/[0.12] dark:text-white',
  second: 'text-zinc-400 dark:text-zinc-400',
  note: 'text-zinc-400 dark:text-zinc-400',
  empty: 'text-zinc-500 dark:text-zinc-500',
};

const ALIGN_CLASS: Record<NonNullable<TaskPickerProps['align']>, string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
};

interface Placement {
  up: boolean;
  maxHeight: number;
  shift: number;
}

/**
 * Task selector for the timer. Shows the current task and opens a searchable list of open
 * tasks grouped by subject, plus General Focus. The list stays inside the picker's own element
 * and listens on the trigger's document, so it also works inside the Mini Timer's
 * Picture-in-Picture window.
 */
export function TaskPicker({ variant = 'pill', align = 'start', side = 'below', className = '', onOpenChange }: TaskPickerProps) {
  const { activeTask, setTask, state } = useTimer();
  const tasks = useTasks();
  const subjects = useSubjectMap();
  const chapters = useChapterMap();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<Placement>({ up: side === 'above', maxHeight: PANEL_MAX_PX, shift: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shiftRef = useRef(0);
  shiftRef.current = place.shift;
  const panelId = useId();
  const tone = variant === 'mini' ? MINI : LIGHT_DARK;
  const currentId = activeTask?.id ?? null;
  const focusRun = state.status !== 'idle' && state.phase === 'focus';

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

  const groups = useMemo(() => (open ? groupTasks(tasks, subjects, chapters, query) : []), [open, tasks, subjects, chapters, query]);
  const hasOpenTasks = useMemo(() => open && tasks.some((t) => t.column !== 'completed'), [open, tasks]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Android Back closes the list before anything behind it.
  useBackHandler(open, () => close(false));

  const choose = (taskId: string | null) => {
    if (taskId !== currentId) setTask(taskId);
    close(true);
  };

  // Place the list before it paints: pick the side with room, cap its height, keep it on screen.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    const win = trigger?.ownerDocument.defaultView;
    if (!trigger || !panel || !win) return;
    const rect = trigger.getBoundingClientRect();
    const below = win.innerHeight - rect.bottom - GAP_PX - EDGE_PX;
    const above = rect.top - GAP_PX - EDGE_PX;
    const up = side === 'above' || (side === 'auto' && below < PANEL_MAX_PX && above > below);
    const room = up ? above : below;
    const maxHeight = Math.max(160, Math.min(PANEL_MAX_PX, Math.floor(room)));
    // Measure without the shift applied the last time the list was open.
    const box = panel.getBoundingClientRect();
    const left = box.left - shiftRef.current;
    const right = box.right - shiftRef.current;
    let shift = 0;
    if (right > win.innerWidth - EDGE_PX) shift = win.innerWidth - EDGE_PX - right;
    if (left + shift < EDGE_PX) shift = EDGE_PX - left;
    setPlace({ up, maxHeight, shift: Math.round(shift) });
  }, [open, side]);

  // Focus the search on devices with a mouse; on touch screens the keyboard would cover the list.
  useEffect(() => {
    if (!open) return;
    const win = triggerRef.current?.ownerDocument.defaultView;
    if (win?.matchMedia?.('(pointer: fine)').matches) inputRef.current?.focus();
  }, [open]);

  // Close on pointer-down outside and on Escape, in the document that holds the trigger.
  useEffect(() => {
    if (!open) return;
    const doc = triggerRef.current?.ownerDocument;
    if (!doc) return;
    const onDown = (e: PointerEvent) => {
      const wrap = wrapRef.current;
      if (wrap && e.target && !wrap.contains(e.target as Node)) close(false);
    };
    // Capture phase, so Escape closes only the list and not the clock behind it.
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

  const options = () => Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-task-option]') ?? []);

  const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = options();
    if (!list.length) return;
    e.preventDefault();
    const at = list.findIndex((el) => el === e.currentTarget.ownerDocument.activeElement);
    if (e.key === 'ArrowDown') list[at < 0 ? 0 : Math.min(list.length - 1, at + 1)].focus();
    else if (at <= 0) inputRef.current?.focus();
    else list[at - 1].focus();
  };

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = groups[0]?.tasks[0];
    if (query.trim() && first) choose(first.id);
  };

  const title = activeTask?.title ?? GENERAL_FOCUS_LABEL;
  const triggerLabel = `Task: ${title}. Change task`;
  const subject = activeTask ? subjects.get(activeTask.subjectId) : undefined;

  // The bar takes its width and minimum width from the caller.
  const wrapClass = variant === 'clock' ? 'relative flex max-w-3xl flex-col items-center' : variant === 'bar' ? 'relative flex' : 'relative flex min-w-0';

  return (
    <div ref={wrapRef} className={`${wrapClass} ${className}`}>
      {variant === 'clock' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? close(false) : setOpen(true))}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={triggerLabel}
          className="flex max-w-full flex-col items-center rounded-2xl px-4 py-2 text-center transition hover:bg-zinc-100 short:px-3 short:py-1 dark:hover:bg-white/[0.05]"
        >
          <span className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-zinc-400 short:mb-0.5 short:text-[10px] dark:text-zinc-500">
            {activeTask ? (
              <>
                {subject && (
                  <>
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: subject.color }} aria-hidden />
                    <span>{subject.name}</span>
                    <span aria-hidden>/</span>
                  </>
                )}
                <span>{kindLabel(activeTask)}</span>
              </>
            ) : (
              <span>Choose a task</span>
            )}
          </span>
          <span className="flex max-w-full items-center gap-2">
            {/* The clock's title row is the full screen width, so this wraps at spaces; a single over-long word may break. */}
            <span className={`min-w-0 whitespace-normal break-words text-xl font-semibold tracking-tight sm:text-2xl short:text-lg ${activeTask ? 'text-zinc-800 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500'}`}>{title}</span>
            <ChevronDown size={18} strokeWidth={1.75} className={`shrink-0 text-zinc-400 transition-transform dark:text-zinc-500 ${open ? 'rotate-180' : ''}`} aria-hidden />
          </span>
        </button>
      ) : variant === 'bar' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? close(false) : setOpen(true))}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={triggerLabel}
          title={title}
          className="flex min-h-9 w-full items-center justify-between gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-left transition hover:bg-zinc-200/70 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {subject && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: subject.color }} title={subject.name} aria-hidden />}
            {/* The row is at least 140 px wide, so ordinary words always fit and lines break at spaces. */}
            <span
              className={`min-w-0 flex-1 whitespace-normal break-words text-[13px] leading-snug ${activeTask ? 'font-semibold text-zinc-800 dark:text-zinc-100' : 'font-medium text-zinc-500 dark:text-zinc-400'}`}
            >
              {title}
            </span>
          </span>
          <ChevronDown size={16} strokeWidth={1.75} className={`shrink-0 text-zinc-400 transition-transform dark:text-zinc-500 ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? close(false) : setOpen(true))}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={triggerLabel}
          title={title}
          className={
            variant === 'mini'
              ? 'inline-flex min-h-8 min-w-0 max-w-full items-center gap-1 rounded-lg px-1.5 py-1 text-left text-[11px] font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white'
              : 'inline-flex min-h-8 min-w-0 max-w-full items-center gap-1 rounded-lg px-1.5 py-1 text-left text-[11px] font-semibold text-zinc-600 transition hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/[0.07] dark:hover:text-white'
          }
        >
          {/* No min-w-0: the title may wrap at spaces but never narrower than its longest word. */}
          <span className={`whitespace-normal break-normal leading-snug ${activeTask ? '' : 'font-medium opacity-80'}`}>{title}</span>
          <ChevronDown size={14} strokeWidth={1.75} className={`shrink-0 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Choose a task"
          onKeyDown={onPanelKey}
          className={`absolute z-40 flex w-[min(92dvw,22rem)] animate-fade-in flex-col rounded-2xl border p-2 text-left shadow-xl ${tone.panel} ${ALIGN_CLASS[align]} ${
            place.up ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
          style={{ maxHeight: place.maxHeight, translate: place.shift ? `${place.shift}px 0` : undefined }}
        >
          <label className="relative block shrink-0">
            <span className="sr-only">Search tasks</span>
            <Search size={14} strokeWidth={1.75} className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 ${tone.second}`} aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Search tasks, subjects, chapters"
              autoComplete="off"
              className={`h-9 w-full rounded-xl border pl-8 pr-2.5 text-xs outline-none ${tone.input}`}
            />
          </label>
          {focusRun && <p className={`shrink-0 px-2.5 pt-2 text-[11px] ${tone.note}`}>Time so far is saved to the current task before switching.</p>}

          <div className="custom-scroll mt-1.5 min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <OptionRow label={GENERAL_FOCUS_LABEL} selected={currentId === null} tone={tone} onSelect={() => choose(null)} />
            {groups.map((g) => (
              <div key={g.key} role="group" aria-label={g.name} className="mt-1">
                <div className={`flex items-start gap-1.5 px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest ${tone.heading}`}>
                  {g.color && <Dot color={g.color} className="mt-[3px] h-2 w-2" />}
                  <span className="min-w-0 break-words whitespace-normal leading-snug">{g.name}</span>
                </div>
                {g.tasks.map((t) => (
                  <OptionRow
                    key={t.id}
                    label={t.title}
                    second={t.chapterId ? chapters.get(t.chapterId)?.title : undefined}
                    selected={t.id === currentId}
                    tone={tone}
                    onSelect={() => choose(t.id)}
                  />
                ))}
              </div>
            ))}
            {groups.length === 0 && (
              <p className={`px-2.5 py-3 text-xs ${tone.empty}`}>{query.trim() && hasOpenTasks ? 'No open tasks match this search.' : 'No open tasks yet.'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OptionRow({ label, second, selected, tone, onSelect }: { label: string; second?: string; selected: boolean; tone: Tone; onSelect: () => void }) {
  return (
    <button
      type="button"
      data-task-option=""
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs outline-none transition ${selected ? tone.optionOn : tone.option}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block break-words whitespace-normal font-medium leading-relaxed">{label}</span>
        {second && <span className={`mt-0.5 block break-words whitespace-normal text-[10px] leading-snug ${tone.second}`}>{second}</span>}
      </span>
      {selected && <Check size={14} strokeWidth={1.75} className="shrink-0" aria-hidden />}
    </button>
  );
}
