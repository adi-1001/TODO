import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { hashFor, useUI } from '../../state/UIProvider';
import { AudioSection } from './AudioSection';
import { DataSection } from './DataSection';
import { NotificationsSection } from './NotificationsSection';
import { ProfileSection } from './ProfileSection';
import { ScheduleSection } from './ScheduleSection';
import { SyncSection } from './SyncSection';
import { TimerSection } from './TimerSection';
import { SETTINGS_SECTIONS, type SettingsSectionId } from './shared';

const HIGHLIGHT_MS = 1600;
// Runs after navigate() has started its scroll to the top, so this scroll wins.
const SCROLL_DELAY_MS = 60;

const isSection = (v: string | null): v is SettingsSectionId => SETTINGS_SECTIONS.some((s) => s.id === v);

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function SettingsView() {
  const { section, navigate } = useUI();
  const [highlight, setHighlight] = useState<SettingsSectionId | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>();

  const reveal = useCallback((id: SettingsSectionId) => {
    const el = document.getElementById(`settings-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    setHighlight(id);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
  }, []);

  useEffect(() => {
    if (!isSection(section)) return;
    const t = setTimeout(() => reveal(section), SCROLL_DELAY_MS);
    return () => clearTimeout(t);
  }, [section, reveal]);

  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  const onPill = (e: MouseEvent<HTMLAnchorElement>, id: SettingsSectionId) => {
    e.preventDefault();
    if (section === id) setTimeout(() => reveal(id), SCROLL_DELAY_MS);
    navigate('settings', id);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Settings</h1>
        <p className="muted mt-0.5 text-sm">Profile, timer, classes, notifications, audio, sync and your data.</p>
      </header>

      <nav aria-label="Settings sections">
        <ul className="flex flex-wrap gap-1.5">
          {SETTINGS_SECTIONS.map((s) => (
            <li key={s.id} className="max-w-full">
              <a
                href={hashFor('settings', s.id)}
                onClick={(e) => onPill(e, s.id)}
                aria-current={section === s.id ? 'location' : undefined}
                className={`press inline-flex max-w-full items-center whitespace-normal break-normal rounded-full border px-3 py-1.5 text-left text-xs font-semibold leading-snug transition ${
                  section === s.id
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-300/80 dark:bg-amber-300/90 dark:text-zinc-950 dark:shadow-[0_0_14px_rgba(252,211,77,0.22)]'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:border-t-white/[0.16] dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:bg-white/[0.07]'
                }`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <ProfileSection highlighted={highlight === 'profile'} />
      <TimerSection highlighted={highlight === 'timer'} />
      <ScheduleSection highlighted={highlight === 'schedule'} />
      <NotificationsSection highlighted={highlight === 'notifications'} />
      <AudioSection highlighted={highlight === 'audio'} />
      <SyncSection highlighted={highlight === 'sync'} />
      <DataSection highlighted={highlight === 'data'} />
    </div>
  );
}
