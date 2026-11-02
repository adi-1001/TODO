import { BookOpenCheck, CalendarClock, ChevronDown, ClipboardList, Gauge, Play, Route, ShieldCheck, Target, TriangleAlert } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { addBacklogSprintTask } from '../../db/repo';
import { useSubjectMap } from '../../hooks/useData';
import type { BacklogView } from '../../hooks/useBacklog';
import { DEFAULT_MINUTES_PER_QUESTION, PRACTICE_SET_ESTIMATE, ROOT_CAUSES, formatPace, type BacklogChapter } from '../../lib/backlog';
import { formatShort } from '../../lib/format';
import { GENERAL_COLOR } from '../../lib/stats';
import { MINUTE, addDays } from '../../lib/time';
import { useUI } from '../../state/UIProvider';
import { useTimer } from '../../timer/TimerProvider';
import { LiquidBar } from '../ui/LiquidBar';
import { Dot, ProgressBar } from '../ui/controls';
import { BottleneckInsight, RootCausePills } from './RootCauses';

/**
 * The Backlog and Recovery sub-cards, shared by the Dashboard command card and the Detailed
 * Report: A homework, B the practice backlog, C the catch-up plan, D solving speed and what went
 * wrong. Each is a spaced glass sub-card with an icon header.
 */

const SPRINT_MINUTES = 25;
const TOP_CHAPTERS = 4;
const HOMEWORK_CHIPS = 6;

const minutesText = (min: number) => formatShort(Math.max(0, min) * MINUTE);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Tint = 'rose' | 'sky' | 'amber' | 'emerald';
const ICON_TINT: Record<Tint, string> = {
  rose: 'bg-rose-500/10 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200',
  sky: 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200',
  amber: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200',
};

export function SubCard({
  icon,
  tint,
  title,
  subtitle,
  action,
  className = '',
  children,
}: {
  icon: ReactNode;
  tint: Tint;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`glass flex min-w-0 flex-col space-y-3 p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-[160px] flex-1 items-start gap-2.5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${ICON_TINT[tint]}`} aria-hidden>
            {icon}
          </span>
          <div className="min-w-0">
            <h3 id={headingId} className="whitespace-normal break-normal text-sm font-bold leading-snug text-zinc-900 dark:text-white">
              {title}
            </h3>
            {subtitle && <p className="muted whitespace-normal break-normal text-[11px] leading-snug">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusPill({ tone, children }: { tone: 'good' | 'warn'; children: ReactNode }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] font-semibold leading-snug ${
        tone === 'good'
          ? 'bg-emerald-500/10 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200'
          : 'bg-amber-500/15 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100'
      }`}
    >
      {tone === 'good' ? <ShieldCheck size={13} strokeWidth={1.75} aria-hidden /> : <TriangleAlert size={13} strokeWidth={1.75} aria-hidden />}
      <span className="whitespace-normal break-normal">{children}</span>
    </span>
  );
}

/** Sub-card A: today's live homework, so today is protected before any catch-up. */
export function HomeworkCard({ view }: { view: BacklogView }) {
  const { homework } = view;
  const n = homework.tasks.length;
  const shown = homework.tasks.slice(0, HOMEWORK_CHIPS);
  return (
    <SubCard icon={<ClipboardList size={16} strokeWidth={1.75} />} tint="rose" title="Today's Live Homework" subtitle="Protect Today First">
      <div className="tabular text-3xl font-bold leading-none tracking-tight text-zinc-900 dark:text-white">
        {n} <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{n === 1 ? 'task' : 'tasks'}</span>
      </div>
      {n === 0 ? (
        <StatusPill tone="good">All clear. No new backlog forms today.</StatusPill>
      ) : homework.minutes > 0 ? (
        <StatusPill tone="warn">About {minutesText(homework.minutes)} left. Finish this before backlog work.</StatusPill>
      ) : (
        <StatusPill tone="warn">Planned time is used up. Mark each task complete once it is done.</StatusPill>
      )}
      {shown.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Homework left today">
          {shown.map((t) => (
            <li key={t.id} className="max-w-full rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium leading-snug text-zinc-800 dark:bg-white/[0.05] dark:text-zinc-100">
              <span className="break-words">{t.title}</span>
            </li>
          ))}
          {n > shown.length && <li className="muted tabular self-center text-[11px]">and {n - shown.length} more</li>}
        </ul>
      )}
      <p className="muted mt-auto whitespace-normal break-normal text-[11px] leading-relaxed">Rule 1: finish today's homework first, so the backlog never grows.</p>
    </SubCard>
  );
}

function daysUntil(date: string, today: string): number {
  let n = 0;
  for (let d = today; d < date && n < 400; d = addDays(d, 1)) n++;
  return n;
}

function ChapterLine({ row, today }: { row: BacklogChapter; today: string }) {
  const subjects = useSubjectMap();
  const s = subjects.get(row.chapter.subjectId);
  const left =
    row.questionsLeft === 0 ? 'Target met' : row.source === 'estimate' ? `about ${row.questionsLeft} Qs` : `${row.questionsLeft} Qs left`;
  const inDays = row.testDate ? daysUntil(row.testDate, today) : null;
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 p-2.5 dark:bg-white/[0.02]">
      <div className="flex min-w-[140px] flex-1 items-start gap-2">
        <Dot color={s?.color ?? GENERAL_COLOR} className="mt-1.5 h-2 w-2 rounded-full" />
        <div className="min-w-0">
          <div className="break-words text-xs font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{row.chapter.title}</div>
          <div className="muted flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-snug">
            <span className="break-words">{s?.name ?? 'Archived subject'}</span>
            {inDays !== null && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-amber-700 dark:text-amber-300">
                <CalendarClock size={12} strokeWidth={1.75} aria-hidden />
                {inDays === 0 ? 'Test today' : inDays === 1 ? 'Test tomorrow' : `Test in ${inDays}d`}
              </span>
            )}
          </div>
        </div>
      </div>
      <span
        className={`tabular shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-bold ${
          row.questionsLeft === 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-zinc-200/70 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200'
        }`}
        title={row.questionsLeft === 0 ? 'Tick Ref. Book Done and PYQs Done in the Syllabus Tracker' : undefined}
      >
        {left}
      </span>
    </li>
  );
}

/** Sub-card B: chapters waiting on Ref. Book or PYQs, top 4 first, the rest in a collapsible list. */
export function BacklogCard({ view }: { view: BacklogView }) {
  const { backlog } = view;
  const { openBulkTargets } = useUI();
  const [all, setAll] = useState(false);
  const listId = useId();
  const n = backlog.chapters.length;
  const total = backlog.questions + backlog.questionsDone;
  const top = backlog.chapters.slice(0, TOP_CHAPTERS);
  const rest = backlog.chapters.slice(TOP_CHAPTERS);

  return (
    <SubCard
      icon={<BookOpenCheck size={16} strokeWidth={1.75} />}
      tint="sky"
      title="Syllabus & Ref. Book Backlog"
      subtitle="Theory done, Ref. Book or PYQs still left"
      action={
        <button type="button" className="btn-soft press h-8 px-2.5 text-[11px]" onClick={() => openBulkTargets()}>
          <Target size={14} strokeWidth={1.75} aria-hidden />
          Set Target Qs
        </button>
      }
    >
      <div className="tabular whitespace-normal break-normal text-lg font-bold leading-snug tracking-tight text-zinc-900 dark:text-white">
        {plural(n, 'chapter')} <span className="text-zinc-400 dark:text-zinc-500">•</span> {backlog.questions} target Qs left
      </div>
      {total > 0 && (
        <div className="space-y-1">
          <LiquidBar value={backlog.questionsDone / total} tone="teal" label="Backlog questions done" className="h-2" growIn />
          <div className="muted tabular text-[11px]">
            {backlog.questionsDone} of {total} Qs done{backlog.estimated ? ', partly estimated' : ''}
          </div>
        </div>
      )}
      {n === 0 ? (
        <StatusPill tone="good">No chapter is waiting on Ref. Book or PYQs.</StatusPill>
      ) : (
        <>
          <ul className="space-y-2" aria-label="Top priority backlog chapters">
            {top.map((r) => (
              <ChapterLine key={r.chapter.id} row={r} today={view.today} />
            ))}
          </ul>
          {rest.length > 0 && (
            <div>
              {all && (
                <ul id={listId} className="animate-fade-in space-y-2" aria-label="More backlog chapters">
                  {rest.map((r) => (
                    <ChapterLine key={r.chapter.id} row={r} today={view.today} />
                  ))}
                </ul>
              )}
              <button type="button" className="btn-ghost press mt-2 h-8 w-full px-2 text-[11px]" onClick={() => setAll((v) => !v)} aria-expanded={all} aria-controls={listId}>
                {all ? 'Show less' : `Show all ${n} chapters`}
                <ChevronDown size={14} strokeWidth={1.75} className={`transition-transform ${all ? 'rotate-180' : ''}`} aria-hidden />
              </button>
            </div>
          )}
        </>
      )}
      {backlog.estimated && (
        <p className="muted whitespace-normal break-normal text-[11px] leading-relaxed">
          Chapters with no target count as {PRACTICE_SET_ESTIMATE} Qs for each unfinished Ref. Book or PYQ set. Use Set Target Qs to give them real numbers.
        </p>
      )}
      {backlog.looseTasks.length > 0 && (
        <p className="muted whitespace-normal break-normal text-[11px] leading-relaxed">
          Includes {plural(backlog.looseTasks.length, 'catch-up task')} not linked to a backlog chapter.
        </p>
      )}
    </SubCard>
  );
}

/** Sub-card C: the daily chip-away target and the one-tap 25-minute sprint. */
export function PlanCard({ view }: { view: BacklogView }) {
  const { plan, backlog } = view;
  const ch = backlog.chapters.length;
  return (
    <section
      aria-label="Auto Catch-Up Plan"
      className="flex min-w-0 flex-col space-y-3 rounded-2xl border border-amber-500/25 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:border-t-amber-300/30 dark:bg-amber-500/[0.06]"
    >
      <div className="flex items-start gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${ICON_TINT.amber}`} aria-hidden>
          <Route size={16} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h3 className="whitespace-normal break-normal text-sm font-bold leading-snug text-zinc-900 dark:text-white">Auto Catch-Up Plan</h3>
          <p className="muted whitespace-normal break-normal text-[11px] leading-snug">A realistic daily target, about a week to clear</p>
        </div>
      </div>
      {plan ? (
        <>
          <p className="tabular whitespace-normal break-normal text-lg font-bold leading-snug tracking-tight text-amber-900 dark:text-amber-100">
            Solve +{plan.perDay} Backlog Qs/day (~{minutesText(plan.minutesPerDay)}/day)
          </p>
          <p className="whitespace-normal break-normal text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
            Clears {ch > 0 ? `your ${ch}-chapter backlog` : 'your backlog'} in <span className="tabular font-semibold">{plural(plan.days, 'day')}</span>.
            {!view.paceKnown && ` Time uses ${DEFAULT_MINUTES_PER_QUESTION} min per question until your own pace is measured.`}
          </p>
          <SprintButton view={view} />
        </>
      ) : (
        <p className="whitespace-normal break-normal text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
          Nothing to catch up on. Keep finishing today's homework first and the backlog stays at zero.
        </p>
      )}
    </section>
  );
}

/** Starts a 25-minute Pomodoro on the best backlog task, adding one for a chapter when none is open. */
function SprintButton({ view }: { view: BacklogView }) {
  const timer = useTimer();
  const [busy, setBusy] = useState(false);
  const busyTimer = timer.state.status !== 'idle';
  const target = view.sprintTask?.title ?? (view.sprintChapter ? `a new sprint task for ${view.sprintChapter.title}` : null);
  if (!target) return null;

  const start = async () => {
    setBusy(true);
    try {
      let taskId = view.sprintTask?.id ?? null;
      if (!taskId && view.sprintChapter) taskId = (await addBacklogSprintTask(view.sprintChapter.id, view.plan?.perDay ?? 25))?.id ?? null;
      if (taskId) timer.start({ taskId, selection: { mode: 'pomodoro', minutes: SPRINT_MINUTES } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-auto space-y-1.5 pt-1">
      <button
        type="button"
        className="press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-zinc-950 shadow-[0_0_22px_rgba(245,158,11,0.35)] transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none dark:bg-amber-300 dark:hover:bg-amber-200"
        onClick={() => void start()}
        disabled={busy || busyTimer}
      >
        <Play size={16} strokeWidth={1.75} aria-hidden />
        Start {SPRINT_MINUTES}m Backlog Sprint
      </button>
      <p className="muted break-words text-[11px] leading-relaxed">{busyTimer ? 'Finish or stop the current timer first.' : `On: ${target}`}</p>
    </div>
  );
}

/** Subject pace pills, slowest first ("Maths: 1.4m/Q"). */
export function PacePills({ view }: { view: BacklogView }) {
  const subjects = useSubjectMap();
  const rows = view.pace.rows;
  if (rows.length === 0) {
    return <p className="muted whitespace-normal break-normal text-xs leading-relaxed">Log questions on tasks you also time with the clock, and your minutes per question for each subject show here.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Minutes per question by subject">
      {rows.map((r) => {
        const s = subjects.get(r.subjectId);
        return (
          <li key={r.subjectId} className="tabular inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold leading-snug text-zinc-800 dark:border-white/[0.08] dark:border-t-white/[0.14] dark:bg-white/[0.04] dark:text-zinc-100">
            <Dot color={s?.color ?? GENERAL_COLOR} className="h-2 w-2 rounded-full" />
            <span className="break-words">{s?.name ?? 'Archived subject'}:</span>
            <span className="whitespace-nowrap">{formatPace(r.minutesPerQuestion)}m/Q</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Sub-card D1: Question Solving Speed. */
export function PaceCard({ view, children }: { view: BacklogView; children?: ReactNode }) {
  return (
    <SubCard icon={<Gauge size={16} strokeWidth={1.75} />} tint="emerald" title="Question Solving Speed" subtitle="Minutes per question, last 28 days">
      <PacePills view={view} />
      {children}
    </SubCard>
  );
}

/** Sub-card D2: What Went Wrong, with one-tap reasons (Dashboard) and the week's rows (Report). */
export function WhatWentWrongCard({ view, pills, rows = false }: { view: BacklogView; pills?: ReactNode; rows?: boolean }) {
  const counts = new Map(view.bottlenecks.map((b) => [b.cause, b.days]));
  return (
    <SubCard icon={<TriangleAlert size={16} strokeWidth={1.75} />} tint="amber" title="What Went Wrong" subtitle="Reasons tapped over the last 7 days">
      {pills}
      <BottleneckInsight bottlenecks={view.bottlenecks} />
      {rows && view.bottlenecks.length > 0 && (
        <ul className="space-y-3">
          {ROOT_CAUSES.filter((c) => counts.has(c.value)).map((c) => {
            const days = counts.get(c.value) ?? 0;
            return (
              <li key={c.value} className="space-y-1.5">
                <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
                  <span className="min-w-[140px] flex-1 whitespace-normal break-normal font-semibold leading-snug text-zinc-800 dark:text-zinc-100">{c.label}</span>
                  <span className="tabular shrink-0 whitespace-nowrap text-zinc-500 dark:text-zinc-400">{plural(days, 'day')}</span>
                </div>
                <ProgressBar value={days / 7} className="h-1.5" barClassName="bg-amber-500/80 dark:bg-amber-300/80" label={`${c.label}: ${days} of 7 days`} />
                <p className="muted whitespace-normal break-normal text-[11px] leading-relaxed">{c.fix}</p>
              </li>
            );
          })}
        </ul>
      )}
    </SubCard>
  );
}

/** Pace as one line, for the Evening Review. */
export function PaceLine({ view }: { view: BacklogView }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-100">
        <Gauge size={14} strokeWidth={1.75} className="shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden />
        Question Solving Speed
      </div>
      <PacePills view={view} />
    </div>
  );
}

/**
 * A, B and C side by side on wide screens. On tablets A and C share the first row and the
 * chapter list (B) gets the full width below them; phones stack A, B, C.
 */
export function TriageGrid({ view }: { view: BacklogView }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="flex min-w-0 flex-col md:order-1 [&>*]:flex-1">
        <HomeworkCard view={view} />
      </div>
      <div className="flex min-w-0 flex-col md:order-3 md:col-span-2 xl:order-2 xl:col-span-1 [&>*]:flex-1">
        <BacklogCard view={view} />
      </div>
      <div className="flex min-w-0 flex-col md:order-2 xl:order-3 [&>*]:flex-1">
        <PlanCard view={view} />
      </div>
    </div>
  );
}

export { RootCausePills };
