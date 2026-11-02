import {
  ChartColumn,
  ChevronRight,
  CirclePause,
  LayoutGrid,
  Library,
  Maximize2,
  Moon,
  NotebookPen,
  PictureInPicture2,
  Settings,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { UserSettings } from '../../types';
import { setRestDay } from '../../db/repo';
import { useSettings } from '../../hooks/useData';
import { syncStatusText, useStreakInfo, useSyncInfo } from '../../hooks/useStats';
import { daysBetween } from '../../lib/time';
import { usePrefs } from '../../state/PrefsProvider';
import { useUI, type View } from '../../state/UIProvider';
import type { SyncStatus } from '../../sync/syncEngine';
import { Switch } from '../ui/controls';

const ICON = { size: 16, strokeWidth: 1.75 } as const;

/** "12 days to Finals", "Exam day", or null when no upcoming exam is set. */
export function examCountdown(settings: UserSettings, today: string): string | null {
  if (!settings.targetExamDate) return null;
  const days = daysBetween(today, settings.targetExamDate);
  if (days < 0) return null;
  if (days === 0) return 'Exam day';
  const title = settings.targetExamTitle.trim() || 'exam';
  return `${days} ${days === 1 ? 'day' : 'days'} to ${title}`;
}

export function SyncDot({ status }: { status: SyncStatus }) {
  const color =
    status === 'cloud'
      ? 'bg-emerald-500 dark:bg-emerald-400'
      : status === 'connecting' || status === 'paused'
        ? 'bg-amber-400 dark:bg-amber-300'
        : status === 'error'
          ? 'bg-zinc-400 dark:bg-zinc-500'
          : 'bg-sky-500 dark:bg-sky-400';
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden />;
}

/** Brand mark shared by the sidebar and the phone top bar. */
export function BrandIcon() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-amber-200 dark:bg-amber-300/90 dark:text-zinc-950" aria-hidden>
      <Timer size={17} strokeWidth={1.75} />
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
  trailing,
  title,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
  trailing?: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={active ? 'page' : undefined}
      className={`press relative flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs transition ${
        active
          ? 'bg-zinc-200/75 font-semibold text-zinc-900 dark:bg-white/[0.07] dark:text-white dark:shadow-[inset_2px_0_0_#FCD34D]'
          : 'font-medium text-zinc-600 hover:bg-zinc-200/40 dark:text-zinc-400 dark:hover:bg-white/5'
      }`}
    >
      <span className="flex items-center gap-3">
        <Icon {...ICON} aria-hidden />
        {label}
      </span>
      {trailing}
    </button>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{children}</div>;
}

const NAV: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'syllabus', label: 'Syllabus Tracker', icon: Library },
  { view: 'report', label: 'Detailed Report', icon: ChartColumn },
  { view: 'review', label: 'Evening Review', icon: NotebookPen },
  { view: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { view, navigate, openMilestones, setClockOpen } = useUI();
  const { prefs, setPrefs, toggleTheme } = usePrefs();
  const sync = useSyncInfo();
  const settings = useSettings();
  const { streak, consistency, todayIsRest, today, thresholdPercent } = useStreakInfo();
  const streakRule = `A day counts toward the streak once focus reaches ${thresholdPercent}% of the daily goal. Rest days pause the streak instead of resetting it.`;
  const name = settings.displayName.trim();
  const countdown = examCountdown(settings, today);
  const status = syncStatusText(sync);

  return (
    <aside className="sticky top-6 hidden h-[calc(100dvh-3rem)] w-60 shrink-0 select-none flex-col justify-between px-1 py-2 lg:flex">
      <div className="custom-scroll space-y-5 overflow-y-auto pr-1">
        <div className="card-plain flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <BrandIcon />
            <div>
              <div className="text-sm font-bold leading-none text-zinc-900 dark:text-white">Study Space</div>
              <div className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">PC and phone</div>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">PWA</span>
        </div>

        <button
          type="button"
          onClick={() => navigate('settings', 'sync')}
          className="card-plain w-full space-y-1.5 p-3 text-left transition hover:border-amber-400/60 dark:hover:border-amber-300/30"
          aria-label={`Sync settings. Sync ID ${prefs.syncId}. ${status}`}
        >
          <div className="flex items-start justify-between gap-2 text-[11px] leading-snug">
            <span className="flex min-w-0 items-start gap-1.5 font-semibold text-zinc-700 dark:text-zinc-200">
              <span className="flex h-[1.375em] shrink-0 items-center" aria-hidden>
                <SyncDot status={sync.status} />
              </span>
              <span className="min-w-0 break-words whitespace-normal">{status}</span>
            </span>
            <ChevronRight size={14} strokeWidth={1.75} className="mt-px shrink-0 text-zinc-400" aria-hidden />
          </div>
          <div className="flex flex-wrap gap-x-1 rounded-xl bg-zinc-100 px-2.5 py-1.5 font-mono text-[11px] font-semibold leading-snug text-zinc-800 dark:bg-white/[0.05] dark:text-amber-200">
            <span className="whitespace-nowrap">Sync ID:</span> <span className="whitespace-nowrap">{prefs.syncId}</span>
          </div>
        </button>

        <nav aria-label="Main" className="space-y-1">
          <GroupLabel>Main</GroupLabel>
          <NavItem icon={LayoutGrid} label="Dashboard" active={view === 'dashboard'} onClick={() => navigate('dashboard')} />
          <NavItem icon={Maximize2} label="Full-Screen Clock" onClick={() => setClockOpen(true)} />
          {NAV.map((n) => (
            <NavItem key={n.view} icon={n.icon} label={n.label} active={view === n.view} onClick={() => navigate(n.view)} />
          ))}
        </nav>

        <div className="space-y-1">
          <GroupLabel>Focus</GroupLabel>
          <div className="flex items-center justify-between rounded-xl px-3.5 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            <span className="flex items-center gap-3">
              <PictureInPicture2 {...ICON} aria-hidden />
              Floating Mini-Timer
            </span>
            <Switch size="sm" checked={prefs.miniOpen} onChange={(v) => setPrefs({ miniOpen: v })} label="Floating Mini-Timer" />
          </div>
          <NavItem
            icon={CirclePause}
            label="Pause Streak"
            title={streakRule}
            onClick={() => void setRestDay(today, !todayIsRest)}
            trailing={
              <span className={`text-[10px] font-semibold ${todayIsRest ? 'text-sky-600 dark:text-sky-300' : 'text-zinc-400 dark:text-zinc-500'}`}>
                {todayIsRest ? 'Rest day' : 'Off'}
              </span>
            }
          />
        </div>

        <div className="border-t border-zinc-200/70 pt-2 dark:border-white/10">
          <div className="flex items-center justify-between rounded-xl px-3.5 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            <span className="flex items-center gap-3">
              <Moon {...ICON} aria-hidden />
              Dark Mode
            </span>
            <Switch checked={prefs.theme === 'dark'} onChange={toggleTheme} label="Dark Mode" />
          </div>
        </div>
      </div>

      <button type="button" onClick={openMilestones} className="card-plain mt-4 flex items-center justify-between gap-2 p-3 text-left" title={`Milestones. ${streakRule}`}>
        <div className="flex min-w-0 items-start gap-3">
          {settings.avatarDataUrl ? (
            <img src={settings.avatarDataUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 to-orange-200 text-xs font-bold text-zinc-900 dark:from-amber-500 dark:to-orange-300" aria-hidden>
              {(name[0] ?? 'S').toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="break-words whitespace-normal text-xs font-bold leading-relaxed text-zinc-900 dark:text-white">{name || 'Student'}</div>
            <div className="tabular break-words whitespace-normal text-[10px] font-medium leading-snug text-zinc-500 dark:text-zinc-400">
              {streak} day streak, {consistency}% over 30 days
            </div>
            {countdown && <div className="tabular break-words whitespace-normal text-[10px] font-medium leading-snug text-zinc-400 dark:text-zinc-500">{countdown}</div>}
          </div>
        </div>
        <ChevronRight size={14} strokeWidth={1.75} className="shrink-0 text-zinc-400" aria-hidden />
      </button>
    </aside>
  );
}
