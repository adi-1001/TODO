import { useMemo } from 'react';
import { CalendarClock, ChevronRight, ClipboardCheck, ClipboardList, Plus } from 'lucide-react';
import type { Chapter, TestEvent } from '../../types';
import { useChapters, useTestResults, useTests } from '../../hooks/useData';
import { useToday } from '../../hooks/useNow';
import { formatDayShort } from '../../lib/format';
import { addDays } from '../../lib/time';
import { chaptersLeft, countdownText, testKindLabel, testsAwaitingResult, upcomingTests } from '../../lib/tests';
import { useUI } from '../../state/UIProvider';

const MAX_UPCOMING = 3;
const MAX_AWAITING = 2;

const nameOf = (t: TestEvent) => t.title.trim() || testKindLabel(t.kind);

/**
 * "Tomorrow" or "Today" as a small amber pill. The glow is its own layer pulsing in opacity,
 * so the text never fades.
 */
function CountdownPill({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center whitespace-nowrap rounded-full border border-amber-400/50 bg-amber-100 px-2 py-px align-baseline text-[10px] font-bold text-amber-900 dark:border-amber-300/35 dark:bg-amber-400/15 dark:text-amber-100">
      <span aria-hidden className="pointer-events-none absolute inset-0 animate-glow-pulse rounded-full shadow-[0_0_10px_rgba(245,158,11,0.45)] dark:shadow-[0_0_12px_rgba(245,158,11,0.6)]" />
      <span className="tabular relative">{text.charAt(0).toUpperCase() + text.slice(1)}</span>
    </span>
  );
}

function chaptersText(test: TestEvent, chapters: Chapter[]): string | null {
  if (test.chapterIds.length === 0) return null;
  const left = chaptersLeft(test, chapters);
  if (left === 0) return 'all chapters done';
  return left === 1 ? '1 chapter left' : `${left} chapters left`;
}

/** Upcoming tests and deadlines as countdown pills, and tests waiting for a result. */
export function TestsWidget() {
  const today = useToday();
  const tests = useTests();
  const results = useTestResults();
  const chapters = useChapters();
  const { openTest, openTestResult, navigate } = useUI();

  const tomorrow = addDays(today, 1);
  const upcoming = useMemo(() => upcomingTests(tests, today).slice(0, MAX_UPCOMING), [tests, today]);
  const awaiting = useMemo(() => testsAwaitingResult(tests, results, today).slice(0, MAX_AWAITING), [tests, results, today]);
  const empty = upcoming.length === 0 && awaiting.length === 0;

  return (
    <section className="card p-4" aria-labelledby="tests-widget-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tests-widget-title" className="flex items-center gap-1.5 text-sm font-bold text-zinc-900 dark:text-white">
          <CalendarClock size={16} strokeWidth={1.75} className="text-zinc-500 dark:text-zinc-400" aria-hidden />
          Tests and Deadlines
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {!empty && (
            <button type="button" onClick={() => navigate('syllabus', 'tests')} className="btn-ghost h-8 px-2 text-[11px]">
              See all
              <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
            </button>
          )}
          <button type="button" onClick={() => openTest()} className="btn-soft h-8 px-2.5 text-[11px]" aria-label="Add a test or deadline">
            <Plus size={14} strokeWidth={1.75} aria-hidden />
            Add
          </button>
        </div>
      </div>

      {empty ? (
        <div className="mt-3 flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-zinc-200 px-4 py-5 text-center dark:border-white/10">
          <ClipboardList size={18} strokeWidth={1.75} className="text-zinc-400 dark:text-zinc-500" aria-hidden />
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">No tests or deadlines yet.</p>
          <button type="button" onClick={() => openTest()} className="btn-soft mt-1 h-8 px-3 text-[11px]">
            <Plus size={14} strokeWidth={1.75} aria-hidden />
            Add
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {upcoming.length > 0 && (
            <ul className="flex flex-col gap-1.5" aria-label="Upcoming tests and deadlines">
              {upcoming.map((t) => {
                // The soonest test and the soonest deadline each get a lead, so a deadline
                // that comes first does not hide which test is next.
                const isDeadline = t.kind === 'assignment';
                const firstOfKind = upcoming.find((u) => (u.kind === 'assignment') === isDeadline)?.id === t.id;
                const lead = firstOfKind ? (isDeadline ? 'Next Deadline: ' : 'Next Test: ') : '';
                const when = countdownText(t.date, today);
                const left = chaptersText(t, chapters);
                // Today or tomorrow: amber-gold accent and a softly glowing countdown pill.
                const urgent = t.date === today || t.date === tomorrow;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => openTest({ testId: t.id })}
                      title={`${nameOf(t)}, ${formatDayShort(t.date)}. Edit`}
                      className={`flex min-h-8 w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3 py-1.5 text-left text-[11px] transition hover:opacity-80 ${
                        urgent
                          ? 'border-amber-500/30 border-l-2 border-l-amber-400 bg-amber-500/10 text-amber-900 dark:border-amber-300/20 dark:border-l-amber-400 dark:bg-amber-400/[0.08] dark:text-amber-100 dark:shadow-[0_0_14px_rgba(245,158,11,0.12)]'
                          : 'border-sky-500/20 bg-sky-500/10 text-sky-900 dark:border-sky-300/15 dark:border-t-sky-200/25 dark:bg-sky-400/[0.07] dark:text-sky-100'
                      }`}
                    >
                      <span className="min-w-[140px] flex-1 break-words whitespace-normal leading-snug">
                        {lead && <span className="font-semibold">{lead}</span>}
                        <span className="font-bold">{nameOf(t)}</span>
                        {urgent ? (
                          <>
                            {' '}
                            <CountdownPill text={when} />
                          </>
                        ) : (
                          <>
                            {' '}
                            <span className="tabular">{when}</span>
                          </>
                        )}
                        {left && <span className="opacity-80">, {left}</span>}
                      </span>
                      <span className="tabular ml-auto shrink-0 opacity-70">{formatDayShort(t.date)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {awaiting.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Waiting for a result</div>
              <ul className="space-y-1.5">
                {awaiting.map((t) => (
                  <li
                    key={t.id}
                    className="glass flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2"
                  >
                    <div className="min-w-[140px] flex-1">
                      <div className="break-words whitespace-normal text-xs font-semibold leading-relaxed text-zinc-800 dark:text-zinc-100">{nameOf(t)}</div>
                      <div className="tabular text-[11px] text-zinc-500 dark:text-zinc-400">
                        {formatDayShort(t.date)}, {countdownText(t.date, today)}
                      </div>
                    </div>
                    <button type="button" onClick={() => openTestResult(t.id)} className="btn-primary h-8 shrink-0 px-2.5 text-[11px]">
                      <ClipboardCheck size={14} strokeWidth={1.75} aria-hidden />
                      Log Test Result
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
