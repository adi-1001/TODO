import { Check, Target } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { setChapterTargets } from '../../db/repo';
import { useChapters, useSubjects } from '../../hooks/useData';
import { showNotice } from '../../state/notice';
import { useUI } from '../../state/UIProvider';
import { Modal } from '../ui/Modal';
import { TargetPresets } from '../ui/TargetPresets';
import { Dot, Segmented } from '../ui/controls';

type Scope = 'all' | 'empty';

const PILL = 'press inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs font-semibold leading-snug whitespace-normal break-normal transition';
const PILL_ON = 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-300/80 dark:bg-amber-300/90 dark:text-zinc-950';
const PILL_OFF = 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-white/10 dark:border-t-white/[0.16] dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:border-white/20';

const chapterWord = (n: number) => (n === 1 ? 'chapter' : 'chapters');

/** Set Target Qs: one target for every chapter of a subject, or of all subjects, in one tap. */
export function BulkTargetsModal() {
  const { modal, closeModal } = useUI();
  const open = modal?.name === 'bulkTargets';
  const last = useRef<string | null>(null);
  if (modal?.name === 'bulkTargets') last.current = modal.subjectId;
  return (
    <Modal open={open} onClose={closeModal} eyebrow="Syllabus" title="Set Target Qs" size="lg">
      {/* The Modal unmounts its content once closed, so each opening starts fresh. */}
      <BulkTargetsForm key={last.current ?? 'all'} initialSubject={last.current} onDone={closeModal} />
    </Modal>
  );
}

function BulkTargetsForm({ initialSubject, onDone }: { initialSubject: string | null; onDone: () => void }) {
  const subjects = useSubjects();
  const chapters = useChapters();
  const [subjectId, setSubjectId] = useState<string | null>(initialSubject);
  const [scope, setScope] = useState<Scope>('empty');
  const [target, setTarget] = useState<number | null>(60);
  const [busy, setBusy] = useState(false);

  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  const inSubject = useMemo(() => {
    const live = new Set(subjects.map((s) => s.id));
    return chapters.filter((c) => (subject ? c.subjectId === subject.id : live.has(c.subjectId)));
  }, [chapters, subjects, subject]);
  const matching = useMemo(() => (scope === 'all' ? inSubject : inSubject.filter((c) => !c.targetQuestions)), [inSubject, scope]);
  const where = subject ? `${subject.name} ` : '';
  const n = matching.length;

  let preview: string;
  if (inSubject.length === 0) preview = subject ? `${subject.name} has no chapters yet.` : 'There are no chapters yet. Add them in the Syllabus Tracker.';
  else if (n === 0) preview = 'Every chapter here already has a target. Choose All chapters to replace them.';
  else if (target === null) preview = 'Choose a target first.';
  else if (scope === 'all') preview = `Set all ${n} ${where}${chapterWord(n)} to ${target} Qs each.`;
  else preview = `Set ${n} ${where}${chapterWord(n)} with 0 target Qs to ${target} Qs each.`;

  const apply = async () => {
    if (target === null || n === 0 || busy) return;
    setBusy(true);
    try {
      const changed = await setChapterTargets(
        matching.map((c) => c.id),
        target,
      );
      showNotice(changed === 0 ? 'Those chapters already had that target.' : `Target set: ${changed} ${chapterWord(changed)} at ${target} Qs each.`);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 pt-1">
      <section className="space-y-2">
        <h3 className="label mb-0">Subject</h3>
        <div role="radiogroup" aria-label="Subject" className="flex flex-wrap gap-1.5">
          <button type="button" role="radio" aria-checked={subjectId === null} className={`${PILL} ${subjectId === null ? PILL_ON : PILL_OFF}`} onClick={() => setSubjectId(null)}>
            All Subjects
          </button>
          {subjects.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={subjectId === s.id} className={`${PILL} ${subjectId === s.id ? PILL_ON : PILL_OFF}`} onClick={() => setSubjectId(s.id)}>
              <Dot color={s.color} className="h-2 w-2 rounded-full" />
              {s.name}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="label mb-0">Apply to</h3>
        <Segmented<Scope>
          label="Chapters to apply to"
          value={scope}
          onChange={setScope}
          wrap
          options={[
            { value: 'empty', label: 'Only chapters with 0 target Qs' },
            { value: 'all', label: 'All chapters' },
          ]}
        />
        <p className="muted text-[11px] leading-relaxed">
          {inSubject.length} {chapterWord(inSubject.length)} in {subject ? subject.name : 'all subjects'}, {inSubject.filter((c) => !c.targetQuestions).length} without a target.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="label mb-0">Target Questions per chapter</h3>
        <TargetPresets value={target} onChange={setTarget} label="Target Questions per chapter" />
      </section>

      <div className="glass flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="flex min-w-[200px] flex-1 items-start gap-2 text-sm font-semibold leading-relaxed text-zinc-800 dark:text-zinc-100" aria-live="polite">
          <Target size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
          <span>{preview}</span>
        </p>
        <button type="button" className="btn-primary" onClick={() => void apply()} disabled={busy || n === 0 || target === null}>
          <Check size={14} strokeWidth={1.75} aria-hidden />
          Apply to {n} {chapterWord(n)}
        </button>
      </div>
    </div>
  );
}
