import { ChevronDown, ChevronRight, LifeBuoy, Target } from 'lucide-react';
import { useId, useState } from 'react';
import { useBacklog } from '../../hooks/useBacklog';
import { addDays } from '../../lib/time';
import { useUI } from '../../state/UIProvider';
import { Segmented } from '../ui/controls';
import { RootCausePills } from './RootCauses';
import { PaceCard, TriageGrid, WhatWentWrongCard } from './Triage';

const OPEN_KEY = 'study-space:backlog-card-open';

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

type DayChoice = 'today' | 'yesterday';

/**
 * The Backlog and Recovery Command Center on the Dashboard: homework left, the practice backlog,
 * a catch-up plan with a one-tap sprint, solving speed, and what went wrong, each in its own
 * glass sub-card. Collapsible; the choice is kept on this device.
 */
export function BacklogCommandCenter() {
  const view = useBacklog();
  const { navigate, openBulkTargets } = useUI();
  const [open, setOpen] = useState(readOpen);
  const [dayChoice, setDayChoice] = useState<DayChoice>('today');
  const bodyId = useId();
  const headingId = useId();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      /* no storage */
    }
  };

  const hw = view.homework.tasks.length;
  const ch = view.backlog.chapters.length;
  const summary = [
    `${hw} homework ${hw === 1 ? 'task' : 'tasks'} left`,
    `${ch} ${ch === 1 ? 'chapter' : 'chapters'} in backlog`,
    view.backlog.questions > 0 ? `${view.backlog.questions} Qs to catch up` : null,
  ]
    .filter(Boolean)
    .join(' • ');
  const day = dayChoice === 'today' ? view.today : addDays(view.today, -1);

  return (
    <section className="card p-5 sm:p-6" aria-labelledby={headingId}>
      <h2 id={headingId}>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={bodyId} className="flex w-full min-w-0 items-start gap-3 rounded-lg text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200" aria-hidden>
            <LifeBuoy size={18} strokeWidth={1.75} />
          </span>
          <span className="min-w-[160px] flex-1">
            <span className="block whitespace-normal break-normal text-base font-bold leading-snug text-zinc-900 dark:text-white">Backlog & Recovery Command Center</span>
            <span className="tabular mt-0.5 block whitespace-normal break-normal text-xs font-normal leading-relaxed text-zinc-500 dark:text-zinc-400">{summary}</span>
          </span>
          <ChevronDown size={18} strokeWidth={1.75} className={`mt-1 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h2>

      {open && (
        <div id={bodyId} className="mt-5 animate-fade-in space-y-5">
          <TriageGrid view={view} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PaceCard view={view} />
            <WhatWentWrongCard
              view={view}
              pills={
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="muted min-w-[160px] flex-1 whitespace-normal break-normal text-[11px] leading-relaxed">Missed the goal or left homework pending? Tap every reason that fits.</p>
                    <Segmented<DayChoice>
                      label="Day for What Went Wrong"
                      value={dayChoice}
                      onChange={setDayChoice}
                      size="sm"
                      options={[
                        { value: 'today', label: 'Today' },
                        { value: 'yesterday', label: 'Yesterday' },
                      ]}
                    />
                  </div>
                  <RootCausePills day={day} label={`What went wrong ${dayChoice}`} />
                </div>
              }
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost press h-8 px-2.5 text-[11px]" onClick={() => openBulkTargets()}>
              <Target size={14} strokeWidth={1.75} aria-hidden />
              Set Target Qs
            </button>
            <button type="button" className="btn-ghost press h-8 px-2.5 text-[11px]" onClick={() => navigate('report', 'backlog')}>
              Detailed backlog report
              <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
