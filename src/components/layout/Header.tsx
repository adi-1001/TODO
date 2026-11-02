import { CalendarClock, Moon, Plus, Sun } from 'lucide-react';
import { useSettings } from '../../hooks/useData';
import { useNow, useToday } from '../../hooks/useNow';
import { useSyncInfo } from '../../hooks/useStats';
import { formatDayTitle, greetingFor } from '../../lib/format';
import { usePrefs } from '../../state/PrefsProvider';
import { useUI, type TimelineRange } from '../../state/UIProvider';
import { Segmented } from '../ui/controls';
import { BrandIcon, SyncDot, examCountdown } from './Sidebar';
import { TimerPill } from './TimerPill';

const RANGES: { value: TimelineRange; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/** Shown above the main card below lg: brand, sync status with the Sync ID, and theme toggle. */
export function MobileTopBar() {
  const { prefs, toggleTheme } = usePrefs();
  const { navigate } = useUI();
  const sync = useSyncInfo();
  return (
    <div className="mb-3 flex items-center justify-between gap-2 px-1 lg:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <BrandIcon />
        <button
          type="button"
          onClick={() => navigate('settings', 'sync')}
          className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg px-1 py-1 text-left text-[11px] font-semibold leading-snug text-zinc-500 dark:text-zinc-400"
          aria-label={`Sync settings. Sync ID ${prefs.syncId}`}
        >
          <span className="flex h-[1.375em] shrink-0 items-center" aria-hidden>
            <SyncDot status={sync.status} />
          </span>
          <span className="shrink-0 whitespace-nowrap">Sync ID:</span>{' '}
          {/* One unbroken token: when the row is too narrow it moves whole onto its own line. */}
          <span className="whitespace-nowrap font-mono text-zinc-700 dark:text-zinc-200">{prefs.syncId}</span>
        </button>
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        className="icon-btn shrink-0 border border-zinc-200 dark:border-white/10"
        aria-label={prefs.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {prefs.theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
      </button>
    </div>
  );
}

/** Greeting, refreshed once a minute in its own component so the header does not re-render. */
function Greeting({ name }: { name: string }) {
  const now = useNow(60_000);
  return (
    <h1 className="break-words whitespace-normal text-lg font-bold leading-relaxed tracking-tight text-zinc-900 dark:text-white sm:text-xl">
      {`${greetingFor(now)}${name ? `, ${name}` : ''}`}
    </h1>
  );
}

export function Header() {
  const today = useToday();
  const settings = useSettings();
  const { timelineRange, setTimelineRange, openTask } = useUI();
  const countdown = examCountdown(settings, today);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <Greeting name={settings.displayName.trim()} />
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatDayTitle(today)}</span>
          {countdown && (
            <span className="tabular inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-200">
              <CalendarClock size={14} strokeWidth={1.75} aria-hidden />
              {countdown}
            </span>
          )}
        </div>
      </div>

      {/* Full width on a phone, so the timer bar's task selector gets the whole row. */}
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2.5 sm:w-auto">
        <TimerPill />
        <div className="hidden md:block">
          <Segmented label="Timeline range" value={timelineRange} onChange={setTimelineRange} options={RANGES} />
        </div>
        <button type="button" className="btn-primary" onClick={() => openTask()}>
          <Plus size={14} strokeWidth={1.75} aria-hidden />
          New Task
        </button>
      </div>
      <div className="w-full md:hidden">
        <Segmented label="Timeline range" value={timelineRange} onChange={setTimelineRange} options={RANGES} size="sm" />
      </div>
    </header>
  );
}
