import { ChevronLeft, ChevronRight, Info, Target } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { updateSettings } from '../../db/repo';
import { formatDayShort, formatMonthTitle, formatShort } from '../../lib/format';
import { focusByDay, monthGoalStats, type MonthDay } from '../../lib/stats';
import { MINUTE, addMonths, dayStart, monthStartKey } from '../../lib/time';
import type { FocusSession, UserSettings } from '../../types';
import { REPORT_CARD } from './PeriodControls';

interface GoalCalendarProps {
  sessions: FocusSession[];
  settings: UserSettings;
  today: string;
  restDays: Set<string>;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GOAL_OPTIONS = Array.from({ length: 19 }, (_, i) => 60 + i * 30); // 1h to 10h

function goalLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Focus Time Goal: month calendar with a progress ring toward the daily goal around every date. */
export const GoalCalendar = memo(function GoalCalendar({ sessions, settings, today, restDays }: GoalCalendarProps) {
  const [month, setMonth] = useState(() => monthStartKey(today));
  const goalMinutes = settings.dailyGoalMinutes;
  const goalMs = goalMinutes * MINUTE;

  const byDay = useMemo(() => focusByDay(sessions), [sessions]);
  const stats = useMemo(() => monthGoalStats(byDay, month, goalMs, today), [byDay, month, goalMs, today]);

  const canGoNext = addMonths(month, 1) <= today;
  const leading = (new Date(dayStart(month)).getDay() + 6) % 7;
  const options = GOAL_OPTIONS.includes(goalMinutes) ? GOAL_OPTIONS : [...GOAL_OPTIONS, goalMinutes].sort((a, b) => a - b);

  const summary = [
    { label: 'Focus Days', value: String(stats.focusDays) },
    { label: 'Completed Goal Days', value: String(stats.completedGoalDays) },
    { label: 'Goal Completion Rate', value: `${stats.completionRate}%` },
  ];

  return (
    <section className={`${REPORT_CARD} flex flex-col gap-4`} aria-labelledby="report-goal-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="report-goal-title" className="section-title">
          Focus Time Goal
        </h2>
        <label className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
          <Target size={14} strokeWidth={1.75} className="text-amber-600 dark:text-amber-300" aria-hidden />
          Goal:
          <select
            value={goalMinutes}
            onChange={(e) => void updateSettings({ dailyGoalMinutes: Number(e.target.value) })}
            className="tabular cursor-pointer rounded-lg border-0 bg-transparent py-0.5 pl-1 pr-6 text-xs font-bold text-zinc-900 focus:ring-0 dark:text-white [&>option]:bg-white dark:[&>option]:bg-[#1A1E29]"
            aria-label="Daily focus goal"
          >
            {options.map((m) => (
              <option key={m} value={m}>
                {goalLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="button" className="icon-btn" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
          <ChevronLeft size={16} strokeWidth={1.75} />
        </button>
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100" aria-live="polite">
          {formatMonthTitle(month)}
        </span>
        <button
          type="button"
          className="icon-btn disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          onClick={() => canGoNext && setMonth((m) => addMonths(m, 1))}
          disabled={!canGoNext}
          aria-label="Next month"
        >
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {summary.map((s) => (
          <div key={s.label} className="glass rounded-xl px-2.5 py-2">
            <dt className="whitespace-normal break-normal text-[10px] font-semibold leading-tight text-zinc-500 dark:text-zinc-400">{s.label}</dt>
            <dd className="tabular mt-0.5 text-lg font-bold text-amber-600 dark:text-amber-300">{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted -mt-1 flex items-start gap-1.5 text-[11px] leading-snug">
        <Info size={13} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />
        Goal Completion Rate is the number of days the goal was reached divided by the days of this month so far.
      </p>

      <div>
        <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden>
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              {w}
            </div>
          ))}
        </div>
        <ol className="grid grid-cols-7 gap-1" aria-label={`${formatMonthTitle(month)}, focus time per day`}>
          {Array.from({ length: leading }, (_, i) => (
            <li key={`blank-${i}`} aria-hidden />
          ))}
          {stats.days.map((d) => (
            <DayCell key={d.day} d={d} isToday={d.day === today} isRest={restDays.has(d.day)} goalMs={goalMs} />
          ))}
        </ol>
      </div>
      {stats.focusDays === 0 && (
        <p className="muted flex items-center justify-center gap-1.5 text-center text-[11px]">
          <Target size={13} strokeWidth={1.75} className="shrink-0" aria-hidden />
          No focus logged this month yet. Each ring fills as you get closer to {goalLabel(goalMinutes)}.
        </p>
      )}
    </section>
  );
});

const RING_R = 16;
const RING_C = 2 * Math.PI * RING_R;

type DayState = 'future' | 'gold' | 'partial' | 'rest' | 'empty';

/**
 * Ring colours per day state. A reached goal shines Golden Hour gold, a partial day glows warm
 * amber, a rest day stays calm ice blue. The ring arc length is static (no dash animation).
 */
const RING: Record<Exclude<DayState, 'future'>, { track: string; arc: string; fill: string; num: string }> = {
  gold: {
    track: 'stroke-amber-200 dark:stroke-amber-300/25',
    arc: 'stroke-amber-500 dark:stroke-amber-300',
    fill: 'fill-amber-300/30 dark:fill-amber-300/20',
    num: 'font-bold text-amber-800 dark:text-amber-100',
  },
  partial: {
    track: 'stroke-amber-100 dark:stroke-white/10',
    arc: 'stroke-amber-400 dark:stroke-amber-400/80',
    fill: 'fill-amber-200/20 dark:fill-amber-400/[0.07]',
    num: 'font-semibold text-amber-700 dark:text-amber-200',
  },
  rest: {
    track: 'stroke-sky-200 dark:stroke-sky-300/30',
    arc: 'stroke-sky-400 dark:stroke-sky-300/70',
    fill: 'fill-sky-100/70 dark:fill-sky-300/[0.08]',
    num: 'font-medium text-sky-700 dark:text-sky-200',
  },
  empty: {
    track: 'stroke-zinc-200 dark:stroke-white/10',
    arc: 'stroke-amber-400 dark:stroke-amber-300',
    fill: 'fill-transparent',
    num: 'font-medium text-zinc-600 dark:text-zinc-300',
  },
};

function DayCell({ d, isToday, isRest, goalMs }: { d: MonthDay; isToday: boolean; isRest: boolean; goalMs: number }) {
  const num = Number(d.day.slice(8));
  const title = d.isFuture
    ? formatDayShort(d.day)
    : `${formatDayShort(d.day)}: ${formatShort(d.ms)} of ${formatShort(goalMs)}${d.goalMet ? ', goal reached' : ''}${isRest ? ', rest day' : ''}`;

  const state: DayState = d.isFuture ? 'future' : d.goalMet ? 'gold' : d.ratio > 0 ? 'partial' : isRest ? 'rest' : 'empty';
  const ring = state === 'future' ? null : RING[state];
  const numClass = !ring ? 'text-zinc-300 dark:text-zinc-600' : isToday ? `${ring.num} font-extrabold` : ring.num;

  return (
    <li title={title} className="relative mx-auto aspect-square w-full max-w-[46px]">
      {isToday && <span className="sr-only">Today</span>}
      {d.isFuture && <span className="sr-only">{title}</span>}
      {/* Static halo behind a reached goal: a box-shadow glow, no filter. */}
      {state === 'gold' && (
        <span
          aria-hidden
          className="absolute inset-[7%] rounded-full shadow-[0_0_10px_rgba(245,158,11,0.35)] dark:shadow-[0_0_16px_rgba(252,211,77,0.38)]"
        />
      )}
      {state === 'partial' && <span aria-hidden className="absolute inset-[7%] hidden rounded-full shadow-[0_0_10px_rgba(251,191,36,0.14)] dark:block" />}
      {ring && (
        <svg viewBox="0 0 40 40" width="100%" height="100%" className="absolute inset-0" role="img" aria-label={title}>
          <title>{title}</title>
          <circle cx={20} cy={20} r={RING_R} className={ring.fill} />
          <circle cx={20} cy={20} r={RING_R} fill="none" strokeWidth={3} className={ring.track} />
          {d.ratio > 0 && (
            <circle
              cx={20}
              cy={20}
              r={RING_R}
              fill="none"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={`${(d.goalMet ? 1 : d.ratio) * RING_C} ${RING_C}`}
              transform="rotate(-90 20 20)"
              className={ring.arc}
            />
          )}
        </svg>
      )}
      {/* Today: a crisp outline just outside the ring. */}
      {isToday && <span aria-hidden className="absolute inset-0 rounded-full border-[1.5px] border-zinc-900/70 dark:border-white/75" />}
      <span className={`tabular absolute inset-0 flex items-center justify-center text-[11px] ${numClass}`} aria-hidden>
        {num}
      </span>
      {isRest && <span className="absolute left-1/2 top-[68%] h-1 w-1 -translate-x-1/2 rounded-full bg-sky-500 dark:bg-sky-300" aria-hidden />}
    </li>
  );
}
