import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { deleteSubject, updateSubject } from '../../db/repo';
import { formatShort } from '../../lib/format';
import { subjectProgress } from '../../lib/syllabus';
import { useBackHandler } from '../../native/backButton';
import type { Chapter, Subject } from '../../types';
import { ProgressBar } from '../ui/controls';
import { LogQuestionsPopover } from './LogQuestionsPopover';
import { SubjectForm } from './SubjectForm';

interface SubjectCardProps {
  subject: Subject;
  /** The subject's chapters, in order. */
  chapters: Chapter[];
  questions: number;
  focusMs: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

type Mode = 'view' | 'edit' | 'confirm';

/** Subject overview card: chapters, questions, hours and weighted progress, with Edit and Delete in an overflow menu. */
export const SubjectCard = memo(function SubjectCard({ subject, chapters, questions, focusMs, selected, onSelect }: SubjectCardProps) {
  const [mode, setMode] = useState<Mode>('view');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const totalChapters = chapters.length;
  const completedChapters = useMemo(() => chapters.filter((c) => c.status === 'completed').length, [chapters]);
  const pct = useMemo(() => subjectProgress(chapters), [chapters]);
  useBackHandler(menuOpen, () => setMenuOpen(false));

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Glass surface (`.card-plain` is specular glass in dark mode). Selected: a brighter edge all round.
  const frame = `card-plain relative min-w-0 overflow-visible ${
    selected ? 'border-zinc-400 ring-1 ring-zinc-400/60 dark:border-white/25 dark:border-t-white/40 dark:ring-white/15' : ''
  }`;
  const hex = /^#[0-9a-f]{6}$/i.test(subject.color) ? subject.color : null;
  const stripe = (
    <>
      {/* Neon-lit left bar in the subject colour: a static glow, never animated. */}
      <span
        className="pointer-events-none absolute inset-y-3 left-0 w-[3px] rounded-r-full"
        style={{ backgroundColor: subject.color, boxShadow: `0 0 14px ${subject.color}` }}
        aria-hidden
      />
      {/* The bar's light spilling onto the glass, dark mode only. The view's content sits above it. */}
      {hex && mode === 'view' && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-24 rounded-l-2xl dark:block"
          style={{ background: `linear-gradient(90deg, ${hex}${selected ? '2e' : '1a'}, ${hex}00)` }}
          aria-hidden
        />
      )}
    </>
  );

  if (mode === 'edit') {
    return (
      <article className={`${frame} p-4 pl-5`} aria-label={`Edit ${subject.name}`}>
        {stripe}
        <SubjectForm
          compact
          initialName={subject.name}
          initialColor={subject.color}
          submitLabel="Save"
          onSubmit={async (name, color) => {
            await updateSubject(subject.id, { name, color });
            setMode('view');
          }}
          onCancel={() => setMode('view')}
        />
      </article>
    );
  }

  if (mode === 'confirm') {
    return (
      <article className={`${frame} flex flex-col gap-3 p-4 pl-5`} aria-label={`Delete ${subject.name}`}>
        {stripe}
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{subject.name}</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">Delete this subject and its chapters? Tasks stay on the board.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-300/10 dark:text-rose-200 dark:hover:bg-rose-300/15"
            onClick={() => void deleteSubject(subject.id)}
            autoFocus
          >
            <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            Delete
          </button>
          <button type="button" className="btn-ghost" onClick={() => setMode('view')}>
            Cancel
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className={frame}>
      {stripe}
      <button
        type="button"
        onClick={() => onSelect(subject.id)}
        aria-pressed={selected}
        className="relative block w-full rounded-2xl p-4 pb-3 pl-5 pr-12 text-left transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:bg-white/[0.02]"
      >
        <span className="block min-w-[120px] whitespace-normal break-words text-sm font-bold leading-relaxed text-zinc-900 dark:text-white">{subject.name}</span>
        <span className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
          <Stat label="Chapters" value={String(totalChapters)} />
          <Stat label="Completed" value={String(completedChapters)} />
          <Stat label="Questions Practiced" value={String(questions)} />
          <Stat label="Hours Logged" value={formatShort(focusMs)} />
        </span>
        <span className="mt-3 flex items-center gap-2">
          <ProgressBar value={pct / 100} label={`${subject.name} progress`} barClassName="bg-emerald-500 dark:bg-emerald-400" className="h-1.5" />
          <span className="tabular w-9 shrink-0 text-right text-xs font-semibold text-zinc-700 dark:text-zinc-200">{pct}%</span>
        </span>
      </button>

      <LogQuestionsPopover subject={subject} chapters={chapters} className="px-4 pb-3 pl-5" />

      <div ref={menuRef} className="absolute right-2 top-2">
        <button
          type="button"
          className="icon-btn"
          aria-label={`More actions for ${subject.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Ellipsis size={16} strokeWidth={1.75} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            aria-label={`${subject.name} actions`}
            className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#1A1E29]"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]"
              onClick={() => {
                setMenuOpen(false);
                setMode('edit');
              }}
              autoFocus
            >
              <Pencil size={14} strokeWidth={1.75} aria-hidden />
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]"
              onClick={() => {
                setMenuOpen(false);
                setMode('confirm');
              }}
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
              Delete
            </button>
          </div>
        )}
      </div>
    </article>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="block min-w-0">
      <span className="block whitespace-normal break-normal text-[10px] font-semibold leading-snug text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="tabular block text-base font-bold text-zinc-900 dark:text-white">{value}</span>
    </span>
  );
}
