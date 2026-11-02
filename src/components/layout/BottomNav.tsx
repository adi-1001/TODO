import { ChartColumn, Clock, LayoutGrid, Library, Settings, type LucideIcon } from 'lucide-react';
import { useUI } from '../../state/UIProvider';

function Tab({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`press relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-0.5 pb-1.5 pt-2 text-[11px] font-semibold transition max-[359px]:text-[10px] ${
        active ? 'text-zinc-900 dark:text-amber-200' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
      }`}
    >
      {/* Glowing gold indicator pill above the active tab; it fades and scales in (opacity and transform only). */}
      <span
        aria-hidden
        className={`absolute left-1/2 top-0 h-[3px] w-8 -translate-x-1/2 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.8)] transition duration-300 dark:bg-amber-300 ${
          active ? 'scale-x-100 opacity-100' : 'scale-x-50 opacity-0'
        }`}
      />
      <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? 'bg-zinc-900/[0.06] dark:bg-amber-300/10' : ''}`}>
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </span>
      {/* Single words that always fit a fifth of a 320 px screen, so they never split. */}
      <span className="whitespace-nowrap text-center leading-tight">{label}</span>
    </button>
  );
}

/** Phone and tablet navigation, shown below the lg breakpoint. */
export function BottomNav() {
  const { view, navigate, setClockOpen, clockOpen } = useUI();
  const on = (v: typeof view) => view === v && !clockOpen;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex touch-manipulation select-none items-stretch justify-around gap-0.5 border-t border-zinc-200 bg-white/85 px-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-0.5 backdrop-blur-2xl dark:border-white/[0.08] dark:border-t-white/[0.12] dark:bg-[#0B0D12]/85 lg:hidden"
    >
      <Tab icon={LayoutGrid} label="Dashboard" active={on('dashboard')} onClick={() => navigate('dashboard')} />
      <Tab icon={Clock} label="Clock" active={clockOpen} onClick={() => setClockOpen(true)} />
      <Tab icon={Library} label="Syllabus" active={on('syllabus')} onClick={() => navigate('syllabus')} />
      <Tab icon={ChartColumn} label="Report" active={on('report')} onClick={() => navigate('report')} />
      <Tab icon={Settings} label="Settings" active={on('settings')} onClick={() => navigate('settings')} />
    </nav>
  );
}
