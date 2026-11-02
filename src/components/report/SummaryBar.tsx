import { memo, useMemo, type CSSProperties } from 'react';
import { questionSummary } from '../../lib/questions';
import { summaryMetrics } from '../../lib/stats';
import { MINUTE } from '../../lib/time';
import type { FocusSession, QuestionLog, Task } from '../../types';
import { hm } from './PeriodControls';
interface SummaryBarProps {
  sessions: FocusSession[];
  tasks: Task[];
  questionLogs: QuestionLog[];
  now: number;
}
type Kind = 'time' | 'task' | 'question';
/**
 * Semantic light per metric. Each family keeps one hue (focus time warm amber, tasks sky blue,
 * questions emerald) and the three scopes (total, week, today) take neighbouring tints, so the
 * row reads as one metric while each box stays distinct.
 */
interface Tint {
  value: string;
  marker: string;
  /** Coloured 1px top edge. */
  edge: string;
  /** RGB triplet for the inner radial glow in dark mode. */
  rgb: string;
}
const TINTS: Record<Kind, [Tint, Tint, Tint]> = {
  time: [
    { value: 'text-amber-600 dark:text-amber-300', marker: 'bg-amber-500 dark:bg-amber-300', edge: 'border-t-amber-400/70 dark:border-t-amber-300/60', rgb: '252,211,77' },
    { value: 'text-orange-600 dark:text-orange-300', marker: 'bg-orange-500 dark:bg-orange-300', edge: 'border-t-orange-400/70 dark:border-t-orange-300/55', rgb: '253,186,116' },
    { value: 'text-yellow-700 dark:text-yellow-200', marker: 'bg-yellow-500 dark:bg-yellow-200', edge: 'border-t-yellow-400/70 dark:border-t-yellow-200/55', rgb: '254,240,138' },
  ],
  task: [
    { value: 'text-sky-600 dark:text-sky-300', marker: 'bg-sky-500 dark:bg-sky-300', edge: 'border-t-sky-400/70 dark:border-t-sky-300/60', rgb: '125,211,252' },
    { value: 'text-blue-600 dark:text-blue-300', marker: 'bg-blue-500 dark:bg-blue-300', edge: 'border-t-blue-400/70 dark:border-t-blue-300/55', rgb: '147,197,253' },
    { value: 'text-cyan-700 dark:text-cyan-200', marker: 'bg-cyan-500 dark:bg-cyan-200', edge: 'border-t-cyan-400/70 dark:border-t-cyan-200/55', rgb: '165,243,252' },
  ],
  question: [
    { value: 'text-emerald-600 dark:text-emerald-300', marker: 'bg-emerald-500 dark:bg-emerald-300', edge: 'border-t-emerald-400/70 dark:border-t-emerald-300/60', rgb: '110,231,183' },
    { value: 'text-teal-600 dark:text-teal-300', marker: 'bg-teal-500 dark:bg-teal-300', edge: 'border-t-teal-400/70 dark:border-t-teal-300/55', rgb: '94,234,212' },
    { value: 'text-green-700 dark:text-green-200', marker: 'bg-green-500 dark:bg-green-200', edge: 'border-t-green-400/70 dark:border-t-green-200/55', rgb: '187,247,208' },
  ],
};
const glowStyle = (rgb: string): CSSProperties => ({
  background: `radial-gradient(120% 90% at 50% 0%, rgba(${rgb},0.16) 0%, rgba(${rgb},0.05) 45%, rgba(${rgb},0) 75%)`,
});
/** "51h 24m" or "0h 0m", with large numbers and small units. Same rounding as `hm`. */
function TimeValue({ ms }: { ms: number }) {
  const totalMin = Math.floor((Number.isFinite(ms) ? Math.max(0, ms) : 0) / MINUTE);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const unit = 'ml-0.5 text-sm font-semibold opacity-80';
  return (
    <span title={hm(ms)} className="whitespace-nowrap">
      <span>{h}</span>
      <span className={unit}>h</span>{' '}
      <span>{m}</span>
      <span className={unit}>m</span>
    </span>
  );
}
/**
 * The metric strip at the top of the Detailed Report: focus time, completed tasks and questions
 * practiced, each in total, this week and today. Reads 0h 0m and 0 on an empty database.
 * Three per row from small tablets up, two per row on phones (the last one spans the row).
 * Every box is a glass tile with a coloured top edge and, in dark mode, a soft inner glow.
 */
export const SummaryBar = memo(function SummaryBar({ sessions, tasks, questionLogs, now }: SummaryBarProps) {
  const m = useMemo(() => summaryMetrics(sessions, tasks, now), [sessions, tasks, now]);
  const q = useMemo(() => questionSummary(questionLogs, now), [questionLogs, now]);
  const items: { label: string; kind: Kind; scope: 0 | 1 | 2; value: number }[] = [
    { label: 'Total Focus Time', kind: 'time', scope: 0, value: m.totalMs },
    { label: 'Focus Time This Week', kind: 'time', scope: 1, value: m.weekMs },
    { label: 'Focus Time Today', kind: 'time', scope: 2, value: m.todayMs },
    { label: 'Total Completed Tasks', kind: 'task', scope: 0, value: m.totalCompleted },
    { label: 'Tasks Completed This Week', kind: 'task', scope: 1, value: m.weekCompleted },
    { label: 'Tasks Completed Today', kind: 'task', scope: 2, value: m.todayCompleted },
    { label: 'Total Questions Practiced', kind: 'question', scope: 0, value: q.total },
    { label: 'Questions Practiced This Week', kind: 'question', scope: 1, value: q.week },
    { label: 'Questions Practiced Today', kind: 'question', scope: 2, value: q.today },
  ];
  return (
    <section aria-label="Summary">
      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        {items.map((it, i) => {
          const tint = TINTS[it.kind][it.scope];
          return (
            <div
              key={it.label}
              className={`glass relative flex flex-col justify-between gap-2 overflow-hidden px-4 py-4 shadow-sm dark:shadow-none sm:px-5 ${tint.edge} ${
                i === items.length - 1 ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              <span aria-hidden className="pointer-events-none absolute inset-0 hidden dark:block" style={glowStyle(tint.rgb)} />
              <dt className="relative flex items-start gap-2 text-[11px] font-semibold leading-tight text-zinc-500 dark:text-zinc-400">
                <span className={`mt-px h-3 w-[3px] shrink-0 rounded-full ${tint.marker}`} aria-hidden />
                <span className="whitespace-normal break-normal">{it.label}</span>
              </dt>
              <dd className={`tabular relative text-2xl font-bold tracking-tight sm:text-[26px] ${tint.value}`}>
                {it.kind === 'time' ? <TimeValue ms={it.value} /> : Number.isFinite(it.value) ? it.value : 0}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
});
