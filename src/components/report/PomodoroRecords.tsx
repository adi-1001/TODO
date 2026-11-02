import { Clock3 } from 'lucide-react';
import { memo, useId, useMemo } from 'react';
import { formatDayShort, formatShort } from '../../lib/format';
import { formatTime12h, formatTimeRange12h } from '../../lib/timeFormat';
import { bucketInfo, dayGridSegments } from '../../lib/stats';
import { MINUTE, atTime, lastNDays } from '../../lib/time';
import type { FocusSession, Subject } from '../../types';
import { Dot } from '../ui/controls';
import { REPORT_CARD } from './PeriodControls';

interface PomodoroRecordsProps {
  sessions: FocusSession[];
  subjects: Subject[];
  today: string;
  restDays: Set<string>;
}

const DAYS = 14;
const FIRST_HOUR = 6;
/** The grid runs to the end of the day (midnight), shown as 11:59 PM. */
const LAST_HOUR = 24;
const HOURS = LAST_HOUR - FIRST_HOUR;

const W = 680;
const LABEL_W = 80;
const RIGHT_PAD = 22;
const HEADER_H = 22;
const ROW_H = 24;
const BAR_H = 12;
const PLOT_W = W - LABEL_W - RIGHT_PAD;
const H = HEADER_H + DAYS * ROW_H + 4;
const OUTLINE_W = 1.25;

/** Stored "HH:00" for a whole hour, used only to build each day's window. */
const hourValue = (h: number) => `${String(h).padStart(2, '0')}:00`;
const WINDOW_START = formatTime12h(hourValue(FIRST_HOUR));
const WINDOW_END = formatTime12h('23:59');
/** "6:00 AM to 11:59 PM", the part of the day the grid shows. */
const WINDOW_TEXT = `${WINDOW_START} to ${WINDOW_END}`;
const HOUR_MARKS = Array.from({ length: HOURS + 1 }, (_, i) => FIRST_HOUR + i);
const xOf = (h: number) => LABEL_W + ((h - FIRST_HOUR) / HOURS) * PLOT_W;
/** 12-hour axis label for a whole hour: "6 AM", "12 PM". The last tick is the end of the day. */
function hourLabel(h: number): string {
  if (h >= 24) return WINDOW_END;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}
const AXIS_MARKS = HOUR_MARKS.filter((h) => h % 2 === 0);

/** "#RRGGBB" mixed toward white by `t` (0..1); any other colour string is returned as is. */
function lighten(color: string, t: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const ch = (shift: number) => {
    const c = (n >> shift) & 255;
    return Math.round(c + (255 - c) * t)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

interface PlotBar {
  x: number;
  w: number;
  y: number;
  color: string;
  title: string;
  id: string;
  failed: boolean;
}

/**
 * 14-day time-of-day grid: every focus segment drawn at its exact clock time. Runs stopped by
 * Strict Mode are drawn as dashed outlines and do not count toward any total.
 */
export const PomodoroRecords = memo(function PomodoroRecords({ sessions, subjects, today, restDays }: PomodoroRecordsProps) {
  // Today first, oldest last.
  const days = useMemo(() => lastNDays(today, DAYS).reverse(), [today]);

  const model = useMemo(() => {
    const grid = dayGridSegments(sessions, days, { includeFailed: true });
    const bars: PlotBar[] = [];
    const legendMs = new Map<string, number>();
    let outsideMs = 0;
    let visibleMs = 0;
    let anyPieces = false;
    let anyFailed = false;

    days.forEach((day, row) => {
      const winStart = atTime(day, hourValue(FIRST_HOUR));
      // 11:59 PM plus one minute: midnight at the end of the day.
      const winEnd = atTime(day, '23:59') + MINUTE;
      const span = winEnd - winStart;
      const pieces = grid.get(day) ?? [];
      pieces.forEach((p, i) => {
        anyPieces = true;
        const failed = p.status === 'failed_strict';
        const a = Math.max(p.start, winStart);
        const b = Math.min(p.end, winEnd);
        const inside = Math.max(0, b - a);
        if (!failed) outsideMs += p.end - p.start - inside;
        if (inside <= 0 || span <= 0) return;
        if (failed) anyFailed = true;
        else {
          visibleMs += inside;
          legendMs.set(p.key, (legendMs.get(p.key) ?? 0) + inside);
        }
        const info = bucketInfo(p.key, subjects);
        const x = LABEL_W + ((a - winStart) / span) * PLOT_W;
        const w = Math.max(2, ((b - a) / span) * PLOT_W);
        const base = `${info.name}, ${formatTimeRange12h(p.start, p.end)}, ${formatShort(p.end - p.start)}`;
        bars.push({
          id: `${day}-${p.sessionId}-${i}`,
          x,
          w: Math.min(w, LABEL_W + PLOT_W - x),
          y: HEADER_H + row * ROW_H + (ROW_H - BAR_H) / 2,
          color: info.color,
          title: failed ? `${base}, stopped by Strict Mode` : base,
          failed,
        });
      });
    });

    const legend = [...legendMs.entries()].sort((x, y) => y[1] - x[1]).map(([key]) => bucketInfo(key, subjects));
    const countedBars = bars.filter((b) => !b.failed).length;
    // One gradient per distinct block colour.
    const colors = [...new Set(bars.filter((b) => !b.failed).map((b) => b.color))];

    return { bars, legend, colors, countedBars, anyFailed, anyPieces, outsideMin: Math.round(outsideMs / MINUTE), visibleMs };
  }, [sessions, subjects, days]);

  const gradPrefix = `pr-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const gradId = useMemo(() => new Map(model.colors.map((c, i) => [c, `${gradPrefix}-g${i}`])), [model.colors, gradPrefix]);

  const ariaLabel = !model.anyPieces
    ? 'Pomodoro Records for the last 14 days: no focus sessions.'
    : model.countedBars === 0
      ? `Pomodoro Records for the last 14 days: no focus recorded between ${WINDOW_START} and ${WINDOW_END}.`
      : `Pomodoro Records for the last 14 days: ${model.countedBars} focus blocks, ${formatShort(model.visibleMs)} between ${WINDOW_START} and ${WINDOW_END}.`;

  return (
    <section className={REPORT_CARD} aria-labelledby="report-records-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="report-records-title" className="section-title">
          Pomodoro Records
        </h2>
        <span className="muted text-[11px]">Last 14 days, {WINDOW_TEXT}</span>
      </div>

      <div className="relative">
        <div className="custom-scroll -mx-1 overflow-x-auto px-1 pb-1">
          <div className="min-w-[600px]">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} className="block">
              {/* Inner light per block colour: a bright top edge fading into the subject colour. */}
              <defs>
                {model.colors.map((c) => (
                  <linearGradient key={c} id={gradId.get(c)} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lighten(c, 0.45)} />
                    <stop offset="45%" stopColor={c} />
                    <stop offset="100%" stopColor={c} stopOpacity={0.78} />
                  </linearGradient>
                ))}
              </defs>
              {/* Today row highlight */}
              <rect x={0} y={HEADER_H} width={W} height={ROW_H} rx={6} className="fill-zinc-100/80 dark:fill-white/[0.04]" />

              {/* Rest day tint */}
              {days.map((day, row) =>
                restDays.has(day) ? (
                  <rect key={`rest-${day}`} x={LABEL_W} y={HEADER_H + row * ROW_H + 2} width={PLOT_W} height={ROW_H - 4} rx={4} className="fill-sky-500/[0.06] dark:fill-sky-300/[0.06]" />
                ) : null,
              )}

              {/* Hour gridlines and labels */}
              {HOUR_MARKS.map((h) => (
                <line
                  key={`g-${h}`}
                  x1={xOf(h)}
                  x2={xOf(h)}
                  y1={HEADER_H - 4}
                  y2={H - 4}
                  strokeWidth={1}
                  className={h % 2 === 0 ? 'stroke-zinc-200 dark:stroke-white/[0.06]' : 'stroke-zinc-100 dark:stroke-white/[0.035]'}
                />
              ))}
              {AXIS_MARKS.map((h) => (
                <text
                  key={`l-${h}`}
                  x={xOf(h)}
                  y={12}
                  textAnchor={h >= LAST_HOUR ? 'end' : 'middle'}
                  fontSize={9.5}
                  className="tabular fill-zinc-400 dark:fill-zinc-500"
                >
                  {hourLabel(h)}
                </text>
              ))}

              {/* Row labels */}
              {days.map((day, row) => {
                const cy = HEADER_H + row * ROW_H + ROW_H / 2;
                const isToday = day === today;
                return (
                  <g key={`row-${day}`}>
                    <line x1={LABEL_W} x2={LABEL_W + PLOT_W} y1={cy + ROW_H / 2} y2={cy + ROW_H / 2} strokeWidth={1} className="stroke-zinc-100 dark:stroke-white/[0.04]" />
                    <text
                      x={8}
                      y={cy}
                      dominantBaseline="central"
                      fontSize={11}
                      fontWeight={isToday ? 700 : 500}
                      className={`tabular ${isToday ? 'fill-zinc-900 dark:fill-white' : 'fill-zinc-500 dark:fill-zinc-400'}`}
                    >
                      {isToday ? 'Today' : formatDayShort(day)}
                    </text>
                    {restDays.has(day) && (
                      <text x={LABEL_W - 8} y={cy} dominantBaseline="central" textAnchor="end" fontSize={9} fontWeight={600} className="fill-sky-600 dark:fill-sky-300">
                        Rest
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Focus blocks: filled when counted, dashed outline when stopped by Strict Mode */}
              <g className="animate-fade-in">
              {model.bars.map((b) =>
                b.failed ? (
                  <rect
                    key={b.id}
                    x={b.x + OUTLINE_W / 2}
                    y={b.y + OUTLINE_W / 2}
                    width={Math.max(1, b.w - OUTLINE_W)}
                    height={BAR_H - OUTLINE_W}
                    rx={Math.min(3, b.w / 2)}
                    fill="none"
                    stroke={b.color}
                    strokeWidth={OUTLINE_W}
                    strokeDasharray="3 2"
                    opacity={0.7}
                  >
                    <title>{b.title}</title>
                  </rect>
                ) : (
                  <rect key={b.id} x={b.x} y={b.y} width={b.w} height={BAR_H} rx={Math.min(3, b.w / 2)} fill={`url(#${gradId.get(b.color)})`}>
                    <title>{b.title}</title>
                  </rect>
                ),
              )}
              </g>
            </svg>
          </div>
        </div>

        {!model.anyPieces && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
            <p className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-500 shadow-sm dark:border-white/[0.07] dark:bg-[#12151C] dark:text-zinc-400">
              <Clock3 size={14} strokeWidth={1.75} aria-hidden />
              No focus sessions in the last 14 days.
            </p>
          </div>
        )}
      </div>

      {model.anyPieces && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5" aria-label="Legend">
            {model.legend.map((l) => (
              <li key={l.key} className="flex max-w-full items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                <Dot color={l.color} />
                <span className="break-words">{l.name}</span>
              </li>
            ))}
            {model.anyFailed && (
              <li className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                <span className="inline-block h-2.5 w-3.5 shrink-0 rounded-sm border border-dashed border-zinc-400 opacity-70 dark:border-zinc-500" aria-hidden />
                Stopped by Strict Mode
              </li>
            )}
            {model.countedBars === 0 && (
              <li className="muted flex items-center gap-1.5 text-[11px]">
                <Clock3 size={13} strokeWidth={1.75} aria-hidden />
                No counted focus between {WINDOW_START} and {WINDOW_END}.
              </li>
            )}
          </ul>
          {model.outsideMin > 0 && <p className="muted tabular text-[11px]">{model.outsideMin} min outside {WINDOW_TEXT} not shown</p>}
        </div>
      )}
    </section>
  );
});
