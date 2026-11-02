import { useMemo } from 'react';
import { Bell, BookOpen } from 'lucide-react';
import { updateSettings } from '../../db/repo';
import { useBlocks, useSettings, useSubjects, useTasks } from '../../hooks/useData';
import { useLiveSessions } from '../../hooks/useLiveSessions';
import { useToday } from '../../hooks/useNow';
import { bucketKey, categorySplit, clipMs, countedSessions, focusMsInRange, largestRemainderPercent, subjectBreakdown } from '../../lib/stats';
import { MINUTE, dayEnd, dayStart } from '../../lib/time';
import { goalTone } from '../../lib/solarPhase';
import { EmptyState, Switch } from '../ui/controls';
import { LiquidBar } from '../ui/LiquidBar';
import { AudioDock } from './AudioDock';

/** Amber-gold share of the day spent on current topics. */
const CURRENT_FILL = 'bg-gradient-to-r from-amber-300 to-orange-300 dark:from-amber-400/70 dark:to-orange-400/60';

const BELL_OPTIONS = [5, 10, 15, 20, 30];

/** "#RRGGBB" plus a two-digit hex alpha; any other colour format is returned as it is. */
const withAlpha = (color: string, alpha: string) => (/^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color);

/** Always "Xh Ym", for example "0h 0m" or "5h 40m". */
export function formatHM(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / MINUTE);
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}

export function SummaryToday() {
  const today = useToday();
  const sessions = useLiveSessions();
  const settings = useSettings();
  const blocks = useBlocks();
  const subjects = useSubjects();
  const tasks = useTasks();

  const from = dayStart(today);
  const to = dayEnd(today);

  const todayMs = useMemo(() => focusMsInRange(sessions, from, to), [sessions, from, to]);
  const split = useMemo(() => categorySplit(sessions, from, to), [sessions, from, to]);
  const breakMs = useMemo(() => clipMs(blocks.filter((b) => b.kind === 'break'), from, to), [blocks, from, to]);
  const rows = useMemo(() => subjectBreakdown(sessions, subjects, from, to), [sessions, subjects, from, to]);

  // Most-studied task today within each subject row.
  const topTaskByBucket = useMemo(() => {
    const perBucket = new Map<string, Map<string, number>>();
    for (const s of countedSessions(sessions)) {
      if (!s.taskId) continue;
      const ms = clipMs(s.segments, from, to);
      if (ms <= 0) continue;
      const k = bucketKey(s);
      let m = perBucket.get(k);
      if (!m) perBucket.set(k, (m = new Map()));
      m.set(s.taskId, (m.get(s.taskId) ?? 0) + ms);
    }
    const titles = new Map(tasks.map((t) => [t.id, t.title]));
    const out = new Map<string, string>();
    for (const [k, m] of perBucket) {
      let best: string | null = null;
      let bestMs = -1;
      for (const [taskId, ms] of m) {
        if (ms > bestMs && titles.has(taskId)) {
          best = taskId;
          bestMs = ms;
        }
      }
      if (best) out.set(k, titles.get(best)!);
    }
    return out;
  }, [sessions, tasks, from, to]);

  const goalMs = Math.max(0, settings.dailyGoalMinutes) * MINUTE;
  const goalRatio = goalMs > 0 ? todayMs / goalMs : 0;

  const parts = [
    { key: 'current', label: 'Current Topics', ms: split.current + split.other, bar: CURRENT_FILL, swatch: CURRENT_FILL },
    { key: 'pending', label: 'Pending Topics', ms: split.pending, bar: 'bg-rose-soft dark:bg-rose-400/40', swatch: 'bg-rose-soft dark:bg-rose-400/60' },
    { key: 'breaks', label: 'Breaks', ms: breakMs, bar: 'bg-taupe dark:bg-zinc-700', swatch: 'bg-taupe dark:bg-zinc-600' },
  ];
  const pcts = largestRemainderPercent(parts.map((p) => p.ms));
  const anything = parts.some((p) => p.ms > 0);

  return (
    <section className="space-y-5" aria-labelledby="summary-today-title">
      <div className="space-y-3">
        <h2 id="summary-today-title" className="section-title">
          Summary Today
        </h2>
        <div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Focus Hours</div>
          <div className="tabular text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">{formatHM(todayMs)}</div>
        </div>

        <div className="space-y-1.5">
          <LiquidBar value={goalRatio} tone={goalTone(goalRatio)} spark label="Progress toward daily goal" className="h-2" />
          <div className="flex justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span>
              <span className="tabular">{Math.round(goalRatio * 100)}%</span> of daily goal
            </span>
            <span className="tabular">{formatHM(goalMs)}</span>
          </div>
        </div>

        <div className="flex h-7 items-center gap-2 pt-1" role="img" aria-label={parts.map((p, i) => `${p.label} ${pcts[i]}%`).join(', ')}>
          {anything ? (
            parts
              .filter((p) => p.ms > 0)
              .map((p) => <div key={p.key} className={`h-full min-w-[6px] rounded-lg ${p.bar}`} style={{ flexGrow: p.ms, flexBasis: 0 }} />)
          ) : (
            <div className="h-full w-full rounded-lg bg-zinc-100 dark:bg-white/5" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-zinc-600 dark:text-zinc-400">
          {parts.map((p, i) => (
            <span key={p.key} className="flex items-center gap-1.5">
              <span aria-hidden className={`h-2.5 w-2.5 rounded ${p.swatch}`} />
              {p.label} <span className="tabular">({pcts[i]}%)</span>
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2.5 border-t border-zinc-200/60 pt-3 text-xs dark:border-white/10">
        <h3 className="font-bold text-zinc-500 dark:text-zinc-400">Subject Breakdown</h3>
        {rows.length === 0 ? (
          <EmptyState icon={<BookOpen size={18} strokeWidth={1.75} />} title="No focus logged today" hint="Start Focus on a task and its subject will show here." />
        ) : (
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.key} className="flex items-stretch gap-3 py-1">
                {/* Colour-matched glow bar in the subject colour. */}
                <span aria-hidden className="w-[3px] shrink-0 rounded-full" style={{ backgroundColor: r.color, boxShadow: `0 0 8px ${withAlpha(r.color, '99')}, 0 0 2px ${r.color}` }} />
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full" style={{ color: r.color }} aria-hidden>
                  <span className="absolute inset-0 rounded-full opacity-[0.15] dark:opacity-25" style={{ backgroundColor: r.color }} />
                  <BookOpen size={15} strokeWidth={1.75} className="relative" />
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-start justify-end gap-x-3 gap-y-1">
                  <div className="min-w-[140px] flex-1">
                    <div className="break-words whitespace-normal font-bold leading-relaxed text-zinc-900 dark:text-white">{r.name}</div>
                    <div className="break-words whitespace-normal text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">{topTaskByBucket.get(r.key) ?? 'General focus'}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="tabular font-medium text-zinc-500 dark:text-zinc-400">{formatHM(r.ms)}</span>
                    <span className="tabular rounded-lg bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-white/5 dark:text-zinc-300">{r.pct}%</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <IntervalBell enabled={settings.bellEnabled} minutes={settings.bellIntervalMinutes} />
        <AudioDock />
      </div>
    </section>
  );
}

function IntervalBell({ enabled, minutes }: { enabled: boolean; minutes: number }) {
  const options = BELL_OPTIONS.includes(minutes) ? BELL_OPTIONS : [...BELL_OPTIONS, minutes].sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap items-center gap-3 py-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300" aria-hidden>
        <Bell size={15} strokeWidth={1.75} />
      </span>
      <div className="min-w-[6rem] flex-1 whitespace-normal break-normal">
        <div className="font-bold text-zinc-900 dark:text-white">Interval Bell</div>
        <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Every <span className="tabular">{minutes}</span> mins
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <label htmlFor="bell-interval" className="sr-only">
          Bell interval in minutes
        </label>
        <select
          id="bell-interval"
          value={minutes}
          onChange={(e) => void updateSettings({ bellIntervalMinutes: Number(e.target.value) })}
          className="tabular rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 focus:outline-none dark:border-white/10 dark:bg-[#12151C] dark:text-zinc-300"
        >
          {options.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
        <Switch checked={enabled} onChange={(v) => void updateSettings({ bellEnabled: v })} label="Interval Bell" />
      </div>
    </div>
  );
}
