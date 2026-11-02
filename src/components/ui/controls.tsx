import type { ReactNode } from 'react';
import type { Priority } from '../../types';

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  size?: 'sm' | 'md';
}

export function Switch({ checked, onChange, label, size = 'md' }: SwitchProps) {
  const track = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9';
  const knob = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const shift = size === 'sm' ? 'translate-x-3' : 'translate-x-4';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors ${track} ${
        checked ? 'bg-peach-deep/90 dark:bg-amber-400/85 dark:shadow-[0_0_12px_rgba(245,158,11,0.45)]' : 'bg-zinc-300 dark:bg-white/[0.12]'
      }`}
    >
      <span className={`block rounded-full bg-white shadow transition-transform ${knob} ${checked ? shift : 'translate-x-0'}`} />
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  label: string;
  size?: 'sm' | 'md';
  /** Lets the pills flow onto more lines instead of running off a narrow screen. */
  wrap?: boolean;
}

/** Pill group like the Day / Week / Month selector in the reference. */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', wrap = false }: SegmentedProps<T>) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';
  const layout = wrap ? 'flex max-w-full flex-wrap gap-1.5' : 'inline-flex';
  return (
    <div role="radiogroup" aria-label={label} className={`${layout} items-center rounded-xl border border-zinc-200/70 bg-zinc-100 p-1 dark:border-white/[0.07] dark:border-t-white/[0.12] dark:bg-white/[0.03]`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`press inline-flex items-center gap-1.5 whitespace-normal break-normal rounded-lg text-left font-semibold leading-snug transition ${pad} ${
              active
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-amber-300/[0.14] dark:text-amber-100 dark:shadow-[inset_0_1px_0_rgba(252,211,77,0.35),0_0_12px_rgba(245,158,11,0.15)]'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  urgent: 'bg-rose-500/10 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300',
  'high-yield': 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200',
  normal: 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: 'Urgent',
  'high-yield': 'High-Yield',
  normal: 'Normal',
};

export function PriorityPill({ priority }: { priority: Priority }) {
  return <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[priority]}`}>{PRIORITY_LABEL[priority]}</span>;
}

export function Dot({ color, className = '' }: { color: string; className?: string }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${className}`} style={{ backgroundColor: color }} />;
}

/** Progress bar that fills with scaleX (a GPU transform), never by animating width. */
export function ProgressBar({ value, className = '', barClassName = 'bg-zinc-600 dark:bg-zinc-300', label }: { value: number; className?: string; barClassName?: string; label?: string }) {
  const ratio = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full w-full origin-left rounded-full transition-transform duration-500 ${barClassName}`} style={{ transform: `scaleX(${ratio})` }} />
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-zinc-200 px-4 py-6 text-center dark:border-white/10">
      <div className="text-zinc-400 dark:text-zinc-500">{icon}</div>
      <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{title}</div>
      {hint && <div className="text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</div>}
    </div>
  );
}
