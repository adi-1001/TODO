import { useEffect, useRef, useState } from 'react';
import { Droplet, Minus, Moon, Plus, StickyNote } from 'lucide-react';
import { changeHydration, setDailyNote } from '../../db/repo';
import { useDayMeta, useHydration, useSettings } from '../../hooks/useData';
import { useToday } from '../../hooks/useNow';
import { useUI } from '../../state/UIProvider';
import { ProgressBar } from '../ui/controls';
import { CustomizeMetricsButton, MetricsGrid } from '../ui/MetricsPanel';
import { StreakLockLine } from '../ui/StreakLockLine';

const SAVE_DELAY_MS = 800;

export function OverviewCard() {
  const { navigate } = useUI();
  const today = useToday();

  return (
    <section className="card flex h-full flex-col" aria-labelledby="overview-title">
      <div className="sunset-header relative rounded-t-2xl p-4 pb-10">
        <div className="flex items-center justify-between gap-2">
          <h2 id="overview-title" className="text-sm font-bold text-white drop-shadow">
            Overview
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate('review')}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-black/35 px-2.5 text-[11px] font-semibold text-white transition hover:bg-black/55 dark:bg-black/45 dark:hover:bg-black/60"
            >
              <Moon size={14} strokeWidth={1.75} aria-hidden />
              Evening Review
            </button>
            <div className="rounded-full bg-white/85 text-zinc-700 dark:bg-black/45 dark:text-zinc-100">
              <CustomizeMetricsButton place="overview" />
            </div>
          </div>
        </div>
      </div>

      <MetricsGrid place="overview" day={today} className="relative z-10 -mt-7 px-4" />
      <StreakLockLine className="mx-4 mt-2.5" />

      <Hydration />
      <DailyNote />
    </section>
  );
}

function Hydration() {
  const today = useToday();
  const settings = useSettings();
  const glasses = useHydration(today);
  const goal = Math.max(1, Math.round(settings.hydrationGoal));
  const reached = glasses >= goal;

  return (
    <div className="glass mx-4 mt-3 space-y-2 rounded-xl p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Droplet size={16} strokeWidth={1.75} className="shrink-0 text-sky-500 dark:text-sky-400" aria-hidden />
          <div className="whitespace-normal break-normal">
            <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Hydration</div>
            <div className="tabular text-[11px] text-zinc-500 dark:text-zinc-400" aria-live="polite">
              {glasses} / {goal} Glasses
            </div>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void changeHydration(today, -1, goal)}
            disabled={glasses <= 0}
            className="icon-btn h-7 w-7 border border-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10"
            aria-label="Remove one glass of water"
          >
            <Minus size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => void changeHydration(today, 1, goal)}
            className="icon-btn h-7 w-7 border border-zinc-200 dark:border-white/10"
            aria-label="Add one glass of water"
          >
            <Plus size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <ProgressBar value={glasses / goal} barClassName="bg-sky-500 dark:bg-sky-400" label="Hydration toward daily goal" />
      <div className="flex flex-wrap gap-1" aria-hidden>
        {Array.from({ length: goal }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${i < glasses ? 'bg-sky-500 dark:bg-sky-400' : 'border border-zinc-300 bg-transparent dark:border-zinc-600'}`}
          />
        ))}
      </div>
      {reached && <p className="text-[11px] font-medium text-sky-700 dark:text-sky-300">Daily goal reached.</p>}
    </div>
  );
}

type SaveStatus = 'idle' | 'saving' | 'saved';

function DailyNote() {
  const today = useToday();
  const meta = useDayMeta(today);
  const stored = meta?.dailyNote ?? '';

  const [draft, setDraft] = useState(stored);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const draftRef = useRef(stored);
  const dirtyRef = useRef(false);
  const dayRef = useRef(today);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const day = dayRef.current;
    const text = draftRef.current;
    setStatus('saving');
    void setDailyNote(day, text).then(() => {
      if (!dirtyRef.current) setStatus('saved');
    });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Follow the stored note (other tabs, other devices, a new day) unless the student is typing.
  useEffect(() => {
    if (dayRef.current !== today) {
      flushRef.current();
      dayRef.current = today;
      setStatus('idle');
    }
    if (!dirtyRef.current) {
      draftRef.current = stored;
      setDraft(stored);
    }
  }, [today, stored]);

  useEffect(() => () => flushRef.current(), []);

  return (
    <div className="flex flex-1 flex-col p-4 pt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor="daily-note" className="flex items-center gap-1.5 text-xs font-bold text-zinc-800 dark:text-zinc-200">
          <StickyNote size={14} strokeWidth={1.75} className="text-zinc-500 dark:text-zinc-400" aria-hidden />
          Daily Note
        </label>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500" aria-live="polite">
          {status === 'saving' ? 'Saving' : status === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      <textarea
        id="daily-note"
        value={draft}
        rows={3}
        placeholder="A line about today: what went well, what to pick up next."
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          draftRef.current = v;
          dirtyRef.current = true;
          setStatus('idle');
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
        }}
        onBlur={() => flushRef.current()}
        className="field custom-scroll min-h-[84px] flex-1 resize-none text-xs leading-relaxed"
      />
    </div>
  );
}
