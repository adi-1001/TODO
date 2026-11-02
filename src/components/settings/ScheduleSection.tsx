import { CalendarDays, CalendarRange } from 'lucide-react';
import { useMemo } from 'react';
import { useScheduleDays } from '../../hooks/useData';
import { WEEKDAY_NAMES, WEEKDAY_ORDER, formatSlotHours, sortSlots } from '../../lib/schedule';
import { formatTimeRange12h } from '../../lib/timeFormat';
import { useUI } from '../../state/UIProvider';
import { SettingsSection } from './shared';

/** Read-only summary of the weekly class schedule, with buttons to edit it. */
export function ScheduleSection({ highlighted }: { highlighted: boolean }) {
  const days = useScheduleDays();
  const { openSchedule } = useUI();

  const active = useMemo(
    () =>
      WEEKDAY_ORDER.map((weekday) => {
        const day = days.find((d) => d.weekday === weekday && !d.deleted);
        return { weekday, slots: day && day.active ? sortSlots(day.slots) : [] };
      }).filter((d) => d.slots.length > 0),
    [days],
  );

  return (
    <SettingsSection id="schedule" title="Class Schedule" description="Your weekly classes appear on the timeline each day. Synced to your other devices." highlighted={highlighted}>
      {active.length === 0 ? (
        <p className="muted text-sm">No classes set</p>
      ) : (
        <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
          {active.map(({ weekday, slots }) => (
            <li key={weekday} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{WEEKDAY_NAMES[weekday]}</div>
                <ul className="mt-0.5 space-y-0.5">
                  {slots.map((s) => (
                    <li key={s.id} className="muted break-words text-xs">
                      <span className="tabular whitespace-nowrap">{formatTimeRange12h(s.start, s.end)}</span>{' '}
                      {s.label.trim() || 'Class'}
                    </li>
                  ))}
                </ul>
              </div>
              <span className="muted tabular shrink-0 text-xs">{formatSlotHours(slots)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-soft" onClick={() => openSchedule({ tab: 'weekly' })}>
          <CalendarDays size={14} strokeWidth={1.75} />
          Edit Weekly Schedule
        </button>
        <button type="button" className="btn-soft" onClick={() => openSchedule({ tab: 'week' })}>
          <CalendarRange size={14} strokeWidth={1.75} />
          Quick Edit This Week
        </button>
      </div>
    </SettingsSection>
  );
}
