import { ArrowRight, CalendarClock, Inbox, ListTodo } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { rescheduleUnfinished, setTomorrowFirstTask } from '../../db/repo';
import { useEveningReview, useSubjectMap, useTasks } from '../../hooks/useData';
import { formatDayShort } from '../../lib/format';
import { unfinishedDue, type RescheduleTarget } from '../../lib/review';
import { addDays } from '../../lib/time';
import { Dot } from '../ui/controls';
import { ReviewSection } from './ReviewSection';

/** Unfinished tasks and tomorrow's first task. Only shown for today. */
export function TomorrowSection({ today }: { today: string }) {
  const tasks = useTasks();
  const subjects = useSubjectMap();
  const review = useEveningReview(today);
  const selectId = useId();
  const [busy, setBusy] = useState(false);
  const [moved, setMoved] = useState<string | null>(null);

  const unfinished = useMemo(() => unfinishedDue(tasks, today), [tasks, today]);
  const openCurrent = useMemo(() => tasks.filter((t) => t.column === 'current'), [tasks]);
  const openPending = useMemo(() => tasks.filter((t) => t.column === 'pending'), [tasks]);

  const chosenId = review?.tomorrowFirstTaskId ?? null;
  const chosen = chosenId ? tasks.find((t) => t.id === chosenId && t.column !== 'completed') : undefined;

  const move = async (target: RescheduleTarget) => {
    setBusy(true);
    try {
      const n = await rescheduleUnfinished(today, target);
      setMoved(`Moved ${n} ${n === 1 ? 'task' : 'tasks'}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ReviewSection title="Tomorrow" description="Tidy what is left and pick where tomorrow starts.">
      <div className="space-y-5">
        <div>
          <h3 className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">Unfinished tasks</h3>
          {unfinished.length === 0 ? (
            <div className="glass flex items-center gap-2 p-3.5 text-sm text-zinc-600 dark:text-zinc-300">
              <Inbox size={16} strokeWidth={1.75} className="text-zinc-400 dark:text-zinc-500" />
              Nothing left from today.
            </div>
          ) : (
            <>
              <p className="muted mb-2 text-xs">
                <span className="tabular">{unfinished.length}</span> {unfinished.length === 1 ? 'task is' : 'tasks are'} still open from today or earlier.
              </p>
              <ul className="glass divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
                {unfinished.map((t) => {
                  const s = subjects.get(t.subjectId);
                  return (
                    <li key={t.id} className="flex items-start gap-2.5 px-3.5 py-2.5 text-sm text-zinc-700 dark:text-zinc-200">
                      <Dot color={s?.color ?? '#A1A1AA'} className="mt-1.5" />
                      <span className="min-w-0 flex-1 break-words whitespace-normal leading-relaxed">{t.title}</span>
                      {s && <span className="muted mt-1 hidden max-w-[40%] break-words text-right text-[11px] leading-snug sm:inline">{s.name}</span>}
                      {t.dueDate && <span className="muted tabular mt-1 shrink-0 text-[11px]">{t.dueDate === today ? 'Today' : formatDayShort(t.dueDate)}</span>}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn-soft" onClick={() => void move('tomorrow')} disabled={busy}>
                  <ArrowRight size={14} strokeWidth={1.75} />
                  Move to Tomorrow
                </button>
                <button type="button" className="btn-soft" onClick={() => void move('pending')} disabled={busy}>
                  <ListTodo size={14} strokeWidth={1.75} />
                  Move to Pending Topics
                </button>
              </div>
            </>
          )}
          {moved && (
            <p className="muted tabular mt-2 text-xs" role="status">
              {moved}
            </p>
          )}
        </div>

        <div className="border-t border-zinc-200/70 pt-4 dark:border-white/[0.06]">
          <label htmlFor={selectId} className="label">
            Set Tomorrow's First Task
          </label>
          <select
            id={selectId}
            className="field dark:border-white/[0.09] dark:border-t-white/[0.15] dark:bg-white/[0.04] [&_optgroup]:bg-white [&_option]:bg-white dark:[&_optgroup]:bg-[#1A1E29] dark:[&_option]:bg-[#1A1E29]"
            value={chosen?.id ?? ''}
            disabled={review === undefined}
            onChange={(e) => void setTomorrowFirstTask(today, e.target.value || null)}
          >
            <option value="">No task chosen</option>
            {openCurrent.length > 0 && (
              <optgroup label="Current Topics">
                {openCurrent.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
            )}
            {openPending.length > 0 && (
              <optgroup label="Pending Topics">
                {openPending.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <p className="muted mt-2 flex items-start gap-1.5 text-xs">
            <CalendarClock size={14} strokeWidth={1.75} className="mt-px shrink-0" />
            <span>
              {chosen ? (
                <>
                  Chosen: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{chosen.title}</span>.{' '}
                </>
              ) : null}
              It will be queued on the timer tomorrow morning.
            </span>
          </p>
          {openCurrent.length + openPending.length === 0 && <p className="muted mt-1 text-xs">Add a task to Current Topics or Pending Topics to choose one here.</p>}
        </div>
      </div>
    </ReviewSection>
  );
}

/** Read-only view of the first task chosen on an earlier evening. */
export function PastFirstTaskSection({ date }: { date: string }) {
  const tasks = useTasks();
  const review = useEveningReview(date);
  const chosenId = review?.tomorrowFirstTaskId ?? null;
  const chosen = chosenId ? tasks.find((t) => t.id === chosenId) : undefined;

  let body: string;
  if (review === undefined) body = 'Loading';
  else if (!chosenId) body = 'No first task was chosen that evening.';
  else if (!chosen) body = 'The chosen task has since been removed.';
  else body = chosen.title;

  return (
    <ReviewSection title="Next Day's First Task" description={`Chosen on this evening for ${formatDayShort(addDays(date, 1))}.`}>
      <div className="glass flex items-center gap-2.5 p-3.5 text-sm text-zinc-700 dark:text-zinc-200">
        <CalendarClock size={16} strokeWidth={1.75} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
        <span className={`min-w-0 flex-1 whitespace-normal break-words ${chosen ? 'font-medium' : 'muted'}`}>{body}</span>
        {chosen?.column === 'completed' && <span className="muted shrink-0 text-[11px]">Completed</span>}
      </div>
    </ReviewSection>
  );
}
