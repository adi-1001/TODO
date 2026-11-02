import { useEffect, useRef, useState } from 'react';
import { CalendarOff, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { ScheduleDay, ScheduleOverride, ScheduleSlot } from '../../types';
import {
  addScheduleSlot,
  clearDayOverride,
  removeScheduleSlot,
  setDayOverride,
  setScheduleDayActive,
  updateScheduleSlot,
  type SlotInput,
} from '../../db/repo';
import { useScheduleDays, useScheduleOverrides } from '../../hooks/useData';
import { useToday } from '../../hooks/useNow';
import { formatDayShort } from '../../lib/format';
import { WEEKDAY_NAMES, WEEKDAY_ORDER, effectiveSlots, formatSlotHours, hasOverride, isValidSlot, sortSlots, weekDays, weekdayOf } from '../../lib/schedule';
import { useUI } from '../../state/UIProvider';
import { Drawer } from '../ui/Drawer';
import { TimeInput12h } from '../ui/TimeInput12h';
import { Segmented, Switch } from '../ui/controls';

type Tab = 'weekly' | 'week';

const TABS: { value: Tab; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'week', label: 'This Week' },
];

const DEFAULT_SLOT: SlotInput = { start: '13:00', end: '17:00', label: 'Class' };
const LAST_MINUTE = 23 * 60 + 59;

const pad = (n: number) => String(n).padStart(2, '0');
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const fromMinutes = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const toInput = (s: ScheduleSlot): SlotInput => ({ start: s.start, end: s.end, label: s.label });

/** A new block: 1:00 PM to 5:00 PM on an empty day, otherwise one hour after the last block. Null when the day is full. */
function nextSlot(slots: ScheduleSlot[]): SlotInput | null {
  if (slots.length === 0) return DEFAULT_SLOT;
  const lastEnd = Math.max(...slots.map((s) => toMinutes(s.end)));
  const end = Math.min(lastEnd + 60, LAST_MINUTE);
  if (end <= lastEnd) return null;
  return { start: fromMinutes(lastEnd), end: fromMinutes(end), label: 'Class' };
}

const sameSlot = (a: SlotInput, b: SlotInput) => a.start === b.start && a.end === b.end && a.label === b.label;

export function ScheduleDrawer() {
  const { modal, closeModal } = useUI();
  const open = modal?.name === 'schedule';
  const [tab, setTab] = useState<Tab>('weekly');

  // Each time the drawer opens, start on the tab it was opened with.
  useEffect(() => {
    if (modal?.name === 'schedule') setTab(modal.options.tab ?? 'weekly');
  }, [modal]);

  return (
    <Drawer open={open} onClose={closeModal} title="Weekly Class Schedule">
      <ScheduleBody tab={tab} setTab={setTab} />
    </Drawer>
  );
}

function ScheduleBody({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const today = useToday();
  const days = useScheduleDays();
  const overrides = useScheduleOverrides();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Segmented label="Schedule view" value={tab} onChange={setTab} options={TABS} size="sm" />
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {tab === 'weekly'
            ? 'Classes repeat every week and appear on the Focus Timeline each day.'
            : 'Changes here apply to that date only. The weekly schedule stays as it is.'}
        </p>
      </div>

      {tab === 'weekly' ? (
        <ul className="space-y-3">
          {WEEKDAY_ORDER.map((wd) => (
            <li key={wd}>
              <WeekdayCard weekday={wd} day={days.find((d) => d.weekday === wd && !d.deleted)} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3">
          {weekDays(today).map((date) => (
            <li key={date}>
              <DateCard date={date} today={today} days={days} overrides={overrides} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Weekly ---------------- */

function WeekdayCard({ weekday, day }: { weekday: number; day: ScheduleDay | undefined }) {
  const name = WEEKDAY_NAMES[weekday];
  const active = day?.active ?? false;
  const slots = sortSlots(day?.slots ?? []);
  const [notice, setNotice] = useState<string | null>(null);

  const add = async () => {
    const input = nextSlot(slots);
    if (!input) {
      setNotice('There is no time left after the last block. Change an existing block instead.');
      return;
    }
    setNotice(null);
    await addScheduleSlot(weekday, input);
  };

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-3 dark:border-white/[0.07] dark:bg-[#1E222D]" aria-label={name}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-zinc-900 dark:text-white">{name}</h3>
          <p className="tabular text-[11px] text-zinc-500 dark:text-zinc-400">{active ? (slots.length ? `${formatSlotHours(slots)} of class` : 'No blocks yet') : 'Off'}</p>
        </div>
        <Switch checked={active} onChange={(v) => void setScheduleDayActive(weekday, v)} label={`Classes on ${name}`} />
      </div>

      {active && (
        <div className="mt-2.5 space-y-2">
          {slots.map((s, i) => (
            <SlotRow
              key={s.id}
              slot={toInput(s)}
              name={`${name} block ${i + 1}`}
              onSave={(input) => updateScheduleSlot(weekday, s.id, input)}
              onRemove={() => void removeScheduleSlot(weekday, s.id)}
            />
          ))}
          <AddBlockButton onClick={() => void add()} />
          {notice && <p className="text-[11px] text-amber-700 dark:text-amber-300">{notice}</p>}
        </div>
      )}
    </section>
  );
}

/* ---------------- This Week ---------------- */

interface DateCardProps {
  date: string;
  today: string;
  days: ScheduleDay[];
  overrides: ScheduleOverride[];
}

function DateCard({ date, today, days, overrides }: DateCardProps) {
  const slots = effectiveSlots(date, days, overrides);
  const changed = hasOverride(date, overrides);
  const isToday = date === today;
  const name = WEEKDAY_NAMES[weekdayOf(date)];
  const [notice, setNotice] = useState<string | null>(null);
  const inputs = slots.map(toInput);

  const save = (list: SlotInput[]) => setDayOverride(date, list);
  const add = async () => {
    const input = nextSlot(slots);
    if (!input) {
      setNotice('There is no time left after the last block. Change an existing block instead.');
      return;
    }
    setNotice(null);
    await save([...inputs, input]);
  };

  return (
    <section
      className={`rounded-2xl border bg-white p-3 dark:bg-[#1E222D] ${
        isToday ? 'border-amber-400/60 ring-1 ring-amber-400/30 dark:border-amber-300/40 dark:ring-amber-300/20' : 'border-zinc-200/80 dark:border-white/[0.07]'
      }`}
      aria-label={`${name}, ${formatDayShort(date)}${isToday ? ', today' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-white">
            {name}
            <span className="tabular font-medium text-zinc-500 dark:text-zinc-400">{formatDayShort(date)}</span>
            {isToday && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-300/15 dark:text-amber-200">Today</span>}
          </h3>
          <p className="tabular text-[11px] text-zinc-500 dark:text-zinc-400">
            {slots.length ? `${formatSlotHours(slots)} of class` : 'No classes this day'}
            {changed && <span className="font-semibold text-sky-700 dark:text-sky-300"> · Changed for this week</span>}
          </p>
        </div>
        {changed && (
          <button type="button" onClick={() => void clearDayOverride(date)} className="btn-ghost h-8 px-2.5 text-[11px]">
            <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
            Reset to weekly
          </button>
        )}
      </div>

      <div className="mt-2.5 space-y-2">
        {inputs.map((input, i) => (
          // Keyed by position: saving a date rewrites its slot ids.
          <SlotRow
            key={i}
            slot={input}
            name={`${name} block ${i + 1}`}
            onSave={(input) => save(inputs.map((x, j) => (j === i ? input : x)))}
            onRemove={() => void save(inputs.filter((_, j) => j !== i))}
          />
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <AddBlockButton onClick={() => void add()} />
          {slots.length > 0 && (
            <button type="button" onClick={() => void save([])} className="btn-ghost h-8 px-2.5 text-[11px]">
              <CalendarOff size={14} strokeWidth={1.75} aria-hidden />
              No classes this day
            </button>
          )}
        </div>
        {notice && <p className="text-[11px] text-amber-700 dark:text-amber-300">{notice}</p>}
      </div>
    </section>
  );
}

/* ---------------- Shared ---------------- */

function AddBlockButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-soft h-8 px-2.5 text-[11px]">
      <Plus size={14} strokeWidth={1.75} aria-hidden />
      Add block
    </button>
  );
}

interface SlotRowProps {
  slot: SlotInput;
  /** Accessible name, for example "Monday block 1". */
  name: string;
  onSave: (input: SlotInput) => Promise<boolean>;
  onRemove: () => void;
}

/**
 * One class block: label, start and end. Saves when focus leaves the row (and when the drawer
 * closes with an unsaved valid change). Follows the stored values whenever nothing is pending.
 */
function SlotRow({ slot, name, onSave, onRemove }: SlotRowProps) {
  const [draft, setDraft] = useState<SlotInput>(slot);
  const [failed, setFailed] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<SlotInput>(slot);
  const latest = useRef({ draft, onSave });
  latest.current = { draft, onSave };

  // Take new stored values unless the student has an unsaved change in this row.
  useEffect(() => {
    const dirty = !sameSlot(latest.current.draft, baseRef.current);
    baseRef.current = slot;
    if (!dirty) setDraft(slot);
  }, [slot.start, slot.end, slot.label]);

  const valid = isValidSlot(draft);
  const invalidRing = valid ? '' : 'rounded-lg ring-1 ring-amber-500/60 dark:ring-amber-300/50';

  const commit = () => {
    const d = latest.current.draft;
    if (sameSlot(d, baseRef.current) || !isValidSlot(d)) return;
    baseRef.current = d;
    void latest.current.onSave(d).then((ok) => setFailed(!ok));
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // Save a pending valid change when the drawer closes.
  useEffect(() => () => commitRef.current(), []);

  // Drop any pending change, so this row follows whatever block takes its place.
  const remove = () => {
    baseRef.current = latest.current.draft;
    onRemove();
  };

  const set = (patch: Partial<SlotInput>) => {
    setFailed(false);
    setDraft((d) => ({ ...d, ...patch }));
  };

  /**
   * A time changed in one of the hour, minute or AM/PM selects. While focus stays in the row
   * (moving from one select to the next) nothing is saved; the row's blur saves it. Some
   * browsers do not focus a select when it is tapped, so when focus is already outside the row
   * the change is saved right away (after the render, so the new draft is the one checked).
   */
  const setTime = (patch: Pick<Partial<SlotInput>, 'start' | 'end'>) => {
    set(patch);
    window.setTimeout(() => {
      const row = rowRef.current;
      if (row && !row.contains(document.activeElement)) commitRef.current();
    }, 0);
  };

  return (
    <div
      ref={rowRef}
      className="rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-2 dark:border-white/[0.06] dark:bg-white/[0.03]"
      onBlur={(e) => {
        // Moving between the selects of one picker, or from start to end, stays inside the row.
        if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) commit();
      }}
    >
      <div className="flex items-center gap-2">
        <input
          className="field min-w-0 flex-1 py-1.5 text-xs"
          value={draft.label}
          maxLength={60}
          placeholder="Class"
          aria-label={`${name} label`}
          onChange={(e) => set({ label: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <button type="button" onClick={remove} className="icon-btn h-8 w-8 shrink-0" aria-label={`Remove ${name}`} title="Remove block">
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <TimeInput12h
          value={draft.start}
          label={`${name} start`}
          minuteStep={5}
          className={invalidRing}
          onChange={(v) => setTime({ start: v })}
        />
        <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">to</span>
        <TimeInput12h value={draft.end} label={`${name} end`} minuteStep={5} className={invalidRing} onChange={(v) => setTime({ end: v })} />
      </div>
      {(!valid || failed) && (
        <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300" role="status">
          {!valid ? 'The end time needs to be after the start time.' : 'This block could not be saved. Check the times.'}
        </p>
      )}
    </div>
  );
}
