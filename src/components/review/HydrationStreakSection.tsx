import { CalendarDays, Droplets, Flame, Minus, Plus } from 'lucide-react';
import { MAX_GLASSES, changeHydration, setRestDay } from '../../db/repo';
import { useDayMeta, useHydration, useSettings } from '../../hooks/useData';
import { useStreakInfo, useStreakLock } from '../../hooks/useStats';
import { hm } from '../../lib/metrics';
import { Switch } from '../ui/controls';
import { LiquidBar } from '../ui/LiquidBar';
import { StreakLockLine } from '../ui/StreakLockLine';
import { ReviewSection } from './ReviewSection';

const STEP_BTN = 'icon-btn press border border-zinc-200 dark:border-white/10 dark:border-t-white/[0.16] dark:bg-white/[0.03]';

export function HydrationStreakSection({ date }: { date: string }) {
  const settings = useSettings();
  const glasses = useHydration(date);
  const meta = useDayMeta(date);
  const { streak, consistency, today, thresholdMs, thresholdPercent } = useStreakInfo();
  const lock = useStreakLock();
  const isToday = date === today;
  // The streak tile catches the golden top edge once today counts toward the streak.
  const locked = isToday && lock.state === 'locked';
  const goal = Math.max(1, settings.hydrationGoal);
  const restDay = meta?.restDay ?? false;
  const step = (delta: number) => void changeHydration(date, delta, settings.hydrationGoal);
  return (
    <ReviewSection title="Hydration and Streak">
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        <div className="glass relative overflow-hidden p-4">
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 hidden h-16 bg-gradient-to-b from-sky-300/[0.07] to-transparent dark:block" />
          <div className="muted relative flex items-center gap-1.5 text-[11px] font-semibold">
            <Droplets size={14} strokeWidth={1.75} className="text-sky-500 dark:text-sky-400" />
            Water
          </div>
          <div className="relative mt-1.5 flex flex-wrap items-center justify-between gap-3">
            <div className="tabular text-2xl font-bold tracking-tight text-zinc-900 dark:text-white" aria-live="polite">
              {glasses} / {goal} <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Glasses</span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className={STEP_BTN} onClick={() => step(-1)} disabled={glasses <= 0} aria-label="Remove one glass">
                <Minus size={16} strokeWidth={1.75} />
              </button>
              <button type="button" className={STEP_BTN} onClick={() => step(1)} disabled={glasses >= MAX_GLASSES} aria-label="Add one glass">
                <Plus size={16} strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <LiquidBar value={glasses / goal} tone="sky" spark={false} growIn className="relative mt-3 h-1.5" label="Glasses of water against the daily goal" />
        </div>
        <div className={`glass relative grid grid-cols-2 gap-3 overflow-hidden p-4 ${locked ? 'edge-gold' : ''}`}>
          {locked && <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 hidden h-16 bg-gradient-to-b from-amber-300/[0.08] to-transparent dark:block" />}
          <div className="relative">
            <div className="muted flex items-center gap-1.5 whitespace-normal break-normal text-[11px] font-semibold">
              <Flame size={14} strokeWidth={1.75} className={`shrink-0 ${locked ? 'text-amber-500 dark:text-amber-300' : ''}`} />
              Current streak
            </div>
            <div className="tabular mt-1.5 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {streak} <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">{streak === 1 ? 'day' : 'days'}</span>
            </div>
          </div>
          <div className="relative">
            <div className="muted flex items-center gap-1.5 whitespace-normal break-normal text-[11px] font-semibold">
              <CalendarDays size={14} strokeWidth={1.75} className="shrink-0" />
              30-day consistency
            </div>
            <div className="tabular mt-1.5 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{consistency}%</div>
          </div>
          {isToday && <StreakLockLine className="relative col-span-2 -mt-1" />}
        </div>
      </div>
      <div className="mt-4 flex items-start justify-between gap-3 border-t border-zinc-200/70 pt-4 dark:border-white/[0.06]">
        <div className="min-w-[140px] flex-1">
          <div className="whitespace-normal break-normal text-sm font-medium text-zinc-800 dark:text-zinc-100">Rest / Sick Day (pauses the streak)</div>
          <p className="muted mt-0.5 whitespace-normal break-normal text-xs">
            A day counts once focus reaches {thresholdPercent}% of your daily goal ({hm(thresholdMs)}). Rest days pause your streak instead of resetting it.
          </p>
        </div>
        <div className="shrink-0">
          <Switch checked={restDay} onChange={(v) => void setRestDay(date, v)} label="Rest / Sick Day (pauses the streak)" />
        </div>
      </div>
    </ReviewSection>
  );
}
