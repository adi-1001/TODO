import { Minus, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type SettingsSectionId = 'profile' | 'timer' | 'schedule' | 'notifications' | 'audio' | 'sync' | 'data';

export const SETTINGS_SECTIONS: { id: SettingsSectionId; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'timer', label: 'Timer, Clock and Health' },
  { id: 'schedule', label: 'Class Schedule' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'audio', label: 'Focus Audio' },
  { id: 'sync', label: 'Sync' },
  { id: 'data', label: 'Data Management' },
];

/**
 * Glass input for the settings cards: in dark mode a translucent surface with a brighter 1px
 * top edge, matching the cards. Options keep a solid background so native lists stay readable.
 */
export const FIELD =
  'field dark:border-white/[0.09] dark:border-t-white/[0.15] dark:bg-white/[0.04] dark:focus:border-amber-300/50 [&>option]:bg-white dark:[&>option]:bg-[#1A1E29]';
/** Preset pill. Active pills turn amber in dark mode; colour changes are instant (transform-only transitions). */
export const pillClass = (active: boolean) =>
  `press tabular inline-flex min-h-[32px] items-center whitespace-normal break-normal rounded-full border px-3 py-1 text-left text-xs font-semibold leading-snug transition ${
    active
      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-300/80 dark:bg-amber-300/90 dark:text-zinc-950 dark:shadow-[0_0_14px_rgba(252,211,77,0.22)]'
      : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:border-t-white/[0.16] dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:bg-white/[0.07]'
  }`;
interface SettingsSectionProps {
  id: SettingsSectionId;
  title: string;
  description?: string;
  highlighted: boolean;
  children: ReactNode;
}

/**
 * Settings card: `.card-plain` is specular glass in dark mode (1px brighter top edge, soft top
 * sheen). The ring overlay fades in for deep links (opacity only).
 */
export function SettingsSection({ id, title, description, highlighted, children }: SettingsSectionProps) {
  const headingId = `settings-${id}-title`;
  return (
    <section id={`settings-${id}`} aria-labelledby={headingId} className="card-plain relative scroll-mt-6 p-4 sm:p-6">
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-amber-400/70 transition-opacity duration-700 dark:ring-amber-300/60 ${highlighted ? 'opacity-100' : 'opacity-0'}`}
      />
      <div className="mb-5">
        <h2 id={headingId} className="section-title">
          {title}
        </h2>
        {description && <p className="muted mt-0.5 text-xs">{description}</p>}
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

/**
 * A labelled row with a control on the right. `stacked` puts the title and hint full width
 * with the control on its own line below, for rows whose hint needs the room.
 */
export function SettingRow({ title, hint, stacked = false, children }: { title: string; hint?: ReactNode; stacked?: boolean; children: ReactNode }) {
  if (stacked) {
    return (
      <div className="flex flex-col gap-2">
        <div className="w-full">
          <div className="whitespace-normal break-normal text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</div>
          {hint && <div className="muted mt-0.5 whitespace-normal break-normal text-xs leading-relaxed">{hint}</div>}
        </div>
        {children != null && children !== false && <div>{children}</div>}
      </div>
    );
  }
  // The text keeps at least 160px: below that the control drops to its own line instead of
  // squeezing the title to one word per line.
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-[160px] flex-1">
        <div className="whitespace-normal break-normal text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</div>
        {hint && <div className="muted mt-0.5 whitespace-normal break-normal text-xs leading-relaxed">{hint}</div>}
      </div>
      <div className="max-w-full shrink-0">{children}</div>
    </div>
  );
}

/** Calm inline message: neutral for results, amber for warnings. */
export function Note({ tone = 'neutral', children }: { tone?: 'neutral' | 'warn'; children: ReactNode }) {
  return (
    <p role="status" className={`text-xs ${tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'muted'}`}>
      {children}
    </p>
  );
}

interface BlurTextFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
}

/** Text input that keeps its own draft and saves on blur or Enter. */
export function BlurTextField({ label, value, onCommit, placeholder, maxLength = 80, autoComplete = 'off' }: BlurTextFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  const commit = () => {
    editing.current = false;
    const clean = draft.trim();
    setDraft(clean);
    if (clean !== value) onCommit(clean);
  };

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        className={FIELD}
        value={draft}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </div>
  );
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

interface NumberStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onCommit: (value: number) => void;
}

/** Number input with - and + buttons. Clamps to the range and saves on blur, Enter or a step. */
export function NumberStepper({ label, value, min, max, unit, onCommit }: NumberStepperProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(String(value));
  }, [value]);

  const save = (n: number) => {
    const next = clamp(Number.isFinite(n) ? n : value, min, max);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <div className="flex items-center gap-1">
      <button type="button" className="icon-btn press h-8 w-8 border border-zinc-200 dark:border-white/10 dark:border-t-white/[0.16] dark:bg-white/[0.03]" onClick={() => save(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`}>
        <Minus size={14} strokeWidth={1.75} />
      </button>
      <label htmlFor={id} className="sr-only">
        {label} ({unit})
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        className={`${FIELD} tabular w-16 px-2 text-center`}
        value={draft}
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          editing.current = false;
          save(draft.trim() === '' ? value : Number(draft));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <button type="button" className="icon-btn press h-8 w-8 border border-zinc-200 dark:border-white/10 dark:border-t-white/[0.16] dark:bg-white/[0.03]" onClick={() => save(value + 1)} disabled={value >= max} aria-label={`Increase ${label}`}>
        <Plus size={14} strokeWidth={1.75} />
      </button>
      <span className="muted ml-1 w-14 text-xs">{unit}</span>
    </div>
  );
}
