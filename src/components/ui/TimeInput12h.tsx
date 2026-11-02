import { useId } from 'react';
import { from12hParts, to12hParts } from '../../lib/timeFormat';

interface TimeInput12hProps {
  /** "HH:MM", 24-hour, as stored. */
  value: string;
  onChange: (hhmm: string) => void;
  /** Accessible name, for example "Monday block 1 start". */
  label: string;
  /** Minute choices step; 1 lists every minute. */
  minuteStep?: 1 | 5;
  disabled?: boolean;
  className?: string;
  onBlur?: () => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const SELECT =
  'tabular h-9 min-w-0 appearance-none rounded-lg border border-zinc-200 bg-zinc-100/80 px-2 text-center text-xs font-semibold text-zinc-900 focus:border-peach-deep/60 focus:outline-none disabled:opacity-50 dark:border-white/10 dark:bg-[#1A1E29] dark:text-zinc-100';

/**
 * A time picker that always shows hour, minute and AM or PM, whatever the phone's 24-hour
 * setting. The browser's own time input follows the device locale and can show 13:00, so it
 * is not used for times of day.
 */
export function TimeInput12h({ value, onChange, label, minuteStep = 5, disabled, className = '', onBlur }: TimeInput12hProps) {
  const id = useId();
  const { hour, minute, period } = to12hParts(value);
  const minutes = Array.from({ length: 60 / minuteStep }, (_, i) => i * minuteStep);
  // Keep an off-step stored minute (for example 10:41) selectable.
  if (!minutes.includes(minute)) minutes.push(minute), minutes.sort((a, b) => a - b);

  const set = (h: number, m: number, p: 'AM' | 'PM') => onChange(from12hParts(h, m, p));

  return (
    <div role="group" aria-label={label} className={`inline-flex items-center gap-1 ${className}`} onBlur={onBlur}>
      <label htmlFor={`${id}-h`} className="sr-only">
        {label} hour
      </label>
      <select id={`${id}-h`} className={`${SELECT} w-12`} value={hour} disabled={disabled} onChange={(e) => set(Number(e.target.value), minute, period)}>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-xs font-bold text-zinc-400" aria-hidden>
        :
      </span>
      <label htmlFor={`${id}-m`} className="sr-only">
        {label} minute
      </label>
      <select id={`${id}-m`} className={`${SELECT} w-12`} value={minute} disabled={disabled} onChange={(e) => set(hour, Number(e.target.value), period)}>
        {minutes.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-p`} className="sr-only">
        {label} AM or PM
      </label>
      <select id={`${id}-p`} className={`${SELECT} w-14`} value={period} disabled={disabled} onChange={(e) => set(hour, minute, e.target.value as 'AM' | 'PM')}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
