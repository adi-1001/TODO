import { useCallback, useMemo, useRef, useState } from 'react';
import { CheckCheck, Layers, Plus } from 'lucide-react';
import type { Category, Column, Priority, Task } from '../../types';
import { useChapterMap, useQuestionsByTask, useSubjectMap, useTasks } from '../../hooks/useData';
import { useLiveSessions } from '../../hooks/useLiveSessions';
import { useToday } from '../../hooks/useNow';
import { categorySplit, focusMsByTask, largestRemainderPercent } from '../../lib/stats';
import { dayEnd, dayStart } from '../../lib/time';
import { useUI } from '../../state/UIProvider';
import { useTimer } from '../../timer/TimerProvider';
import { EmptyState } from '../ui/controls';
import { TaskCard } from './TaskCard';

const COMPLETED_PREVIEW = 5;

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, 'high-yield': 1, normal: 2 };

function byPriorityThenDue(a: Task, b: Task): number {
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (p !== 0) return p;
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.createdAt - b.createdAt;
}

interface ColumnDef {
  key: Column;
  label: string;
  share?: string;
  dot: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'current', label: 'Current Topics', share: 'about 70%', dot: 'bg-rose-400 dark:bg-rose-300 dark:shadow-[0_0_8px_rgba(253,164,175,0.7)]' },
  { key: 'pending', label: 'Pending Topics', share: 'about 30%', dot: 'bg-amber-400 dark:bg-amber-300 dark:shadow-[0_0_8px_rgba(252,211,77,0.7)]' },
  { key: 'completed', label: 'Completed', dot: 'bg-emerald-500 dark:bg-emerald-400 dark:shadow-[0_0_8px_rgba(52,211,153,0.7)]' },
];

export function StudyBoard() {
  const today = useToday();
  const tasks = useTasks();
  const subjects = useSubjectMap();
  const chapters = useChapterMap();
  const sessions = useLiveSessions();
  const questionsByTask = useQuestionsByTask();
  const timer = useTimer();
  const { openTask } = useUI();
  const [showAllDone, setShowAllDone] = useState(false);

  const loggedByTask = useMemo(() => focusMsByTask(sessions), [sessions]);
  const split = useMemo(() => categorySplit(sessions, dayStart(today), dayEnd(today)), [sessions, today]);
  const currentMs = split.current + split.other;
  const [currentPct, pendingPct] = largestRemainderPercent([currentMs, split.pending]);
  const hasFocus = currentMs + split.pending > 0;

  const grouped = useMemo(() => {
    const current = tasks.filter((t) => t.column === 'current').sort(byPriorityThenDue);
    const pending = tasks.filter((t) => t.column === 'pending').sort(byPriorityThenDue);
    const completed = tasks.filter((t) => t.column === 'completed').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return { current, pending, completed };
  }, [tasks]);

  // Stable callbacks through refs, so memoized cards do not re-render when the UI state changes.
  const live = useRef({ start: timer.start, openTask });
  live.current = { start: timer.start, openTask };
  const onStart = useCallback((taskId: string) => live.current.start({ taskId }), []);
  const onEdit = useCallback((taskId: string) => live.current.openTask({ taskId }), []);

  const focusTaskId = timer.state.taskId;
  const runActive = timer.state.status !== 'idle';

  return (
    <>
      <section className="space-y-3" aria-labelledby="study-board-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 id="study-board-title" className="section-title">
              Study Board
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {hasFocus ? (
                <>
                  Today: <span className="tabular">{currentPct}%</span> current, <span className="tabular">{pendingPct}%</span> pending
                </>
              ) : (
                'Today: no focus logged yet'
              )}
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-600" aria-hidden>
                /
              </span>
              Aim: about <span className="tabular">70 / 30</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => openTask()}
            className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-500/25 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/20"
          >
            <Plus size={14} strokeWidth={1.75} aria-hidden />
            New Task
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="space-y-3">
            <EmptyState icon={<Layers size={18} strokeWidth={1.75} />} title="Your study board is empty. Add your first task to begin." hint="Tasks you add appear in Current Topics or Pending Topics." />
            <div className="flex justify-center">
              <button type="button" onClick={() => openTask()} className="btn-primary">
                <Plus size={14} strokeWidth={1.75} aria-hidden />
                New Task
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {COLUMNS.map((col) => {
              const all = grouped[col.key];
              const isDone = col.key === 'completed';
              const list = isDone && !showAllDone ? all.slice(0, COMPLETED_PREVIEW) : all;
              return (
                <div key={col.key} className="min-w-0 space-y-3">
                  <div className="glass flex items-center justify-between gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-xs shadow-sm dark:shadow-[0_6px_18px_rgba(0,0,0,0.22)]">
                    <span className="flex min-w-[7rem] flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${col.dot}`} />
                      <h3 className="whitespace-normal break-normal font-bold leading-snug text-zinc-800 dark:text-zinc-200">{col.label}</h3>
                      {col.share && <span className="whitespace-nowrap text-[11px] text-zinc-500 dark:text-zinc-400">{col.share}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="tabular rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-zinc-600 dark:bg-white/[0.07] dark:text-zinc-300">{all.length}</span>
                      {!isDone ? (
                        <button
                          type="button"
                          onClick={() => openTask({ category: col.key as Category })}
                          className="icon-btn h-6 w-6"
                          aria-label={`Add to ${col.label}`}
                          title={`Add to ${col.label}`}
                        >
                          <Plus size={14} strokeWidth={1.75} />
                        </button>
                      ) : (
                        <span className="w-0.5" />
                      )}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <>
                      {list.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          subject={subjects.get(task.subjectId)}
                          chapter={task.chapterId ? chapters.get(task.chapterId) : undefined}
                          today={today}
                          loggedMs={loggedByTask.get(task.id) ?? 0}
                          questions={questionsByTask.get(task.id) ?? 0}
                          inFocus={focusTaskId === task.id}
                          runActive={runActive && focusTaskId === task.id}
                          onStart={onStart}
                          onEdit={onEdit}
                        />
                      ))}
                    </>
                    {all.length === 0 &&
                      (isDone ? (
                        <EmptyState icon={<CheckCheck size={18} strokeWidth={1.75} />} title="Nothing completed yet" hint="Finished tasks collect here." />
                      ) : (
                        <EmptyState icon={<Layers size={18} strokeWidth={1.75} />} title={`No ${col.label} yet`} hint="Use the + button to add one." />
                      ))}
                    {isDone && all.length > COMPLETED_PREVIEW && (
                      <button type="button" onClick={() => setShowAllDone((v) => !v)} className="btn-ghost w-full py-1.5" aria-expanded={showAllDone}>
                        {showAllDone ? (
                          'Show less'
                        ) : (
                          <>
                            Show all <span className="tabular">({all.length})</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
