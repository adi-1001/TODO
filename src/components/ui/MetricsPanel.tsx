import { Check, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { updateSettings } from '../../db/repo';
import { useBackHandler } from '../../native/backButton';
import { useSettings } from '../../hooks/useData';
import { useMetricValues } from '../../hooks/useMetrics';
import { useToday } from '../../hooks/useNow';
import { useStreakLock } from '../../hooks/useStats';
import { MAX_METRICS, METRIC_OPTIONS, MIN_METRICS } from '../../lib/metrics';
import { DEFAULT_SETTINGS } from '../../db/defaults';
import type { MetricId } from '../../types';
import { ProgressBar } from './controls';

export type MetricPlace = 'overview' | 'review';

const fieldFor = (place: MetricPlace) => (place === 'overview' ? 'overviewMetrics' : 'reviewMetrics');

/** The saved choice for a place, or the defaults when a record from an older version has none. */
function chosenFor(settings: ReturnType<typeof useSettings>, place: MetricPlace): MetricId[] {
  const v = settings[fieldFor(place)];
  return Array.isArray(v) && v.length > 0 ? v : DEFAULT_SETTINGS[fieldFor(place)];
}

export interface MetricsGridProps {
  place: MetricPlace;
  day: string;
  className?: string;
  /**
   * Golden top edges on the tiles. Defaults to "today's streak threshold is locked in" when
   * `day` is today; other days stay plain.
   */
  lit?: boolean;
}

/** The chosen metrics for a place, as glass tiles in a two-column grid. */
export function MetricsGrid({ place, day, className = '', lit }: MetricsGridProps) {
  const settings = useSettings();
  const values = useMetricValues(chosenFor(settings, place), day);
  const today = useToday();
  const lock = useStreakLock();
  const golden = lit ?? (day === today && lock.state === 'locked');
  return (
    <dl className={`grid grid-cols-2 gap-2.5 ${className}`}>
      {values.map((m) => (
        // Opaque in dark mode so the Overview header gradient does not show through the overlap.
        <div key={m.id} className={`glass relative flex flex-col gap-1 rounded-xl p-3 shadow-sm dark:bg-[#1A1E28] ${golden ? 'edge-gold' : ''}`}>
          {golden && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-3 -top-px h-px bg-gradient-to-r from-transparent via-amber-400 to-transparent dark:via-amber-200/90"
            />
          )}
          <dt className="whitespace-normal break-normal text-[11px] font-semibold leading-snug text-zinc-500 dark:text-zinc-400">{m.label}</dt>
          <dd className="tabular whitespace-normal break-normal text-lg font-bold leading-tight tracking-tight text-zinc-900 dark:text-white">{m.value}</dd>
          <dd className="whitespace-normal break-normal text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{m.detail}</dd>
          {m.progress !== undefined && <ProgressBar value={m.progress} className="mt-0.5 h-1" barClassName="bg-amber-500 dark:bg-amber-300" label={m.label} />}
        </div>
      ))}
    </dl>
  );
}

/** Small button with a popover to pick 2 to 4 metrics. Saved in synced settings. */
export function CustomizeMetricsButton({ place, align = 'right' }: { place: MetricPlace; align?: 'left' | 'right' }) {
  const settings = useSettings();
  const chosen = chosenFor(settings, place);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useBackHandler(open, close);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (id: MetricId) => {
    const on = chosen.includes(id);
    if (on && chosen.length <= MIN_METRICS) return;
    if (!on && chosen.length >= MAX_METRICS) return;
    const next = METRIC_OPTIONS.map((o) => o.id).filter((x) => (x === id ? !on : chosen.includes(x)));
    void updateSettings({ [fieldFor(place)]: next });
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        className="icon-btn h-8 w-8"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Customize cards"
        title="Customize cards"
      >
        <SlidersHorizontal size={14} strokeWidth={1.75} />
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Choose cards"
          className={`absolute top-full z-30 mt-1.5 w-64 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#161922] ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <p className="px-2 pb-1.5 pt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            Choose {MIN_METRICS} to {MAX_METRICS} cards. <span className="tabular">{chosen.length}</span> chosen.
          </p>
          <ul className="space-y-0.5">
            {METRIC_OPTIONS.map((o) => {
              const on = chosen.includes(o.id);
              const locked = (on && chosen.length <= MIN_METRICS) || (!on && chosen.length >= MAX_METRICS);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-disabled={locked}
                    onClick={() => toggle(o.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                      locked ? 'cursor-not-allowed opacity-50' : 'hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                    } ${on ? 'font-semibold text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-300'}`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        on ? 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-300 dark:bg-amber-300 dark:text-zinc-950' : 'border-zinc-300 dark:border-zinc-600'
                      }`}
                      aria-hidden
                    >
                      {on && <Check size={12} strokeWidth={2.25} />}
                    </span>
                    {o.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
