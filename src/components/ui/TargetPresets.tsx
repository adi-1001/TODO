import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SOURCE_PRESETS } from '../../lib/backlog';

const PILL = 'press min-h-9 rounded-full border px-3 py-1.5 text-left text-xs font-semibold leading-snug whitespace-normal break-normal transition';
const PILL_ON = 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-300/80 dark:bg-amber-300/90 dark:text-zinc-950 dark:shadow-[0_0_14px_rgba(252,211,77,0.22)]';
const PILL_OFF =
  'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:border-t-white/[0.16] dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:border-white/20 dark:hover:text-white';
const STEP = 'icon-btn press h-9 w-9 shrink-0 border border-zinc-200 disabled:opacity-40 dark:border-white/10';

const MAX = 100_000;

interface TargetPresetsProps {
  /** Current target, or null for none. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Accessible name of the group, for example "Target Questions for Kinematics". */
  label: string;
  /** Show a "No target" pill that clears the value. */
  allowNone?: boolean;
  /** Step of the - and + buttons. */
  step?: number;
  compact?: boolean;
}

/**
 * Smart Source Preset pills (DPP / Sheet 30, Topic Module 60, Standard Ref. Book 120, Heavy PYQ
 * Bank 150) plus a - / + stepper with tap-to-type, for setting Target Questions without typing.
 */
export function TargetPresets({ value, onChange, label, allowNone = false, step = 10, compact = false }: TargetPresetsProps) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);

  const commit = (raw: string) => {
    const n = Math.round(Number(raw));
    if (raw.trim() === '' || !Number.isFinite(n) || n < 1) {
      if (allowNone) onChange(null);
      else setText(value === null ? '' : String(value));
      return;
    }
    onChange(Math.min(MAX, n));
  };
  const bump = (dir: 1 | -1) => {
    const base = value ?? 0;
    const next = dir === 1 ? Math.min(MAX, base + step) : base - step;
    if (next < 1) {
      if (allowNone) onChange(null);
      else onChange(1);
      return;
    }
    onChange(next);
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {SOURCE_PRESETS.map((p) => {
          const on = value === p.questions;
          return (
            <button key={p.label} type="button" role="radio" aria-checked={on} className={`${PILL} ${on ? PILL_ON : PILL_OFF}`} onClick={() => onChange(p.questions)}>
              {p.label} <span className="tabular opacity-75">({p.questions} Qs)</span>
            </button>
          );
        })}
        {allowNone && (
          <button type="button" role="radio" aria-checked={value === null} className={`${PILL} ${value === null ? PILL_ON : PILL_OFF}`} onClick={() => onChange(null)}>
            No target
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={STEP} onClick={() => bump(-1)} disabled={value === null && !allowNone} aria-label={`${step} fewer target questions`}>
          <Minus size={14} strokeWidth={1.75} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX}
          className="field tabular w-24 text-center"
          value={text}
          placeholder="Custom"
          aria-label={`${label}, custom number`}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit((e.target as HTMLInputElement).value);
            }
          }}
        />
        <button type="button" className={STEP} onClick={() => bump(1)} aria-label={`${step} more target questions`}>
          <Plus size={14} strokeWidth={1.75} />
        </button>
        <span className="muted text-xs">Qs</span>
      </div>
    </div>
  );
}
