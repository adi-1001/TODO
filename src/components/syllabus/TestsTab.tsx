import { CalendarClock, ChevronDown, ClipboardCheck, Pencil, Plus, Repeat, RepeatOff, Trash2 } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { deleteTest, stopTestRepeat } from '../../db/repo';
import { useChapters, useSubjectMap, useTestResults, useTests } from '../../hooks/useData';
import { useToday } from '../../hooks/useNow';
import { formatDayShort, formatWeekday } from '../../lib/format';
import { chaptersLeft, countdownText, resultPercent, testKindLabel, upcomingTests } from '../../lib/tests';
import { daysBetween } from '../../lib/time';
import { useUI } from '../../state/UIProvider';
import type { Chapter, Subject, TestEvent, TestResult } from '../../types';
import { Dot, EmptyState } from '../ui/controls';
import { testTitle } from './shared';

/** Tests tab of the Syllabus Tracker: upcoming tests with countdowns, and past tests with their results. */
export function TestsTab() {
  const tests = useTests();
  const results = useTestResults();
  const subjectMap = useSubjectMap();
  const chapters = useChapters();
  const today = useToday();
  const { openTest } = useUI();

  const upcoming = useMemo(() => upcomingTests(tests, today), [tests, today]);
  const past = useMemo(() => tests.filter((t) => t.date < today).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt), [tests, today]);
  const resultByTest = useMemo(() => new Map(results.map((r) => [r.testId, r])), [results]);
  const chapterById = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);

  return (
    <div className="space-y-5">
      <section className="card-plain min-w-0 overflow-hidden" aria-labelledby="tests-upcoming-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4 dark:border-white/[0.07] sm:p-5">
          <div className="min-w-0">
            <h2 id="tests-upcoming-title" className="section-title">
              Tests and Deadlines
            </h2>
            <p className="muted mt-0.5 text-xs">Upcoming, soonest first.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => openTest()}>
            <Plus size={14} strokeWidth={1.75} aria-hidden />
            Add Test
          </button>
        </div>
        {upcoming.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState icon={<CalendarClock size={20} strokeWidth={1.75} />} title="No upcoming tests or deadlines." hint="Add your next test to see a countdown and the chapters still left." />
          </div>
        ) : (
          <ul className="space-y-2 p-3 sm:p-4" aria-label="Upcoming tests">
            {upcoming.map((t) => (
              <TestRow key={t.id} test={t} result={resultByTest.get(t.id)} today={today} subjectMap={subjectMap} chapterById={chapterById} chapters={chapters} past={false} />
            ))}
          </ul>
        )}
      </section>

      <section className="card-plain min-w-0 overflow-hidden" aria-labelledby="tests-past-title">
        <div className="border-b border-zinc-200 p-4 dark:border-white/[0.07] sm:p-5">
          <h2 id="tests-past-title" className="section-title">
            Past Tests
          </h2>
          <p className="muted mt-0.5 text-xs">Newest first. Log each result to see your trend in the Detailed Report.</p>
        </div>
        {past.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState icon={<ClipboardCheck size={20} strokeWidth={1.75} />} title="No past tests yet." hint="Tests move here the day after their date." />
          </div>
        ) : (
          <ul className="space-y-2 p-3 sm:p-4" aria-label="Past tests">
            {past.map((t) => (
              <TestRow key={t.id} test={t} result={resultByTest.get(t.id)} today={today} subjectMap={subjectMap} chapterById={chapterById} chapters={chapters} past />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface TestRowProps {
  test: TestEvent;
  result: TestResult | undefined;
  today: string;
  subjectMap: Map<string, Subject>;
  chapterById: Map<string, Chapter>;
  chapters: Chapter[];
  past: boolean;
}

const TestRow = memo(function TestRow({ test, result, today, subjectMap, chapterById, chapters, past }: TestRowProps) {
  const { openTest, openTestResult } = useUI();
  const [confirming, setConfirming] = useState(false);
  const [showChapters, setShowChapters] = useState(false);

  const title = testTitle(test);
  const hasTitle = test.title.trim() !== '';
  const linkedSubjects = test.subjectIds.map((id) => subjectMap.get(id)).filter((s): s is Subject => s !== undefined);
  const linkedChapters = test.chapterIds.map((id) => chapterById.get(id)).filter((c): c is Chapter => c !== undefined);
  const left = chaptersLeft(test, chapters);
  const leftChapters = linkedChapters.filter((c) => c.status !== 'completed');
  const days = daysBetween(today, test.date);
  const canLog = (past || test.date === today) && (test.kind !== 'assignment' || result !== undefined);
  const listId = `test-chapters-${test.id}`;

  const pillTone = past
    ? 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300'
    : days <= 3
      ? 'bg-amber-50 text-amber-800 dark:bg-amber-300/10 dark:text-amber-200'
      : 'bg-sky-50 text-sky-700 dark:bg-sky-300/10 dark:text-sky-200';

  // Today or tomorrow: the row catches an amber left accent.
  const urgent = !past && days <= 1;

  return (
    <li className={`glass relative overflow-hidden rounded-xl px-4 py-3.5 ${urgent ? 'border-amber-200 dark:border-amber-300/20 dark:border-t-amber-300/35' : ''}`}>
      {urgent && (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.75)] dark:bg-amber-300" />
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-24 bg-gradient-to-r from-amber-300/[0.08] to-transparent dark:block" />
        </>
      )}
      {/* The text keeps at least 140px; on a narrow phone the actions move below it. */}
      <div className="relative flex flex-wrap items-start gap-3">
        <div className="min-w-[140px] flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 whitespace-normal break-words text-sm font-semibold leading-relaxed text-zinc-900 dark:text-zinc-100">
              {title}
            </h3>
            <span className={`tabular shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pillTone}`}>{countdownText(test.date, today)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {hasTitle && <span>{testKindLabel(test.kind)}</span>}
            {hasTitle && <span aria-hidden>·</span>}
            <span className="tabular">
              {formatWeekday(test.date)} {formatDayShort(test.date)}
            </span>
            {test.repeatEveryDays !== null && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Repeat size={14} strokeWidth={1.75} aria-hidden />
                  Every {test.repeatEveryDays} {test.repeatEveryDays === 1 ? 'day' : 'days'}
                </span>
              </>
            )}
          </div>
          {linkedSubjects.length > 0 && (
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Subjects">
              {linkedSubjects.map((s) => (
                <li key={s.id} className="flex max-w-full items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                  <Dot color={s.color} className="rounded-full" />
                  <span className="whitespace-normal break-words">{s.name}</span>
                </li>
              ))}
            </ul>
          )}

          {!past && linkedChapters.length > 0 && (
            <div>
              {left > 0 ? (
                <button
                  type="button"
                  className="-ml-1 inline-flex min-h-[32px] items-center gap-1 rounded-lg px-1 text-xs font-semibold text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white"
                  aria-expanded={showChapters}
                  aria-controls={listId}
                  onClick={() => setShowChapters((v) => !v)}
                >
                  {left} {left === 1 ? 'chapter' : 'chapters'} left
                  <span className="muted font-medium">of {linkedChapters.length}</span>
                  <ChevronDown size={14} strokeWidth={1.75} className={`transition-transform ${showChapters ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              ) : (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">All {linkedChapters.length} linked chapters completed</p>
              )}
              {showChapters && left > 0 && (
                <ul id={listId} className="mt-1 flex flex-wrap gap-1.5" aria-label="Chapters left">
                  {leftChapters.map((c) => (
                    <li key={c.id} className="flex max-w-full items-start gap-1.5 rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200">
                      <Dot color={subjectMap.get(c.subjectId)?.color ?? '#A1A1AA'} className="mt-[3px] rounded-full" />
                      <span className="min-w-0 break-words whitespace-normal leading-snug">{c.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result && <ResultSummary test={test} result={result} />}

          {canLog && (
            <div className="pt-0.5">
              <button type="button" className={result ? 'btn-soft' : 'btn-primary'} onClick={() => openTestResult(test.id)}>
                <ClipboardCheck size={14} strokeWidth={1.75} aria-hidden />
                {result ? 'Edit Result' : 'Log Test Result'}
              </button>
            </div>
          )}
        </div>

        <div className="-mr-1.5 -mt-1 ml-auto flex shrink-0 items-center">
          <button type="button" className="icon-btn" onClick={() => openTest({ testId: test.id })} aria-label={`Edit ${title}`} title="Edit">
            <Pencil size={16} strokeWidth={1.75} />
          </button>
          {test.repeatEveryDays !== null && (
            <button type="button" className="icon-btn" onClick={() => void stopTestRepeat(test.id)} aria-label={`Stop repeating ${title}`} title="Stop repeating">
              <RepeatOff size={16} strokeWidth={1.75} />
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => setConfirming(true)} aria-label={`Delete ${title}`} title="Delete">
            <Trash2 size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {confirming && (
        <div className="relative mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-white/[0.07] dark:border-t-white/[0.12] dark:bg-white/[0.03]">
          <span className="whitespace-normal break-normal text-xs text-zinc-700 dark:text-zinc-200">{result ? 'Delete this test and its result?' : 'Delete this test?'}</span>
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="btn bg-rose-50 px-2.5 py-1.5 text-rose-700 hover:bg-rose-100 dark:bg-rose-300/10 dark:text-rose-200 dark:hover:bg-rose-300/15"
              onClick={() => void deleteTest(test.id)}
              autoFocus
            >
              Delete
            </button>
            <button type="button" className="btn-ghost px-2.5 py-1.5" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        </div>
      )}
    </li>
  );
});

function ResultSummary({ test, result }: { test: TestEvent; result: TestResult }) {
  const pct = resultPercent(result);
  const target = test.targetPercent;
  const diff = target !== null ? Math.round((pct - target) * 10) / 10 : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="tabular font-semibold text-zinc-900 dark:text-zinc-100">
        {result.scored} / {result.total}
      </span>
      <span className="tabular font-bold text-zinc-900 dark:text-white">{pct}%</span>
      {target !== null && diff !== null && (
        <span
          className={`tabular rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            diff >= 0 ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-300/10 dark:text-emerald-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-300/10 dark:text-amber-200'
          }`}
        >
          {diff >= 0 ? `Target ${target}% met` : `${Math.abs(diff)} below target ${target}%`}
        </span>
      )}
      {result.rank !== null && <span className="tabular muted">Rank {result.rank}</span>}
      {result.percentile !== null && <span className="tabular muted">{result.percentile} percentile</span>}
    </div>
  );
}
