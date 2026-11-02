import { Lightbulb } from 'lucide-react';
import { toggleRootCause } from '../../db/repo';
import { useDayMeta } from '../../hooks/useData';
import { ROOT_CAUSES, bottleneckText, rootCauseMeta, type Bottleneck } from '../../lib/backlog';

const PILL = 'press min-h-9 rounded-full border px-3 py-1.5 text-left text-xs font-semibold leading-snug whitespace-normal break-normal transition';
const PILL_ON = 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-300/80 dark:bg-amber-300/90 dark:text-zinc-950';
const PILL_OFF = 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:border-t-white/[0.16] dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:border-white/20 dark:hover:text-white';

/** One-tap "What went wrong?" reasons for a day. Several can be on at once; tap again to clear. */
export function RootCausePills({ day, label }: { day: string; label: string }) {
  const meta = useDayMeta(day);
  const picked = meta?.rootCauses ?? [];
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {ROOT_CAUSES.map((c) => {
        const on = picked.includes(c.value);
        return (
          <button key={c.value} type="button" aria-pressed={on} className={`${PILL} ${on ? PILL_ON : PILL_OFF}`} onClick={() => void toggleRootCause(day, c.value)}>
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/** "Top Bottleneck This Week" with a one-line fix for the most frequent reason. */
export function BottleneckInsight({ bottlenecks }: { bottlenecks: Bottleneck[] }) {
  const text = bottleneckText(bottlenecks);
  if (!text) {
    return (
      <p className="muted whitespace-normal break-normal text-xs leading-relaxed">
        Top Bottleneck This Week: nothing tapped in the last 7 days. When a day goes off plan, tap what got in the way and the main reason shows here with a fix.
      </p>
    );
  }
  const top = rootCauseMeta(bottlenecks[0].cause);
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5 dark:border-amber-300/20 dark:bg-amber-300/[0.06]" aria-live="polite">
      <div className="text-[10px] font-bold uppercase tracking-widest text-amber-800 dark:text-amber-200">Top Bottleneck This Week</div>
      <p className="mt-1 whitespace-normal break-normal text-sm font-semibold leading-relaxed text-zinc-900 dark:text-zinc-50">Main reason for backlog this week: {text}</p>
      <p className="mt-1 flex items-start gap-1.5 whitespace-normal break-normal text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
        <Lightbulb size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        <span className="min-w-0">{top.fix}</span>
      </p>
    </div>
  );
}
