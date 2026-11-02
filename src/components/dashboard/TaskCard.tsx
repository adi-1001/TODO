import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AlarmClock, ArrowLeftRight, BookMarked, CalendarDays, Check, Ellipsis, Minus, Pencil, Play, Plus, Repeat, Timer, Trash2, Undo2 } from 'lucide-react';
import type { Chapter, Subject, Task, TaskKind } from '../../types';
import { taskKindMeta } from '../../lib/backlog';
import { addQuestions, completeTask, deleteTask, moveTask, reopenTask, setQuickRevision, setTaskQuestions, stepUnits, toggleSubtask } from '../../db/repo';
import { formatDayShort } from '../../lib/format';
import { QUICK_REVISION_LABELS } from '../../lib/quickRevision';
import { repeatLabel } from '../../lib/repeat';
import { GENERAL_COLOR } from '../../lib/stats';
import { targetLabel, targetProgress, usesQuestionCount } from '../../lib/target';
import { addDays, dayKey } from '../../lib/time';
import { formatTime12h } from '../../lib/timeFormat';
import type { SolarTone } from '../../lib/solarPhase';
import { useBackHandler } from '../../native/backButton';
import { useTimer } from '../../timer/TimerProvider';
import { useSolarVisual } from '../../timer/useSolarVisual';
import { Dot, PriorityPill, ProgressBar, Switch } from '../ui/controls';
import { QuestionCounter } from '../ui/QuestionCounter';

const VISIBLE_SUBTASKS = 4;

export interface TaskCardProps {
  task: Task;
  subject: Subject | undefined;
  chapter: Chapter | undefined;
  today: string;
  /** Counted focus ms logged against this task, including the live run. */
  loggedMs: number;
  /** Questions practiced on this task, from the question logs. */
  questions: number;
  /** The timer is set to this task. */
  inFocus: boolean;
  /** A run for this task is running or paused. */
  runActive: boolean;
  onStart: (taskId: string) => void;
  onEdit: (taskId: string) => void;
}

function dueLabel(due: string | null, today: string): string {
  if (!due) return 'No date';
  if (due === today) return 'Today';
  if (due === addDays(today, 1)) return 'Tomorrow';
  return formatDayShort(due);
}


function SubjectLabel({ task, subject }: { task: Task; subject: Subject | undefined }) {
  const name = subject ? subject.name : task.subjectId ? 'Archived subject' : 'General';
  return (
    <span className="inline-flex max-w-full items-start gap-1.5 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
      <Dot color={subject?.color ?? GENERAL_COLOR} className="mt-[3px] h-2 w-2 rounded-full" />
      <span className="min-w-0 break-words whitespace-normal leading-snug">{name}</span>
    </span>
  );
}

const KIND_TONE: Record<TaskKind, string> = {
  homework: 'bg-rose-500/10 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200',
  backlog: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200',
  lecture: 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200',
  revision: 'bg-emerald-500/10 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200',
};

/** The Task Category on a card, for example "Live Homework". */
function KindLabel({ kind }: { kind: TaskKind }) {
  const meta = taskKindMeta(kind);
  return (
    <span className={`max-w-full break-words whitespace-normal rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-snug ${KIND_TONE[kind]}`} title={meta.label}>
      {meta.short}
    </span>
  );
}

export const TaskCard = memo(function TaskCard(props: TaskCardProps) {
  return props.task.column === 'completed' ? <CompletedCard {...props} /> : <OpenCard {...props} />;
});

/** Ring colour per Solar Horizon tone. */
const TONE_COLOR: Record<SolarTone, string> = {
  sky: '#38BDF8',
  teal: '#2DD4BF',
  gold: '#EAB308',
  radiant: '#F59E0B',
  recovery: '#10B981',
};

/**
 * Border glow of the in-focus card, in the live timer's Solar Horizon tone. Only the in-focus
 * card renders this, so only it subscribes to the timer; useSolarVisual re-renders it when the
 * phase changes, not on every tick. The pulse is an opacity animation on this layer alone.
 */
function FocusPulseRing() {
  const { running } = useTimer();
  const { tone } = useSolarVisual();
  const color = TONE_COLOR[tone];
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute -inset-px rounded-2xl border ${running ? 'animate-glow-pulse' : 'opacity-60'}`}
      style={{ borderColor: `${color}B3`, boxShadow: `0 0 14px ${color}59, 0 0 2px ${color}80` }}
    />
  );
}

const STEP_BTN = 'icon-btn h-8 w-8 border border-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10';

/** The "Questions Practiced" control: minus, the count (tap to type), plus, and batch pills. */
function QuestionsControl({ task, count, caption }: { task: Task; count: number; caption?: string }) {
  const taskId = task.id;
  const goal = task.targetQuestions;
  const line = caption ?? (goal !== null ? `${Math.min(count, goal)} of ${goal} target Qs${count >= goal ? ', target reached' : ''}` : undefined);
  const onAdd = useCallback((delta: number) => addQuestions(taskId, delta), [taskId]);
  const onSetTotal = useCallback((total: number) => setTaskQuestions(taskId, total), [taskId]);

  return (
    // Wraps: on a narrow card the counter and its pills drop under the caption instead of squeezing it.
    <div className="mt-2 flex flex-wrap items-start justify-between gap-2 text-[11px]">
      <div className="min-w-[7rem] flex-1 pt-1.5">
        <div className="whitespace-normal break-normal font-semibold leading-snug text-zinc-700 dark:text-zinc-200">Questions Practiced</div>
        {line && (
          <div className="tabular whitespace-normal break-normal text-[10px] leading-snug text-zinc-500 dark:text-zinc-400" aria-live="polite">
            {line}
          </div>
        )}
      </div>
      <QuestionCounter count={count} onAdd={onAdd} onSetTotal={onSetTotal} label={`Questions practiced for ${task.title}`} className="ml-auto shrink-0" />
    </div>
  );
}

function TargetRow({ task, loggedMs, questions }: { task: Task; loggedMs: number; questions: number }) {
  const label = targetLabel(task, loggedMs, questions);
  const progress = targetProgress(task, loggedMs, questions);
  if (task.targetMode === 'pomodoro') {
    return (
      <>
        <div className="mt-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
            <Timer size={14} strokeWidth={1.75} className="shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden />
            <span className="tabular whitespace-normal break-normal leading-snug">{label}</span>
          </div>
          <ProgressBar value={progress} className="!h-1" barClassName="bg-peach-deep/80 dark:bg-amber-300/80" label={`Progress for ${task.title}`} />
        </div>
        <QuestionsControl task={task} count={questions} />
      </>
    );
  }
  if (task.targetMode === 'unit' && usesQuestionCount(task)) {
    // The question count is the unit progress, so this control replaces the unit stepper.
    return (
      <div className="mt-0.5 space-y-1.5">
        <QuestionsControl task={task} count={questions} caption={label} />
        <ProgressBar value={progress} className="!h-1" barClassName="bg-peach-deep/80 dark:bg-amber-300/80" label={`Progress for ${task.title}`} />
      </div>
    );
  }
  if (task.targetMode === 'unit') {
    return (
      <>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="tabular min-w-[7rem] flex-1 whitespace-normal break-normal font-semibold leading-snug text-zinc-700 dark:text-zinc-200" aria-live="polite">
            {label}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void stepUnits(task.id, -1)}
              disabled={task.unitDone <= 0}
              className={STEP_BTN}
              aria-label={`One fewer ${task.unitLabel} for ${task.title}`}
            >
              <Minus size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => void stepUnits(task.id, 1)}
              disabled={task.unitDone >= task.unitTarget}
              className={STEP_BTN}
              aria-label={`One more ${task.unitLabel} for ${task.title}`}
            >
              <Plus size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <QuestionsControl task={task} count={questions} />
      </>
    );
  }
  return (
    <>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-zinc-500 dark:text-zinc-400">Untimed</span>
        <button
          type="button"
          role="checkbox"
          aria-checked={false}
          onClick={() => void completeTask(task.id)}
          aria-label={`Mark "${task.title}" complete`}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-300 text-transparent transition hover:border-emerald-500 hover:text-emerald-600 dark:border-white/20 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
        >
          <Check size={14} strokeWidth={1.75} />
        </button>
      </div>
      <QuestionsControl task={task} count={questions} />
    </>
  );
}

function OpenCard({ task, subject, chapter, today, loggedMs, questions, inFocus, runActive, onStart, onEdit }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const subtasks = expanded ? task.subtasks : task.subtasks.slice(0, VISIBLE_SUBTASKS);
  const hidden = task.subtasks.length - VISIBLE_SUBTASKS;
  const isPending = task.column === 'pending';
  const repeats = task.repeat.kind !== 'never';

  return (
    <article
      className={`relative animate-rise-in rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-white/[0.07] dark:bg-[#171B24] ${
        menuOpen ? 'z-20' : ''
      }`}
    >
      {inFocus && <FocusPulseRing />}
      <div className={`mesh-${task.mesh} mb-2.5 flex min-h-[3.5rem] w-full items-center justify-between gap-2 rounded-xl px-3 py-1.5`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tabular inline-flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:bg-black/40 dark:text-zinc-300">
            <CalendarDays size={14} strokeWidth={1.75} aria-hidden />
            <span className="sr-only">Due</span>
            {dueLabel(task.dueDate, today)}
          </span>
          {inFocus && (
            <span className="whitespace-normal rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-300/15 dark:text-amber-200">In focus</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void completeTask(task.id)}
          aria-label={`Mark "${task.title}" complete`}
          title="Mark complete"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/80 text-zinc-500 transition hover:text-emerald-600 dark:bg-black/40 dark:text-zinc-300 dark:hover:text-emerald-300"
        >
          <Check size={15} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-[140px] flex-1 break-words whitespace-normal text-xs font-bold leading-relaxed text-zinc-900 dark:text-white">{task.title}</h3>
        <TaskMenu task={task} open={menuOpen} setOpen={setMenuOpen} onEdit={onEdit} />
      </div>
      {/* Chips get the full card width, so a long subject or chapter name wraps between words. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <SubjectLabel task={task} subject={subject} />
        {chapter && (
          <span className="inline-flex max-w-full items-start gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
            <BookMarked size={14} strokeWidth={1.75} className="shrink-0" aria-hidden />
            <span className="min-w-0 break-words whitespace-normal leading-snug">{chapter.title}</span>
          </span>
        )}
        {task.kind && <KindLabel kind={task.kind} />}
      </div>

      <TargetRow task={task} loggedMs={loggedMs} questions={questions} />

      {(repeats || task.reminderTime) && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          {repeats && (
            <span className="inline-flex items-center gap-1" title={repeatLabel(task.repeat)}>
              <Repeat size={14} strokeWidth={1.75} aria-hidden />
              <span className="sr-only">Repeats: {repeatLabel(task.repeat)}</span>
            </span>
          )}
          {task.reminderTime && (
            <span className="inline-flex items-center gap-1" title={`Reminder at ${formatTime12h(task.reminderTime)}`}>
              <AlarmClock size={14} strokeWidth={1.75} aria-hidden />
              <span className="sr-only">Reminder at</span>
              <span className="tabular">{formatTime12h(task.reminderTime)}</span>
            </span>
          )}
        </div>
      )}

      {task.subtasks.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {subtasks.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={s.done}
                onClick={() => void toggleSubtask(task.id, s.id)}
                className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left text-[11px] transition hover:bg-zinc-100 dark:hover:bg-white/[0.04]"
              >
                <span
                  aria-hidden
                  className={`mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                    s.done ? 'border-emerald-500 bg-emerald-500 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-zinc-950' : 'border-zinc-300 bg-white dark:border-white/20 dark:bg-transparent'
                  }`}
                >
                  {s.done && <Check size={14} strokeWidth={1.75} className="h-2.5 w-2.5" />}
                </span>
                <span className={`min-w-0 flex-1 break-words whitespace-normal ${s.done ? 'text-zinc-400 line-through dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-300'}`}>{s.label}</span>
              </button>
            </li>
          ))}
          {hidden > 0 && (
            <li>
              <button type="button" onClick={() => setExpanded((e) => !e)} className="px-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                {expanded ? 'Show less' : <span className="tabular">+{hidden} more</span>}
              </button>
            </li>
          )}
        </ul>
      )}

      {isPending && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-50 px-2.5 py-2 dark:bg-white/[0.03]">
          <div className="min-w-[7rem] flex-1">
            <div className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200">Quick Revision</div>
            <div className="whitespace-normal break-normal text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">{QUICK_REVISION_LABELS.join(', ')}</div>
          </div>
          <Switch size="sm" checked={task.quickRevision} onChange={(v) => void setQuickRevision(task.id, v)} label={`Quick Revision for ${task.title}`} />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-200/50 pt-2 dark:border-white/5">
        <button
          type="button"
          onClick={() => onStart(task.id)}
          disabled={runActive}
          title={runActive ? 'This task is already in focus' : undefined}
          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-bold text-zinc-700 transition hover:bg-amber-500/10 hover:text-amber-800 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent dark:text-zinc-300 dark:hover:bg-amber-400/10 dark:hover:text-amber-200"
        >
          <Play size={14} strokeWidth={1.75} aria-hidden />
          Start Focus
        </button>
        <PriorityPill priority={task.priority} />
      </div>
    </article>
  );
}

function CompletedCard({ task, subject, today, questions }: TaskCardProps) {
  const [confirming, setConfirming] = useState(false);
  const doneDay = task.completedAt !== null ? dayKey(task.completedAt) : null;
  const doneLabel = doneDay === null ? '' : doneDay === today ? 'Today' : formatDayShort(doneDay);
  const name = subject ? subject.name : task.subjectId ? 'Archived subject' : 'General';

  return (
    <article className="animate-rise-in rounded-2xl border border-zinc-200/80 bg-white p-2.5 dark:border-white/[0.07] dark:bg-[#171B24]">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={`mesh-${task.mesh} flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-emerald-600 dark:text-emerald-300`} aria-hidden>
          <Check size={16} strokeWidth={1.75} />
        </span>
        <div className="min-w-[140px] flex-1">
          <div className="break-words whitespace-normal text-xs font-semibold leading-relaxed text-zinc-700 dark:text-zinc-200">{task.title}</div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <Dot color={subject?.color ?? GENERAL_COLOR} className="h-2 w-2 rounded-full" />
            <span className="min-w-0 break-words whitespace-normal leading-snug">{name}</span>
            {doneLabel && <span className="tabular shrink-0">{doneLabel}</span>}
            {questions > 0 && <span className="tabular shrink-0">{questions === 1 ? '1 question' : `${questions} questions`}</span>}
          </div>
        </div>
        {!confirming && (
          <div className="ml-auto flex shrink-0 items-center">
            <button type="button" onClick={() => void reopenTask(task.id)} className="icon-btn h-7 w-7" aria-label={`Move "${task.title}" back`} title="Move back">
              <Undo2 size={14} strokeWidth={1.75} />
            </button>
            <button type="button" onClick={() => setConfirming(true)} className="icon-btn h-7 w-7" aria-label={`Delete "${task.title}"`} title="Delete">
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
      {confirming && <DeleteConfirm onConfirm={() => void deleteTask(task.id)} onCancel={() => setConfirming(false)} />}
    </article>
  );
}

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-[11px] dark:bg-white/[0.05]">
      <span className="text-zinc-600 dark:text-zinc-300">Delete this task?</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onCancel} className="rounded-md px-2 py-1 font-semibold text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-white/10">
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className="rounded-md bg-zinc-900 px-2 py-1 font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white">
          Delete
        </button>
      </div>
    </div>
  );
}

function TaskMenu({ task, open, setOpen, onEdit }: { task: Task; open: boolean; setOpen: (v: boolean) => void; onEdit: (taskId: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const target = task.category === 'current' ? 'pending' : 'current';
  useBackHandler(open, () => setOpen(false));

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      return;
    }
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  const itemClass =
    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]';

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for "${task.title}"`}
        className="icon-btn h-7 w-7"
      >
        <Ellipsis size={16} strokeWidth={1.75} />
      </button>
      {open && (
        <div role="menu" className="card-plain absolute right-0 top-full z-30 mt-1 w-56 p-1.5 shadow-lg">
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              onEdit(task.id);
            }}
          >
            <Pencil size={14} strokeWidth={1.75} aria-hidden />
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              void moveTask(task.id, target);
            }}
          >
            <ArrowLeftRight size={14} strokeWidth={1.75} aria-hidden />
            {target === 'pending' ? 'Move to Pending Topics' : 'Move to Current Topics'}
          </button>

          <div className="my-1 border-t border-zinc-100 dark:border-white/[0.07]" />

          {confirming ? (
            <DeleteConfirm
              onConfirm={() => {
                setOpen(false);
                void deleteTask(task.id);
              }}
              onCancel={() => setConfirming(false)}
            />
          ) : (
            <button type="button" role="menuitem" className={itemClass} onClick={() => setConfirming(true)}>
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
