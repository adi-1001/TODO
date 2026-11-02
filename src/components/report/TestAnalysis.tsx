import { ClipboardCheck, Pencil } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTestResults, useTests } from '../../hooks/useData';
import { formatDayShort } from '../../lib/format';
import { largestRemainderPercent } from '../../lib/stats';
import { MISTAKE_COLORS, MISTAKE_TYPES, resultPercent } from '../../lib/tests';
import { useUI } from '../../state/UIProvider';
import type { MistakeCounts, TestEvent, TestResult } from '../../types';
import { EmptyState } from '../ui/controls';
import { testTitle } from '../syllabus/shared';
import { REPORT_CARD } from './PeriodControls';

/** Inner glass panel for each part of the card. */
const SUB_CARD = 'glass min-w-0 rounded-xl p-3 sm:p-3.5';

interface Point {
  test: TestEvent;
  result: TestResult;
  pct: number;
  target: number | null;
}

/** Test Score Trend, Mistake Type Breakdown and the latest results. */
export const TestAnalysis = memo(function TestAnalysis() {
  const tests = useTests();
  const results = useTestResults();
  const { navigate, openTestResult } = useUI();

  const points = useMemo<Point[]>(() => {
    const byId = new Map(tests.map((t) => [t.id, t]));
    const out: Point[] = [];
    for (const r of results) {
      const test = byId.get(r.testId);
      if (!test) continue;
      out.push({ test, result: r, pct: resultPercent(r), target: test.targetPercent });
    }
    return out.sort((a, b) => a.test.date.localeCompare(b.test.date) || a.result.createdAt - b.result.createdAt);
  }, [tests, results]);

  const mistakes = useMemo(() => {
    const totals: MistakeCounts = { conceptual: 0, calculation: 0, timePressure: 0, guessed: 0 };
    for (const p of points) for (const m of MISTAKE_TYPES) totals[m.key] += Math.max(0, p.result.mistakes[m.key] ?? 0);
    const counts = MISTAKE_TYPES.map((m) => totals[m.key]);
    const pcts = largestRemainderPercent(counts);
    const sum = counts.reduce((a, b) => a + b, 0);
    return { rows: MISTAKE_TYPES.map((m, i) => ({ ...m, count: counts[i], pct: pcts[i], color: MISTAKE_COLORS[m.key] })), sum };
  }, [points]);

  const latest = useMemo(() => [...points].reverse().slice(0, 4), [points]);

  return (
    <section className={`${REPORT_CARD} flex flex-col gap-4`} aria-labelledby="report-tests-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="report-tests-title" className="section-title">
          Test Analysis
        </h2>
        {points.length > 0 && (
          <span className="muted tabular text-[11px]">
            {points.length} {points.length === 1 ? 'result' : 'results'}
          </span>
        )}
      </div>

      {points.length === 0 ? (
        <div className="space-y-3">
          <EmptyState icon={<ClipboardCheck size={20} strokeWidth={1.75} />} title="No test results yet. Log a result after your next test." />
          <div className="flex justify-center">
            <button type="button" className="btn-soft" onClick={() => navigate('syllabus', 'tests')}>
              Open Tests
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className={`${SUB_CARD} lg:col-span-7`}>
            <h3 className="mb-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Test Score Trend</h3>
            <TrendChart points={points} />
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
            <div className={SUB_CARD}>
              <h3 className="mb-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Mistake Type Breakdown</h3>
              {mistakes.sum === 0 ? (
                <p className="muted text-xs">No lost marks logged yet. Count them in the Test Review to see where marks go.</p>
              ) : (
                <>
                  <div
                    role="img"
                    aria-label={`Mistake types across ${points.length} ${points.length === 1 ? 'test' : 'tests'}: ${mistakes.rows.map((r) => `${r.label} ${r.count} (${r.pct}%)`).join(', ')}.`}
                    className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]"
                  >
                    {mistakes.rows
                      .filter((r) => r.count > 0)
                      .map((r) => (
                        <div key={r.key} className="h-full" style={{ flexGrow: r.count, flexBasis: 0, backgroundColor: r.color }} title={`${r.label}, ${r.count}, ${r.pct}%`} />
                      ))}
                  </div>
                  <ul className="mt-3 space-y-2" aria-label="Mistake types">
                    {mistakes.rows.map((r) => (
                      <li key={r.key} className="flex items-start gap-2 text-xs leading-relaxed">
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} aria-hidden />
                        <span className="min-w-[96px] flex-1 whitespace-normal break-normal font-medium leading-relaxed text-zinc-700 dark:text-zinc-200" title={r.hint}>
                          {r.label}
                        </span>
                        <span className="tabular shrink-0 text-zinc-500 dark:text-zinc-400">{r.count}</span>
                        <span className="tabular w-9 shrink-0 text-right font-semibold text-zinc-800 dark:text-zinc-100">{r.pct}%</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className={SUB_CARD}>
              <h3 className="mb-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Latest results</h3>
              <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]" aria-label="Latest results">
                {latest.map((p) => {
                  const title = testTitle(p.test);
                  const diff = p.target !== null ? Math.round((p.pct - p.target) * 10) / 10 : null;
                  return (
                    <li key={p.result.id} className="flex flex-wrap items-center gap-2 py-2">
                      <div className="min-w-[140px] flex-1">
                        <div className="break-words whitespace-normal text-xs font-semibold leading-relaxed text-zinc-800 dark:text-zinc-100">
                          {title}
                        </div>
                        <div className="tabular text-[11px] text-zinc-500 dark:text-zinc-400">
                          {formatDayShort(p.test.date)}, {p.result.scored} / {p.result.total}
                          {diff !== null && (
                            <span className={diff >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>
                              {diff >= 0 ? `, target ${p.target}% met` : `, ${Math.abs(diff)} below target`}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="tabular ml-auto shrink-0 text-sm font-bold text-zinc-900 dark:text-white">{p.pct}%</span>
                      <button type="button" className="icon-btn press shrink-0" onClick={() => openTestResult(p.test.id)} aria-label={`Edit result for ${title}`} title="Edit Result">
                        <Pencil size={14} strokeWidth={1.75} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
});

const H = 190;
const PAD_L = 32;
const PAD_R = 14;
const PAD_T = 18;
const PAD_B = 24;
const PH = H - PAD_T - PAD_B;
const SLOT = 44;
const TICKS = [0, 25, 50, 75, 100];

function TrendChart({ points }: { points: Point[] }) {
  const n = points.length;
  const W = Math.max(360, PAD_L + PAD_R + n * SLOT);
  const PW = W - PAD_L - PAD_R;
  const inset = Math.min(20, PW / 4);
  const xOf = (i: number) => (n === 1 ? PAD_L + PW / 2 : PAD_L + inset + (i * (PW - inset * 2)) / (n - 1));
  const yOf = (pct: number) => PAD_T + PH * (1 - Math.max(0, Math.min(100, pct)) / 100);

  const line = points.map((p, i) => `${xOf(i)},${yOf(p.pct)}`).join(' ');

  // Dashed target: joined across neighbouring tests that both have a target, a short dash otherwise.
  const targetRuns: { i: number; target: number }[][] = [];
  let run: { i: number; target: number }[] = [];
  points.forEach((p, i) => {
    if (p.target !== null) run.push({ i, target: p.target });
    else if (run.length > 0) {
      targetRuns.push(run);
      run = [];
    }
  });
  if (run.length > 0) targetRuns.push(run);
  const hasTarget = targetRuns.length > 0;

  const first = points[0];
  const last = points[n - 1];
  const best = points.reduce((m, p) => Math.max(m, p.pct), 0);
  const ariaLabel =
    n === 1
      ? `Test score trend: one result, ${first.pct}% on ${formatDayShort(first.test.date)}${first.target !== null ? `, target ${first.target}%` : ''}.`
      : `Test score trend: ${n} results from ${formatDayShort(first.test.date)} to ${formatDayShort(last.test.date)}. First ${first.pct}%, latest ${last.pct}%, best ${best}%${
          last.target !== null ? `. Latest target ${last.target}%` : ''
        }.`;

  return (
    <div>
      <div className={W > 360 ? 'custom-scroll -mx-1 overflow-x-auto px-1' : ''}>
        <div style={W > 360 ? { minWidth: `${W}px` } : undefined}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} className="block">
            {TICKS.map((t) => (
              <g key={t}>
                <line x1={PAD_L} x2={W - PAD_R} y1={yOf(t)} y2={yOf(t)} strokeWidth={1} className="stroke-zinc-200 dark:stroke-white/[0.06]" />
                <text x={PAD_L - 5} y={yOf(t)} textAnchor="end" dominantBaseline="central" fontSize={9} className="tabular fill-zinc-400 dark:fill-zinc-500">
                  {t}%
                </text>
              </g>
            ))}

            {targetRuns.map((r) =>
              r.length === 1 ? (
                <line
                  key={`t-${r[0].i}`}
                  x1={xOf(r[0].i) - 12}
                  x2={xOf(r[0].i) + 12}
                  y1={yOf(r[0].target)}
                  y2={yOf(r[0].target)}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  className="stroke-amber-500 dark:stroke-amber-300"
                />
              ) : (
                <polyline
                  key={`t-${r[0].i}`}
                  points={r.map((p) => `${xOf(p.i)},${yOf(p.target)}`).join(' ')}
                  fill="none"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  strokeLinejoin="round"
                  className="stroke-amber-500 dark:stroke-amber-300"
                />
              ),
            )}

            {n > 1 && <polyline points={line} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-sky-600 dark:stroke-sky-300" />}

            {points.map((p, i) => {
              const x = xOf(i);
              const y = yOf(p.pct);
              const title = testTitle(p.test);
              return (
                <g key={p.result.id}>
                  <circle cx={x} cy={y} r={4} strokeWidth={2} className="fill-white stroke-sky-600 dark:fill-[#12151C] dark:stroke-sky-300">
                    <title>{`${title}, ${formatDayShort(p.test.date)}: ${p.pct}%${p.target !== null ? `, target ${p.target}%` : ''}`}</title>
                  </circle>
                  <text x={x} y={y - 9} textAnchor="middle" fontSize={9} fontWeight={600} className="tabular fill-zinc-700 dark:fill-zinc-200">
                    {Math.round(p.pct)}%
                  </text>
                  <text x={x} y={H - 7} textAnchor="middle" fontSize={9} className="tabular fill-zinc-400 dark:fill-zinc-500">
                    {formatDayShort(p.test.date)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Chart key">
        <li className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
          <span className="inline-block h-0.5 w-4 rounded-full bg-sky-600 dark:bg-sky-300" aria-hidden />
          Score
        </li>
        {hasTarget && (
          <li className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
            <span className="inline-block w-4 border-t-[1.5px] border-dashed border-amber-500 dark:border-amber-300" aria-hidden />
            Target
          </li>
        )}
      </ul>
    </div>
  );
}
