import { memo, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, ChartColumn, Clock, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Block, BlockKind } from '../../types';
import { addBlock, deleteBlock, overrideSlotForDate } from '../../db/repo';
import { useDayBlocks, useSettings, useTasks } from '../../hooks/useData';
import { isScheduledBlockId, isValidSlot, slotIdOf } from '../../lib/schedule';
import { LIVE_SESSION_ID, useLiveSessions } from '../../hooks/useLiveSessions';
import { useNow, useToday } from '../../hooks/useNow';
import { formatDayShort, formatWeekday } from '../../lib/format';
import { dailyTotals, dayGridSegments } from '../../lib/stats';
import { HOUR, MINUTE, atTime, dayEnd, dayStart, lastNDays } from '../../lib/time';
import { formatHourShort, formatTime12h, formatTimeRange12h } from '../../lib/timeFormat';
import { useBackHandler } from '../../native/backButton';
import { useUI } from '../../state/UIProvider';
import { EmptyState } from '../ui/controls';
import { TimeInput12h } from '../ui/TimeInput12h';
import { formatHM } from './SummaryToday';

const START_HOUR = 6;
const END_HOUR = 23;
const HOURS = END_HOUR - START_HOUR;
const LABEL_MIN_PX = 48;

/** Space per hour label ("10a", "12p") before every second hour is hidden. */
const HOUR_LABEL_MIN_PX = 34;

const pad = (n: number) => String(n).padStart(2, '0');
/** "6:00 AM" and "11:00 PM", the edges of the day window. */
const WINDOW_TEXT = `${formatTime12h(`${pad(START_HOUR)}:00`)} to ${formatTime12h(`${pad(END_HOUR)}:00`)}`;
/** Stored "HH:MM" value for a picker, not for display. */
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Amber-gold fill shared by focus blocks, the summary track, the legend and the day bars. */
const FOCUS_FILL = 'bg-gradient-to-b from-amber-200 to-amber-300 dark:from-amber-300/80 dark:to-orange-500/60';
/** Focus block: amber-gold glass capsule with a soft amber glow. */
const FOCUS_BLOCK = `${FOCUS_FILL} border border-amber-300/80 shadow-[0_0_10px_rgba(245,158,11,0.25)] dark:border-amber-200/30 dark:border-t-amber-100/50 dark:shadow-[0_0_16px_rgba(245,158,11,0.35)]`;
/** Class block: slate-blue glass. */
const CLASS = 'border border-slate-300/80 bg-slate-200/70 dark:border-slate-300/20 dark:border-t-slate-200/30 dark:bg-slate-400/[0.14]';
/** Break block: emerald glass. */
const BREAK = 'border border-emerald-300/70 bg-emerald-100/80 dark:border-emerald-300/20 dark:border-t-emerald-200/30 dark:bg-emerald-400/[0.12]';
const CLASS_TRACK = 'bg-slate-400/60 dark:bg-slate-400/50';
const BREAK_TRACK = 'bg-emerald-400/60 dark:bg-emerald-400/50';
/** Bars in the week and month view: amber gold rising from the bottom. */
const DAY_BAR = 'bg-gradient-to-t from-amber-400 to-amber-200 dark:from-orange-500/60 dark:to-amber-300/80';

/** Rough width of a 10px label's longest word, so a block shows its label only when no word has to split. */
const longestWordPx = (text: string) => Math.max(0, ...text.split(/\s+/).map((w) => w.length)) * 6.2 + 12;

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${swatch}`} aria-hidden />
      {label}
    </span>
  );
}

/**
 * The live "Now" cursor: a thin glowing amber line with a dot. It reads the shared one-minute
 * clock on its own, so only this leaf re-renders, once a minute. The holder spans the whole
 * parent and moves with translateX, so a percentage of the parent width needs no layout.
 */
const NowCursor = memo(function NowCursor({ from, to }: { from: number; to: number }) {
  const now = useNow(60_000);
  if (now < from || now > to || to <= from) return null;
  const pct = ((now - from) / (to - from)) * 100;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-20 transition-transform duration-700" style={{ transform: `translate3d(${pct}%, 0, 0)` }}>
      <span className="absolute inset-y-0 left-0 w-[3px] -translate-x-1/2 animate-glow-pulse rounded-full shadow-[0_0_8px_2px_rgba(245,158,11,0.45)] dark:shadow-[0_0_10px_3px_rgba(245,158,11,0.6)]" />
      <span className="absolute inset-y-0 left-0 w-px -translate-x-1/2 bg-amber-500 dark:bg-amber-300" />
      <span className="absolute left-0 top-0 h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] dark:bg-amber-300 dark:shadow-[0_0_10px_rgba(245,158,11,0.9)]" />
    </span>
  );
});

/** Width of an element in pixels, kept up to date with ResizeObserver. */
function useWidth<T extends HTMLElement>() {
  // A callback ref, because the track mounts only once something is logged.
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

export function FocusTimeline() {
  const { timelineRange } = useUI();
  return (
    <section className="card flex h-full flex-col p-4" aria-labelledby="focus-timeline-title">
      {timelineRange === 'day' ? <DayTimeline /> : <RangeChart days={timelineRange === 'week' ? 7 : 30} />}
    </section>
  );
}

/* ---------------- Day view ---------------- */

const HourLabels = memo(function HourLabels() {
  const [ref, width] = useWidth<HTMLDivElement>();
  // Every hour when there is room, otherwise every second hour (6a, 8a ... 10p) so labels never touch.
  const step = width >= HOURS * HOUR_LABEL_MIN_PX ? 1 : 2;
  return (
    <div ref={ref} className="relative h-4 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 sm:text-[11px]" aria-hidden>
      {Array.from({ length: HOURS + 1 }, (_, i) => {
        if (i % step !== 0) return null;
        const h = START_HOUR + i;
        const shift = i === 0 ? 'translate-x-0' : i === HOURS ? '-translate-x-full' : '-translate-x-1/2';
        return (
          <span key={h} className={`tabular absolute top-0 whitespace-nowrap ${shift}`} style={{ left: `${(i / HOURS) * 100}%` }}>
            {formatHourShort(h)}
          </span>
        );
      })}
    </div>
  );
});

function DayTimeline() {
  const today = useToday();
  const sessions = useLiveSessions();
  const tasks = useTasks();
  // Stored blocks for today plus the weekly schedule's classes, computed for the date.
  const blocks = useDayBlocks(today);
  const { openSchedule } = useUI();
  const [trackRef, trackWidth] = useWidth<HTMLDivElement>();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closeDetails = useCallback(() => setSelectedId(null), []);
  const closeForm = useCallback(() => setFormOpen(false), []);

  const winFrom = atTime(today, `${pad(START_HOUR)}:00`);
  const winTo = atTime(today, `${pad(END_HOUR)}:00`);
  const span = winTo - winFrom;
  const pct = (ms: number) => ((ms - winFrom) / span) * 100;

  const titleBySession = useMemo(() => {
    const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));
    const out = new Map<string, string>();
    for (const s of sessions) out.set(s.id, (s.taskId && taskTitle.get(s.taskId)) || 'Focus');
    return out;
  }, [sessions, tasks]);

  const focusPieces = useMemo(() => {
    const pieces = dayGridSegments(sessions, [today]).get(today) ?? [];
    return pieces
      .map((p, i) => ({ id: `${p.sessionId}-${i}`, sessionId: p.sessionId, a: Math.max(p.start, winFrom), b: Math.min(p.end, winTo), full: p }))
      .filter((p) => p.b > p.a);
  }, [sessions, today, winFrom, winTo]);

  const dayBlocks = useMemo(
    () => blocks.filter((b) => b.end > winFrom && b.start < winTo).map((b) => ({ block: b, a: Math.max(b.start, winFrom), b: Math.min(b.end, winTo) })),
    [blocks, winFrom, winTo],
  );

  const selected = dayBlocks.find((d) => d.block.id === selectedId)?.block ?? null;
  const empty = focusPieces.length === 0 && dayBlocks.length === 0;

  // Android Back closes the Log class form and the block details before leaving the page.
  useBackHandler(formOpen, closeForm);
  useBackHandler(selected !== null, closeDetails);

  const place = (a: number, b: number) => ({ left: pct(a), width: ((b - a) / span) * 100 });
  const pxOf = (widthPct: number) => (widthPct / 100) * trackWidth;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <h2 id="focus-timeline-title" className="font-semibold text-zinc-600 dark:text-zinc-300">
          Today's Focus Timeline
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          <LegendItem swatch={`${FOCUS_FILL} shadow-[0_0_6px_rgba(245,158,11,0.45)]`} label="Focus" />
          <LegendItem swatch={CLASS} label="Class" />
          <LegendItem swatch={BREAK} label="Break" />
          <button
            type="button"
            onClick={() => setFormOpen((o) => !o)}
            aria-expanded={formOpen}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/[0.07] dark:bg-[#12151C] dark:text-zinc-200 dark:hover:bg-white/[0.06]"
          >
            <Plus size={14} strokeWidth={1.75} aria-hidden />
            Log class or break
          </button>
          <button
            type="button"
            onClick={() => openSchedule()}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/[0.07] dark:bg-[#12151C] dark:text-zinc-200 dark:hover:bg-white/[0.06]"
          >
            <CalendarDays size={14} strokeWidth={1.75} aria-hidden />
            Weekly Class Schedule
          </button>
        </div>
      </div>

      {formOpen && <BlockForm today={today} winFrom={winFrom} winTo={winTo} onClose={closeForm} />}

      {empty ? (
        <div className="h-28 sm:h-32 [&>div]:h-full">
          <EmptyState icon={<Clock size={18} strokeWidth={1.75} />} title="No focus logged yet today." hint="Start a timer and your sessions will appear here." />
        </div>
      ) : (
        <div
          ref={trackRef}
          className="relative h-28 w-full overflow-hidden rounded-xl border border-zinc-200/60 bg-white dark:border-white/[0.07] dark:border-t-white/[0.12] dark:bg-black/20 sm:h-32"
        >
          {Array.from({ length: HOURS - 1 }, (_, i) => (
            <span key={i} aria-hidden className="absolute bottom-0 top-0 w-px bg-zinc-100 dark:bg-white/[0.04]" style={{ left: `${((i + 1) / HOURS) * 100}%` }} />
          ))}

          {dayBlocks.map(({ block, a, b }) => {
            const p = place(a, b);
            const showLabel = pxOf(p.width) >= Math.max(LABEL_MIN_PX, longestWordPx(block.label));
            const isSelected = selectedId === block.id;
            const kindLabel = block.kind === 'class' ? (isScheduledBlockId(block.id) ? 'Scheduled class' : 'Class') : 'Break';
            return (
              <button
                key={block.id}
                type="button"
                onClick={() => setSelectedId(isSelected ? null : block.id)}
                aria-label={`${kindLabel}: ${block.label}, ${formatTime12h(block.start)} to ${formatTime12h(block.end)}. Show options`}
                aria-pressed={isSelected}
                title={`${block.label}, ${formatTimeRange12h(block.start, block.end)}`}
                className={`absolute bottom-1.5 top-1.5 flex items-end overflow-hidden rounded-lg p-1.5 text-left transition hover:opacity-80 ${block.kind === 'class' ? CLASS : BREAK} ${
                  isSelected ? 'ring-1 ring-zinc-500/70 dark:ring-white/40' : ''
                }`}
                style={{ left: `${p.left}%`, width: `max(3px, ${p.width}%)` }}
              >
                {showLabel && (
                  <span
                    className={`whitespace-normal break-normal text-[10px] font-medium leading-snug ${
                      block.kind === 'class' ? 'text-slate-700 dark:text-slate-200' : 'text-emerald-800 dark:text-emerald-100'
                    }`}
                  >
                    {block.label}
                  </span>
                )}
              </button>
            );
          })}

          {focusPieces.map((piece) => {
            const p = place(piece.a, piece.b);
            const title = titleBySession.get(piece.sessionId) ?? 'Focus';
            const showLabel = pxOf(p.width) >= Math.max(LABEL_MIN_PX, longestWordPx(title));
            const live = piece.sessionId === LIVE_SESSION_ID;
            return (
              <div
                key={piece.id}
                title={`${title}, ${formatTimeRange12h(piece.full.start, piece.full.end)} (${formatHM(piece.full.end - piece.full.start)})`}
                className={`absolute bottom-1.5 top-1.5 z-10 flex items-end overflow-hidden rounded-lg p-1.5 ${FOCUS_BLOCK} ${live ? 'ring-1 ring-amber-400/70 dark:ring-amber-200/50' : ''}`}
                style={{ left: `${p.left}%`, width: `max(2px, ${p.width}%)` }}
              >
                {showLabel && <span className="whitespace-normal break-normal text-[10px] font-bold leading-snug text-amber-950/80 dark:text-amber-50">{title}</span>}
              </div>
            );
          })}

          <NowCursor from={winFrom} to={winTo} />
        </div>
      )}

      {selected && <BlockDetails key={selected.id} block={selected} today={today} onClose={closeDetails} />}

      <div className="mt-2 space-y-1.5">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.04]" aria-hidden>
          {dayBlocks.map(({ block, a, b }) => {
            const p = place(a, b);
            return (
              <span
                key={block.id}
                className={`absolute inset-y-0 rounded-full ${block.kind === 'class' ? CLASS_TRACK : BREAK_TRACK}`}
                style={{ left: `${p.left}%`, width: `max(2px, ${p.width}%)` }}
              />
            );
          })}
          {focusPieces.map((piece) => {
            const p = place(piece.a, piece.b);
            return <span key={piece.id} className={`absolute inset-y-0 rounded-full ${FOCUS_FILL}`} style={{ left: `${p.left}%`, width: `max(2px, ${p.width}%)` }} />;
          })}
        </div>
        <HourLabels />
      </div>
    </>
  );
}

function BlockDetails({ block, today, onClose }: { block: Block; today: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const kindLabel = block.kind === 'class' ? 'Class' : 'Break';
  const slotId = isScheduledBlockId(block.id) ? slotIdOf(block.id, today) : null;
  const stopEditing = useCallback(() => setEditing(false), []);
  // Registered after the details panel, so Back closes the edit form first.
  useBackHandler(slotId !== null && editing, stopEditing);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="mt-2 rounded-xl border border-zinc-200/70 bg-white px-3 py-2 text-xs dark:border-white/[0.07] dark:bg-[#12151C]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-[140px] flex-1 break-words whitespace-normal">
          <span className="font-semibold text-zinc-800 dark:text-zinc-100">{block.label}</span>
          <span className="muted">
            {' '}
            {kindLabel}, <span className="tabular whitespace-nowrap">{formatTimeRange12h(block.start, block.end)}</span>
          </span>
          {slotId !== null && (
            <span className="ml-1.5 inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
              <CalendarDays size={14} strokeWidth={1.75} aria-hidden />
              Scheduled
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {slotId !== null ? (
            <>
              <button type="button" disabled={busy} onClick={() => setEditing((v) => !v)} aria-expanded={editing} className="btn-ghost px-2.5 py-1.5">
                <Pencil size={14} strokeWidth={1.75} aria-hidden />
                Edit for today
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await overrideSlotForDate(today, slotId, null);
                  onClose();
                }}
                className="btn-ghost px-2.5 py-1.5"
              >
                <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                Remove for today
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await deleteBlock(block.id);
                onClose();
              }}
              className="btn-ghost px-2.5 py-1.5"
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="icon-btn h-8 w-8" aria-label="Close details">
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      {slotId !== null && editing && <ScheduledEditForm block={block} today={today} slotId={slotId} onDone={onClose} onCancel={stopEditing} />}
    </div>
  );
}

/** Changes one scheduled class for today only; the weekly schedule stays as it is. */
function ScheduledEditForm({ block, today, slotId, onDone, onCancel }: { block: Block; today: string; slotId: string; onDone: () => void; onCancel: () => void }) {
  const [start, setStart] = useState(() => hhmm(block.start));
  const [end, setEnd] = useState(() => hhmm(block.end));
  const [label, setLabel] = useState(block.label);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidSlot({ start, end })) {
      setMessage('The end time needs to be after the start time.');
      return;
    }
    setSaving(true);
    const ok = await overrideSlotForDate(today, slotId, { start, end, label });
    setSaving(false);
    if (ok) onDone();
    else setMessage('These times could not be saved. Check the start and end.');
  };

  return (
    <form onSubmit={submit} noValidate className="mt-2 border-t border-zinc-100 pt-2 dark:border-white/[0.06]">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="min-w-[10rem] flex-1">
          <label className="label" htmlFor="scheduled-label">
            Label
          </label>
          <input id="scheduled-label" className="field py-1.5 text-xs" value={label} maxLength={60} placeholder="Class" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <span className="label">Start</span>
          <TimeInput12h
            value={start}
            label="Class start"
            minuteStep={5}
            onChange={(v) => {
              setStart(v);
              setMessage(null);
            }}
          />
        </div>
        <div>
          <span className="label">End</span>
          <TimeInput12h
            value={end}
            label="Class end"
            minuteStep={5}
            onChange={(v) => {
              setEnd(v);
              setMessage(null);
            }}
          />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={`text-[11px] ${message ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-500 dark:text-zinc-400'}`} role="status" aria-live="polite">
          {message ?? 'Changes apply to today only.'}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            Save for today
          </button>
        </div>
      </div>
    </form>
  );
}

interface BlockFormProps {
  today: string;
  winFrom: number;
  winTo: number;
  onClose: () => void;
}

function BlockForm({ today, winFrom, winTo, onClose }: BlockFormProps) {
  const [defaults] = useState(() => {
    const rounded = Math.floor(Date.now() / (5 * MINUTE)) * 5 * MINUTE;
    const end = Math.min(winTo, Math.max(winFrom + HOUR, rounded));
    return { start: hhmm(end - HOUR), end: hhmm(end) };
  });
  const [kind, setKind] = useState<BlockKind>('class');
  const [label, setLabel] = useState('');
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!start || !end) {
      setMessage('Pick a start and an end time.');
      return;
    }
    const a = atTime(today, start);
    const b = atTime(today, end);
    if (b <= a) {
      setMessage('The end time needs to be after the start time.');
      return;
    }
    if (b <= winFrom || a >= winTo) {
      setMessage(`Pick times between ${formatTime12h(`${pad(START_HOUR)}:00`)} and ${formatTime12h(`${pad(END_HOUR)}:00`)} so the block shows on the timeline.`);
      return;
    }
    setSaving(true);
    await addBlock(kind, label, a, b);
    setSaving(false);
    onClose();
  };

  const clear = () => setMessage(null);

  return (
    <form onSubmit={submit} noValidate className="mb-3 rounded-xl border border-zinc-200/70 bg-white p-3 dark:border-white/[0.07] dark:bg-[#12151C]">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="w-24 shrink-0">
          <label className="label" htmlFor="block-kind">
            Type
          </label>
          <select id="block-kind" className="field py-1.5 text-xs" value={kind} onChange={(e) => setKind(e.target.value as BlockKind)}>
            <option value="class">Class</option>
            <option value="break">Break</option>
          </select>
        </div>
        <div className="min-w-[8rem] flex-1">
          <label className="label" htmlFor="block-label">
            Label
          </label>
          <input
            id="block-label"
            className="field py-1.5 text-xs"
            value={label}
            maxLength={60}
            placeholder={kind === 'class' ? 'Class' : 'Break'}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div>
          <span className="label">Start</span>
          <TimeInput12h
            value={start}
            label="Block start"
            minuteStep={5}
            onChange={(v) => {
              setStart(v);
              clear();
            }}
          />
        </div>
        <div>
          <span className="label">End</span>
          <TimeInput12h
            value={end}
            label="Block end"
            minuteStep={5}
            onChange={(v) => {
              setEnd(v);
              clear();
            }}
          />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className={`text-[11px] ${message ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-500 dark:text-zinc-400'}`} role="status" aria-live="polite">
          {message ?? (
            <>
              The timeline shows <span className="tabular">{WINDOW_TEXT}</span>.
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            Save
          </button>
        </div>
      </div>
    </form>
  );
}

/* ---------------- Week and month view ---------------- */

function RangeChart({ days }: { days: 7 | 30 }) {
  const today = useToday();
  const sessions = useLiveSessions();
  const settings = useSettings();

  const totals = useMemo(() => dailyTotals(sessions, lastNDays(today, days)), [sessions, today, days]);
  const goalMs = Math.max(0, settings.dailyGoalMinutes) * MINUTE;
  const maxMs = Math.max(goalMs, ...totals.map((t) => t.ms), HOUR);
  const rangeTotal = totals.reduce((a, t) => a + t.ms, 0);
  const last = totals.length - 1;
  const goalPct = goalMs > 0 ? (goalMs / maxMs) * 100 : null;
  const gap = days === 7 ? 'gap-2 sm:gap-3' : 'gap-[2px] sm:gap-1';

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <h2 id="focus-timeline-title" className="font-semibold text-zinc-600 dark:text-zinc-300">
          {days === 7 ? 'Focus, Last 7 Days' : 'Focus, Last 30 Days'}
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          <LegendItem swatch={`${FOCUS_FILL} shadow-[0_0_6px_rgba(245,158,11,0.45)]`} label="Focus" />
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="w-3 border-t border-dashed border-zinc-400 dark:border-zinc-500" />
            Daily goal
          </span>
          <span>
            Total <span className="tabular font-bold text-zinc-800 dark:text-zinc-100">{formatHM(rangeTotal)}</span>
          </span>
        </div>
      </div>

      {rangeTotal === 0 ? (
        <div className="h-28 sm:h-32 [&>div]:h-full">
          <EmptyState
            icon={<ChartColumn size={18} strokeWidth={1.75} />}
            title={days === 7 ? 'No focus logged in the last 7 days.' : 'No focus logged in the last 30 days.'}
            hint="Finished sessions add up here, one bar per day."
          />
        </div>
      ) : (
        <>
          <div className="relative h-28 w-full rounded-xl border border-zinc-200/60 bg-white dark:border-white/[0.07] dark:border-t-white/[0.12] dark:bg-black/20 sm:h-32">
            <div className="absolute inset-x-2 bottom-1.5 top-3">
              {goalPct !== null && (
                <div aria-hidden className="absolute inset-x-0 z-10 border-t border-dashed border-zinc-400/70 dark:border-zinc-500/70" style={{ bottom: `${goalPct}%` }}>
                  <span className="tabular absolute -top-3.5 right-0 rounded bg-white/80 px-1 text-[9px] font-medium text-zinc-400 dark:bg-[#12151C]/80 dark:text-zinc-500">
                    {formatHM(goalMs)}
                  </span>
                </div>
              )}
              <ul className={`flex h-full items-end ${gap}`}>
                {totals.map((t, i) => {
                  const h = (t.ms / maxMs) * 100;
                  const label = `${formatDayShort(t.day)}: ${formatHM(t.ms)}`;
                  const isToday = i === last;
                  return (
                    <li key={t.day} className="relative flex h-full min-w-0 flex-1 items-end" title={label}>
                      <span className="sr-only">{label}</span>
                      <span
                        aria-hidden
                        className={`block w-full rounded-t-md ${t.ms > 0 ? DAY_BAR : 'bg-zinc-100 dark:bg-white/5'} ${
                          isToday ? 'ring-1 ring-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.3)] dark:ring-amber-300/40 dark:shadow-[0_0_16px_rgba(245,158,11,0.4)]' : ''
                        }`}
                        style={{ height: t.ms > 0 ? `max(3px, ${h}%)` : '2px' }}
                      />
                      {isToday && (
                        // Today's column: the cursor walks across it through the day.
                        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                          <NowCursor from={dayStart(t.day)} to={dayEnd(t.day)} />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className={`mt-2 flex px-2 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 sm:text-[11px] ${gap}`} aria-hidden>
            {totals.map((t, i) => {
              const show = days === 7 || (last - i) % 5 === 0;
              const text = days === 7 ? formatWeekday(t.day) : String(Number(t.day.slice(8)));
              return (
                <span key={t.day} className={`tabular min-w-0 flex-1 overflow-visible whitespace-nowrap text-center ${i === last ? 'font-bold text-zinc-600 dark:text-zinc-300' : ''}`}>
                  {show ? text : ''}
                </span>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
