import { LifeBuoy, Target } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useSubjectMap } from '../../hooks/useData';
import { useBacklog } from '../../hooks/useBacklog';
import { useLiveSessions } from '../../hooks/useLiveSessions';
import { MIN_PACE_QUESTIONS, formatPace } from '../../lib/backlog';
import { formatShort } from '../../lib/format';
import { GENERAL_COLOR, focusByDay } from '../../lib/stats';
import { MINUTE, addDays } from '../../lib/time';
import { useUI } from '../../state/UIProvider';
import { PaceCard, TriageGrid, WhatWentWrongCard } from '../backlog/Triage';
import { Dot } from '../ui/controls';

const WEEK = 7;

/**
 * Detailed Backlog and Recovery view in the Report: the same sub-cards as the Dashboard card,
 * plus a pace table per subject, a speed-or-hours check and the week's reasons as bars.
 */
export function BacklogReport() {
  const view = useBacklog();
  const sessions = useLiveSessions();
  const subjects = useSubjectMap();
  const { section, openBulkTargets } = useUI();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (section === 'backlog' && el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  }, [section]);

  /** Average focus a day over the last 7 days, today included. */
  const avgDayMs = useMemo(() => {
    const byDay = focusByDay(sessions);
    let total = 0;
    for (let i = 0; i < WEEK; i++) total += byDay.get(addDays(view.today, -i)) ?? 0;
    return total / WEEK;
  }, [sessions, view.today]);

  const plan = view.plan;
  const backlogMinutes = Math.round(view.backlog.questions * view.minutesPerQuestion);
  const share = plan && avgDayMs > 0 ? Math.round(((plan.minutesPerDay * MINUTE) / avgDayMs) * 100) : null;

  return (
    <section ref={ref} id="report-backlog" className="card scroll-mt-4 space-y-5 p-5 sm:p-6" aria-labelledby="report-backlog-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-[200px] flex-1 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200" aria-hidden>
            <LifeBuoy size={18} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 id="report-backlog-title" className="section-title whitespace-normal break-normal">
              Backlog & Recovery
            </h2>
            <p className="muted mt-0.5 whitespace-normal break-normal text-xs leading-relaxed">Homework left, the practice backlog, solving speed and what went wrong, in one place.</p>
          </div>
        </div>
        <button type="button" className="btn-soft press h-9 px-3 text-xs" onClick={() => openBulkTargets()}>
          <Target size={14} strokeWidth={1.75} aria-hidden />
          Set Target Qs
        </button>
      </div>

      <TriageGrid view={view} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PaceCard view={view}>
          {view.pace.rows.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <th scope="col" className="py-1.5 pr-2 font-semibold">
                    Subject
                  </th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-semibold">
                    Qs
                  </th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-semibold">
                    Focus
                  </th>
                  <th scope="col" className="whitespace-nowrap py-1.5 text-right font-semibold">
                    Min per Q
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
                {view.pace.rows.map((r) => {
                  const s = subjects.get(r.subjectId);
                  return (
                    <tr key={r.subjectId} className="text-zinc-700 dark:text-zinc-200">
                      <td className="py-2.5 pr-2 align-top">
                        <span className="flex min-w-[110px] items-start gap-1.5">
                          <Dot color={s?.color ?? GENERAL_COLOR} className="mt-1 h-2 w-2 rounded-full" />
                          <span className="break-words font-semibold leading-snug">{s?.name ?? 'Archived subject'}</span>
                        </span>
                      </td>
                      <td className="tabular py-2.5 pr-2 text-right align-top">{r.questions}</td>
                      <td className="tabular whitespace-nowrap py-2.5 pr-2 text-right align-top">{formatShort(r.ms)}</td>
                      <td className="tabular py-2.5 text-right align-top font-bold">{formatPace(r.minutesPerQuestion)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {view.pace.rows.length === 0 && (
            <p className="muted whitespace-normal break-normal text-[11px] leading-relaxed">A subject needs at least {MIN_PACE_QUESTIONS} questions logged on timed tasks.</p>
          )}
          <div className="rounded-xl bg-zinc-50 px-3 py-3 text-xs leading-relaxed text-zinc-700 dark:bg-white/[0.03] dark:text-zinc-200">
            <div className="font-semibold text-zinc-900 dark:text-white">Speed or hours?</div>
            {plan ? (
              <p className="mt-1 whitespace-normal break-normal">
                At {formatPace(view.minutesPerQuestion)} min per question{view.paceKnown ? '' : ' (default pace)'}, the backlog needs about{' '}
                <span className="tabular font-semibold">{formatShort(backlogMinutes * MINUTE)}</span>. The plan asks for <span className="tabular font-semibold">{formatShort(plan.minutesPerDay * MINUTE)}</span> a day;
                you averaged <span className="tabular font-semibold">{formatShort(avgDayMs)}</span> of focus a day over the last {WEEK} days.{' '}
                {share === null
                  ? 'Log some focus time to compare.'
                  : share > 50
                    ? `That is ${share}% of your usual day, so both more hours and faster solving would help.`
                    : `That is ${share}% of your usual day, so it fits if today's homework comes first.`}
              </p>
            ) : (
              <p className="mt-1 whitespace-normal break-normal">No backlog right now. Your average focus over the last {WEEK} days is {formatShort(avgDayMs)} a day.</p>
            )}
          </div>
        </PaceCard>
        <WhatWentWrongCard view={view} rows />
      </div>
    </section>
  );
}
