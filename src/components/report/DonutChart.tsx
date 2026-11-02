import { PieChart } from 'lucide-react';
import { memo, useMemo } from 'react';
import { formatHours, formatShort } from '../../lib/format';
import { categorySplit, largestRemainderPercent, subjectBreakdown, type BreakdownRow } from '../../lib/stats';
import type { FocusSession, Subject } from '../../types';
import { Dot, EmptyState } from '../ui/controls';
import { PeriodControls, REPORT_CARD, hm, usePeriod } from './PeriodControls';

interface DonutChartProps {
  sessions: FocusSession[];
  subjects: Subject[];
  today: string;
}

const W = 340;
const H = 240;
const CX = W / 2;
const CY = H / 2;
const R = 68;
const STROKE = 24;
const C = 2 * Math.PI * R;
const LEADER_FROM = R + STROKE / 2 + 2;
const LEADER_ELBOW = R + STROKE / 2 + 16;
const LABEL_X = 122;
const LABEL_GAP = 14;
const MIN_CALLOUT_PCT = 3;

interface Arc {
  row: BreakdownRow;
  len: number;
  offset: number;
}

interface Callout {
  key: string;
  pct: number;
  color: string;
  right: boolean;
  px: number;
  py: number;
  ex: number;
  y: number;
}

/** Spread labels on one side so they are at least LABEL_GAP apart and stay inside the box. */
function spread(items: Callout[]): void {
  items.sort((a, b) => a.y - b.y);
  const minY = 10;
  const maxY = H - 10;
  for (let i = 0; i < items.length; i++) {
    const floor = i === 0 ? minY : items[i - 1].y + LABEL_GAP;
    items[i].y = Math.max(items[i].y, floor);
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const ceil = i === items.length - 1 ? maxY : items[i + 1].y - LABEL_GAP;
    items[i].y = Math.min(items[i].y, ceil);
  }
}

function buildDonut(rows: BreakdownRow[], total: number): { arcs: Arc[]; callouts: Callout[] } {
  const gap = rows.length > 1 ? 2 : 0;
  const arcs: Arc[] = [];
  const left: Callout[] = [];
  const right: Callout[] = [];
  let cum = 0;
  for (const row of rows) {
    const frac = row.ms / total;
    const segLen = frac * C;
    arcs.push({ row, len: Math.max(0, segLen - gap), offset: cum * C });
    if (row.pct >= MIN_CALLOUT_PCT) {
      const theta = -Math.PI / 2 + 2 * Math.PI * (cum + frac / 2);
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const c: Callout = {
        key: row.key,
        pct: row.pct,
        color: row.color,
        right: cos >= 0,
        px: CX + LEADER_FROM * cos,
        py: CY + LEADER_FROM * sin,
        ex: CX + LEADER_ELBOW * cos,
        y: CY + LEADER_ELBOW * sin,
      };
      (c.right ? right : left).push(c);
    }
    cum += frac;
  }
  spread(left);
  spread(right);
  return { arcs, callouts: [...right, ...left] };
}

/** Ring radius bounds as a share of the glow square's half side, used for the gradient stops. */
const GLOW_SIDE = 2 * (R + STROKE + 18);
const GLOW_SIZE_PCT = (GLOW_SIDE / W) * 100;
const GLOW_TOP_PCT = ((CY - GLOW_SIDE / 2) / H) * 100;
const GLOW_HEIGHT_PCT = (GLOW_SIDE / H) * 100;
const ringStop = (r: number) => `${Math.round((r / (GLOW_SIDE / 2)) * 100)}%`;

/**
 * Soft static light behind the ring, tinted by the leading subject. A plain radial gradient,
 * so it costs nothing per frame. Shown in dark mode only.
 */
function AmbientGlow({ color }: { color?: string }) {
  const tint = color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#FCD34D';
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute hidden animate-fade-in dark:block"
      style={{
        left: `${(100 - GLOW_SIZE_PCT) / 2}%`,
        width: `${GLOW_SIZE_PCT}%`,
        top: `${GLOW_TOP_PCT}%`,
        height: `${GLOW_HEIGHT_PCT}%`,
        background: `radial-gradient(closest-side, ${tint}00 ${ringStop(R - STROKE)}, ${tint}38 ${ringStop(R + STROKE / 2)}, ${tint}14 ${ringStop(R + STROKE)}, ${tint}00 100%)`,
      }}
    />
  );
}

/** Subject Time Distribution: donut with percentage callouts, legend and the Current vs. Pending split. */
export const DonutChart = memo(function DonutChart({ sessions, subjects, today }: DonutChartProps) {
  const ps = usePeriod('monthly', today);
  const { period } = ps;

  const rows = useMemo(() => subjectBreakdown(sessions, subjects, period.from, period.to), [sessions, subjects, period.from, period.to]);
  const split = useMemo(() => categorySplit(sessions, period.from, period.to), [sessions, period.from, period.to]);

  const total = rows.reduce((a, r) => a + r.ms, 0);
  const donut = useMemo(() => (total > 0 ? buildDonut(rows, total) : null), [rows, total]);

  const ariaLabel =
    total > 0
      ? `Subject time distribution, ${formatHours(total)} in total: ${rows.map((r) => `${r.name} ${r.pct}%`).join(', ')}.`
      : 'Subject time distribution: no focus in this period.';

  return (
    <section className={`${REPORT_CARD} flex flex-col gap-4`} aria-labelledby="report-donut-title">
      <h2 id="report-donut-title" className="section-title">
        Subject Time Distribution
      </h2>
      <PeriodControls state={ps} today={today} label="Subject Time Distribution" />

      {!donut ? (
        <>
          <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
            <div className="mx-auto w-full max-w-[420px]">
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} className="block">
                <circle cx={CX} cy={CY} r={R} fill="none" strokeWidth={STROKE} className="stroke-zinc-100 dark:stroke-white/[0.05]" />
                <text x={CX} y={CY - 6} textAnchor="middle" dominantBaseline="central" fontSize={20} fontWeight={700} className="tabular fill-zinc-900 dark:fill-white">
                  {hm(0)}
                </text>
                <text x={CX} y={CY + 14} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={500} className="fill-zinc-500 dark:fill-zinc-400">
                  Total
                </text>
              </svg>
            </div>
            <EmptyState icon={<PieChart size={20} strokeWidth={1.75} />} title="No focus in this period" hint="Choose another period, or Start Focus on a task to fill this in." />
          </div>
          <CategorySplitBar current={0} pending={0} other={0} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
            <div className="relative mx-auto w-full max-w-[420px]">
              <AmbientGlow color={rows[0]?.color} />
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} className="relative block">
                <circle cx={CX} cy={CY} r={R} fill="none" strokeWidth={STROKE} className="stroke-zinc-100 dark:stroke-white/[0.05]" />
                <g className="animate-fade-in">
                <g transform={`rotate(-90 ${CX} ${CY})`}>
                  {donut.arcs.map((a) => (
                    <circle
                      key={a.row.key}
                      cx={CX}
                      cy={CY}
                      r={R}
                      fill="none"
                      stroke={a.row.color}
                      strokeWidth={STROKE}
                      strokeDasharray={`${a.len} ${C - a.len}`}
                      strokeDashoffset={-a.offset}
                    >
                      <title>{`${a.row.name}, ${formatShort(a.row.ms)}, ${a.row.pct}%`}</title>
                    </circle>
                  ))}
                </g>
                </g>

                {donut.callouts.map((c) => {
                  const lx = c.right ? CX + LABEL_X : CX - LABEL_X;
                  return (
                    <g key={c.key} aria-hidden>
                      <polyline points={`${c.px},${c.py} ${c.ex},${c.y} ${lx},${c.y}`} fill="none" stroke={c.color} strokeWidth={1} strokeLinejoin="round" opacity={0.8} />
                      <circle cx={c.px} cy={c.py} r={1.6} fill={c.color} />
                      <text
                        x={c.right ? lx + 4 : lx - 4}
                        y={c.y}
                        textAnchor={c.right ? 'start' : 'end'}
                        dominantBaseline="central"
                        fontSize={11}
                        fontWeight={600}
                        className="tabular fill-zinc-600 dark:fill-zinc-300"
                      >
                        {`${c.pct}%`}
                      </text>
                    </g>
                  );
                })}

                <text x={CX} y={CY - 6} textAnchor="middle" dominantBaseline="central" fontSize={20} fontWeight={700} className="tabular fill-zinc-900 dark:fill-white">
                  {formatHours(total)}
                </text>
                <text x={CX} y={CY + 14} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={500} className="fill-zinc-500 dark:fill-zinc-400">
                  Total
                </text>
              </svg>
            </div>

            <ul className="custom-scroll max-h-64 space-y-2 overflow-y-auto pr-1" aria-label="Legend">
              {rows.map((r) => (
                <li key={r.key} className="flex items-start gap-2 text-xs leading-relaxed">
                  <Dot color={r.color} className="mt-1" />
                  <span className="min-w-0 flex-1 break-words whitespace-normal font-medium leading-relaxed text-zinc-700 dark:text-zinc-200">{r.name}</span>
                  <span className="tabular shrink-0 text-zinc-500 dark:text-zinc-400">{formatShort(r.ms)}</span>
                  <span className="tabular w-9 shrink-0 text-right font-semibold text-zinc-800 dark:text-zinc-100">{r.pct}%</span>
                </li>
              ))}
            </ul>
          </div>

          <CategorySplitBar current={split.current} pending={split.pending} other={split.other} />
        </>
      )}
    </section>
  );
});

const SPLIT_STYLE = {
  current: 'bg-emerald-500 dark:bg-emerald-400',
  pending: 'bg-amber-400 dark:bg-amber-300',
  other: 'bg-zinc-300 dark:bg-zinc-600',
} as const;

function CategorySplitBar({ current, pending, other }: { current: number; pending: number; other: number }) {
  const [pc, pp, po] = largestRemainderPercent([current, pending, other]);
  const parts = [
    { id: 'current' as const, label: 'Current Topics', ms: current, pct: pc },
    { id: 'pending' as const, label: 'Pending Topics', ms: pending, pct: pp },
    ...(other > 0 ? [{ id: 'other' as const, label: 'Other', ms: other, pct: po }] : []),
  ];
  const summary = parts.map((p) => `${p.label} ${p.pct}%`).join(', ');

  return (
    <div className="border-t border-zinc-200 pt-4 dark:border-white/[0.07]">
      <div className="mb-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Current vs. Pending</div>
      <div role="img" aria-label={`Current vs. Pending: ${summary}`} className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
        {parts
          .filter((p) => p.ms > 0)
          .map((p) => (
            <div key={p.id} className={`h-full ${SPLIT_STYLE[p.id]}`} style={{ flexGrow: p.ms, flexBasis: 0 }} title={`${p.label}, ${formatShort(p.ms)}, ${p.pct}%`} />
          ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
        {parts.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5 text-xs">
            <span className={`h-2.5 w-2.5 rounded-sm ${SPLIT_STYLE[p.id]}`} aria-hidden />
            <span className="font-medium text-zinc-700 dark:text-zinc-200">{p.label}</span>
            <span className="tabular text-zinc-500 dark:text-zinc-400">{formatShort(p.ms)}</span>
            <span className="tabular font-semibold text-zinc-800 dark:text-zinc-100">{p.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
