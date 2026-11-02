import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { formatDayShort, formatMonthTitle, formatWeekday } from '../../lib/format';
import { periodFor, shiftPeriod, type Period, type PeriodMode } from '../../lib/stats';
import { MINUTE, addDays } from '../../lib/time';
import { Segmented } from '../ui/controls';

/** Surface shared by every card of the Detailed Report: specular glass with a bright top edge in dark mode. */
export const REPORT_CARD = 'card-plain min-w-0 p-4 sm:p-5';

/** Always "Xh Ym", so empty totals read "0h 0m". Rounds down to whole minutes. */
export function hm(ms: number): string {
  const totalMin = Math.floor((Number.isFinite(ms) ? Math.max(0, ms) : 0) / MINUTE);
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}

const MODES: { value: PeriodMode; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export interface PeriodState {
  mode: PeriodMode;
  period: Period;
  canGoNext: boolean;
  setMode: (mode: PeriodMode) => void;
  shift: (dir: -1 | 1) => void;
}

/** Period selection for one card. Switching tabs jumps back to the period containing today. */
export function usePeriod(initialMode: PeriodMode, today: string): PeriodState {
  const [mode, setModeState] = useState<PeriodMode>(initialMode);
  const [anchor, setAnchor] = useState<string>(today);

  const period = useMemo(() => periodFor(mode, anchor), [mode, anchor]);
  const canGoNext = shiftPeriod(mode, period.anchor, 1) <= today;

  const setMode = useCallback(
    (next: PeriodMode) => {
      setModeState(next);
      setAnchor(today);
    },
    [today],
  );

  const shift = useCallback(
    (dir: -1 | 1) => {
      const next = shiftPeriod(mode, period.anchor, dir);
      if (dir === 1 && next > today) return;
      setAnchor(next);
    },
    [mode, period.anchor, today],
  );

  return { mode, period, canGoNext, setMode, shift };
}

export function periodLabel(period: Period, today: string): string {
  if (period.mode === 'daily') {
    if (period.anchor === today) return 'Today';
    if (period.anchor === addDays(today, -1)) return 'Yesterday';
    return `${formatWeekday(period.anchor)}, ${formatDayShort(period.anchor)}`;
  }
  if (period.mode === 'weekly') {
    return `${formatDayShort(period.days[0])} to ${formatDayShort(period.days[period.days.length - 1])}`;
  }
  return formatMonthTitle(period.anchor);
}

interface PeriodControlsProps {
  state: PeriodState;
  today: string;
  label: string;
}

/** Daily | Weekly | Monthly tabs with previous/next arrows and the current period label. */
export function PeriodControls({ state, today, label }: PeriodControlsProps) {
  const { mode, period, canGoNext, setMode, shift } = state;
  const text = periodLabel(period, today);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Segmented label={`${label} period`} value={mode} onChange={setMode} options={MODES} size="sm" />
      <div className="flex items-center gap-1">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label={`Previous ${mode === 'daily' ? 'day' : mode === 'weekly' ? 'week' : 'month'}`}>
          <ChevronLeft size={16} strokeWidth={1.75} />
        </button>
        <span className="tabular min-w-[7.5rem] whitespace-normal break-normal text-center text-xs font-semibold text-zinc-700 dark:text-zinc-200" aria-live="polite">
          {text}
        </span>
        <button
          type="button"
          className="icon-btn disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          onClick={() => shift(1)}
          disabled={!canGoNext}
          aria-label={`Next ${mode === 'daily' ? 'day' : mode === 'weekly' ? 'week' : 'month'}`}
        >
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
