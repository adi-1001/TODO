import { CalendarDays } from 'lucide-react';
import { memo, useMemo } from 'react';
import { formatDayShort, formatShort, formatWeekday } from '../../lib/format';
import { questionsBy } from '../../lib/questions';
import { bucketInfo, dailySubjectStacks, subjectBreakdown, type BreakdownRow, type BucketInfo, type DayStack } from '../../lib/stats';
import { HOUR, dayStart } from '../../lib/time';
import type { FocusSession, QuestionLog, Subject } from '../../types';
import { Dot, EmptyState } from '../ui/controls';
import { PeriodControls, REPORT_CARD, hm, usePeriod } from './PeriodControls';

interface SubjectFocusProps {
  sessions: FocusSession[];
  subjects: Subject[];
  questionLogs: QuestionLog[];
  today: string;
}

/** Focus Time by Subject: time and questions practiced per subject for the period, plus a stacked bar per day. */
export const SubjectFocus = memo(function SubjectFocus({ sessions, subjects, questionLogs, today }: SubjectFocusProps) {
  const ps = usePeriod('weekly', today);
  const { period } = ps;

  const focusRows = useMemo(() => subjectBreakdown(sessions, subjects, period.from, period.to), [sessions, subjects, period.from, period.to]);
  const stacks = useMemo(() => dailySubjectStacks(sessions, period.chartDays), [sessions, period.chartDays]);

  // Questions practiced per subject in the same period.
  const questionsBySubject = useMemo(
    () =>
      questionsBy(
        questionLogs.filter((l) => {
          const t = dayStart(l.day);
          return t >= period.from && t < period.to;
        }),
        (l) => l.subjectId,
      ),
    [questionLogs, period.from, period.to],
  );

  // Subjects with questions but no focus time in the period are listed after the timed ones.
  const rows = useMemo(() => {
    const seen = new Set(focusRows.map((r) => r.key));
    const extra: BreakdownRow[] = [];
    for (const [id, n] of questionsBySubject) {
      if (n > 0 && !seen.has(id)) extra.push({ ...bucketInfo(id, subjects), ms: 0, pct: 0 });
    }
    extra.sort((a, b) => (questionsBySubject.get(b.key) ?? 0) - (questionsBySubject.get(a.key) ?? 0) || a.name.localeCompare(b.name));
    return [...focusRows, ...extra];
  }, [focusRows, questionsBySubject, subjects]);

  const total = focusRows.reduce((a, r) => a + r.ms, 0);
  const totalQuestions = rows.reduce((a, r) => a + (questionsBySubject.get(r.key) ?? 0), 0);
  const maxMs = focusRows.length > 0 ? focusRows[0].ms : 0;

  return (
    <section className={`${REPORT_CARD} flex flex-col gap-4`} aria-labelledby="report-subject-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="report-subject-title" className="section-title">
          Focus Time by Subject
        </h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Total <span className="tabular font-bold text-amber-600 dark:text-amber-300">{hm(total)}</span>
          <span className="ml-2">
            <span className="tabular font-bold text-emerald-600 dark:text-emerald-300">{totalQuestions}</span> {totalQuestions === 1 ? 'question' : 'questions'}
          </span>
        </span>
      </div>

      <PeriodControls state={ps} today={today} label="Focus Time by Subject" />

      {rows.length === 0 ? (
        <EmptyState icon={<CalendarDays size={20} strokeWidth={1.75} />} title="No focus in this period" hint="Start Focus on a task and its time shows up here by subject." />
      ) : (
        <ul className="space-y-3" aria-label="Focus time and questions practiced per subject">
          {rows.map((r) => (
            <li key={r.key} className="space-y-1.5">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5 text-xs">
                <span className="flex min-w-[140px] flex-1 items-start gap-2 font-semibold text-zinc-700 dark:text-zinc-200">
                  <Dot color={r.color} className="mt-1" />
                  <span className="min-w-0 flex-1 whitespace-normal break-words leading-relaxed">{r.name}</span>
                </span>
                <span className="tabular ml-auto shrink-0 whitespace-nowrap leading-relaxed text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-100">{formatShort(r.ms)}</span>
                  <span className="ml-2 inline-block min-w-[3.25rem] text-right" title="Questions practiced in this period">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">{questionsBySubject.get(r.key) ?? 0}</span>
                    <span aria-hidden> Qs</span>
                    <span className="sr-only"> questions practiced</span>
                  </span>
                  <span className="ml-2 inline-block w-9 text-right">{r.pct}%</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
                {/* The wrapper plays the grow-in; the inner bar keeps its own scale. */}
                <div className="h-full w-full origin-left animate-bar-grow">
                  <div
                    className="h-full w-full origin-left rounded-full transition-transform duration-500"
                    style={{
                      transform: `scaleX(${maxMs > 0 && r.ms > 0 ? Math.max(0.02, r.ms / maxMs) : 0})`,
                      backgroundColor: r.color,
                      backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0) 70%)',
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-zinc-200 pt-4 dark:border-white/[0.07]">
        <div className="mb-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{period.mode === 'daily' ? 'Last 7 days' : 'Per day'}</div>
        <StackedBars stacks={stacks} subjects={subjects} today={today} />
      </div>
    </section>
  );
});

/** 3 to 5 evenly spaced ticks (in hours) covering `maxHours`. The scale always reaches at least 1 hour. */
function niceTicks(maxHours: number): number[] {
  const safe = Number.isFinite(maxHours) ? Math.max(1, maxHours) : 1;
  const steps = [0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 12];
  const step = steps.find((s) => Math.ceil(safe / s) <= 4) ?? 12;
  const n = Math.max(2, Math.ceil(safe / step));
  return Array.from({ length: n + 1 }, (_, i) => i * step);
}

const hoursLabel = (h: number) => `${Number(h.toFixed(2))}h`;

const CW = 360;
const CH = 170;
const PAD_L = 30;
const PAD_R = 4;
const PAD_T = 8;
const PAD_B = 20;
const PW = CW - PAD_L - PAD_R;
const PH = CH - PAD_T - PAD_B;

/** Rectangle with rounded top corners only. */
function topRoundedPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function StackedBars({ stacks, subjects, today }: { stacks: DayStack[]; subjects: Subject[]; today: string }) {
  const maxTotal = stacks.reduce((m, s) => Math.max(m, s.total), 0);
  const ticks = niceTicks(maxTotal / HOUR);
  const top = Math.max(HOUR, ticks[ticks.length - 1] * HOUR);
  const n = Math.max(1, stacks.length);
  const slot = PW / n;
  const barW = Math.min(slot * 0.62, 26);
  const short = n <= 7;
  const yOf = (ms: number) => PAD_T + PH - (ms / top) * PH;

  const info = new Map<string, BucketInfo>();
  const legendMs = new Map<string, number>();
  for (const s of stacks) {
    for (const p of s.parts) {
      if (!info.has(p.key)) info.set(p.key, bucketInfo(p.key, subjects));
      legendMs.set(p.key, (legendMs.get(p.key) ?? 0) + p.ms);
    }
  }
  const legend = [...legendMs.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => info.get(k)!);

  const sum = stacks.reduce((a, s) => a + s.total, 0);
  const range = stacks.length > 0 ? `from ${formatDayShort(stacks[0].day)} to ${formatDayShort(stacks[stacks.length - 1].day)}` : '';
  const ariaLabel = sum === 0 ? `Focus per day ${range}: no focus yet.` : `Focus per day ${range}, ${hm(sum)} in total. Highest day ${hm(maxTotal)}.`;

  return (
    <div>
      <div className={n > 7 ? 'custom-scroll -mx-1 overflow-x-auto px-1' : ''}>
        <div className={n > 7 ? 'min-w-[420px]' : ''}>
          <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" role="img" aria-label={ariaLabel} className="block">
            {ticks.map((t) => {
              const y = yOf(t * HOUR);
              return (
                <g key={t}>
                  <line x1={PAD_L} x2={CW - PAD_R} y1={y} y2={y} strokeWidth={1} className="stroke-zinc-200 dark:stroke-white/[0.06]" />
                  <text x={PAD_L - 5} y={y} textAnchor="end" dominantBaseline="central" fontSize={9} className="tabular fill-zinc-400 dark:fill-zinc-500">
                    {hoursLabel(t)}
                  </text>
                </g>
              );
            })}

            {stacks.map((s, i) => {
              const cx = PAD_L + slot * i + slot / 2;
              const x = cx - barW / 2;
              const isToday = s.day === today;
              const dayNum = Number(s.day.slice(8));
              const showLabel = short || dayNum === 1 || dayNum % 5 === 0;
              const dayName = `${formatWeekday(s.day)} ${formatDayShort(s.day)}`;
              let base = 0;
              const last = s.parts.length - 1;
              return (
                <g key={s.day}>
                  {isToday && <rect x={PAD_L + slot * i + 1} y={PAD_T} width={slot - 2} height={PH} rx={4} className="fill-zinc-100 dark:fill-white/[0.04]" />}
                  {/* One stack rises from its own bottom edge; neighbours follow a few ms apart. */}
                  <g className="origin-bottom animate-bar-rise" style={{ transformBox: 'fill-box', transformOrigin: 'bottom', animationDelay: `${Math.min(i, 14) * 25}ms` }}>
                  {s.parts.map((p, j) => {
                    const y0 = yOf(base);
                    base += p.ms;
                    const y1 = yOf(base);
                    const h = Math.max(0, y0 - y1);
                    const bi = info.get(p.key)!;
                    const title = `${dayName}: ${bi.name}, ${formatShort(p.ms)} (day total ${formatShort(s.total)})`;
                    return j === last ? (
                      <path key={p.key} d={topRoundedPath(x, y1, barW, h, 3)} fill={bi.color}>
                        <title>{title}</title>
                      </path>
                    ) : (
                      <rect key={p.key} x={x} y={y1} width={barW} height={h} fill={bi.color}>
                        <title>{title}</title>
                      </rect>
                    );
                  })}
                  </g>
                  {s.total === 0 && (
                    <rect x={x} y={PAD_T} width={barW} height={PH} fill="transparent">
                      <title>{`${dayName}: no focus`}</title>
                    </rect>
                  )}
                  {showLabel && (
                    <text
                      x={cx}
                      y={CH - 6}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight={isToday ? 700 : 500}
                      className={`tabular ${isToday ? 'fill-amber-600 dark:fill-amber-300' : 'fill-zinc-400 dark:fill-zinc-500'}`}
                    >
                      {short ? formatWeekday(s.day) : dayNum}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      {legend.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Chart colours">
          {legend.map((l) => (
            <li key={l.key} className="flex max-w-full items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
              <Dot color={l.color} />
              <span className="break-words">{l.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted mt-2 text-[11px]">Each day fills in as you log focus time.</p>
      )}
    </div>
  );
}
