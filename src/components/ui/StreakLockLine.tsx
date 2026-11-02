import { CircleCheck } from 'lucide-react';
import { useStreakLock } from '../../hooks/useStats';
import { hm } from '../../lib/metrics';
import { MINUTE } from '../../lib/time';

/** Rounds up to the next whole minute, so a few seconds left never reads as "0h 0m". */
const ceilMinute = (ms: number) => Math.ceil(Math.max(0, ms) / MINUTE) * MINUTE;

/** One calm line about today and the streak: focus still needed, locked in, or a rest day. */
export function StreakLockLine({ className = '' }: { className?: string }) {
  const lock = useStreakLock();

  if (lock.state === 'locked') {
    return (
      <p className={className} role="status">
        <span className="relative inline-flex max-w-full items-start gap-1 rounded-2xl border border-amber-400/50 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 shadow-[0_0_10px_rgba(245,158,11,0.2)] dark:border-amber-300/30 dark:border-t-amber-200/50 dark:bg-amber-400/10 dark:text-amber-100">
          {/* Soft amber glow that breathes with opacity only; the text above it stays still. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 animate-glow-pulse rounded-2xl shadow-[0_0_14px_rgba(245,158,11,0.3)] dark:shadow-[0_0_18px_rgba(245,158,11,0.45)]" />
          <CircleCheck size={14} strokeWidth={1.75} className="relative mt-px shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
          <span className="relative whitespace-normal break-normal leading-snug">Streak locked in for today ({lock.percent}%+ goal reached)</span>
        </span>
      </p>
    );
  }

  if (lock.state === 'rest') {
    return (
      <p className={`text-[11px] text-sky-700 dark:text-sky-300 ${className}`} role="status">
        Rest day: your streak is paused, not reset.
      </p>
    );
  }

  return (
    <p className={`muted tabular text-[11px] ${className}`} role="status">
      {hm(ceilMinute(lock.remainingMs))} more needed today to reach {lock.percent}% ({hm(lock.thresholdMs)}) and extend streak
    </p>
  );
}
