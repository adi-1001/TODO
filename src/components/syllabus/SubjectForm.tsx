import { Check } from 'lucide-react';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { SUBJECT_COLORS } from '../../db/defaults';

interface SubjectFormProps {
  initialName?: string;
  initialColor: string;
  submitLabel: string;
  onSubmit: (name: string, color: string) => void | Promise<void>;
  onCancel: () => void;
  compact?: boolean;
}

/** Name plus colour swatches. Used to add a subject and to edit one in place. */
export function SubjectForm({ initialName = '', initialColor, submitLabel, onSubmit, onCancel, compact = false }: SubjectFormProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const colorsId = useId();
  const trimmed = name.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSubmit(trimmed, color);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} className={`flex flex-col gap-3 ${compact ? '' : 'sm:flex-row sm:flex-wrap sm:items-end'}`}>
      <div className={compact ? '' : 'w-full sm:w-64'}>
        <label htmlFor={nameId} className="label">
          Subject name
        </label>
        <input
          id={nameId}
          className="field dark:border-white/[0.09] dark:border-t-white/[0.15] dark:bg-white/[0.04]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="For example, Physics"
          maxLength={60}
          autoFocus
          autoComplete="off"
        />
      </div>
      <div>
        <span id={colorsId} className="label">
          Colour
        </span>
        <div role="radiogroup" aria-labelledby={colorsId} className="flex flex-wrap items-center gap-1.5">
          {SUBJECT_COLORS.map((c, i) => {
            const active = c.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`Colour ${i + 1}`}
                onClick={() => setColor(c)}
                className={`flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-white transition-transform hover:scale-105 dark:ring-offset-[#12151C] ${
                  active ? 'ring-2 ring-zinc-900 dark:ring-white' : ''
                }`}
                style={{ backgroundColor: c }}
              >
                {active && <Check size={14} strokeWidth={1.75} className="text-white" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" className="btn-primary" disabled={!trimmed || saving}>
          {submitLabel}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
