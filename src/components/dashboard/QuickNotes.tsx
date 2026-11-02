import { memo, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { StickyNote, Trash2 } from 'lucide-react';
import type { QuickNote, Subject } from '../../types';
import { addNote, deleteNote, setNoteResolved } from '../../db/repo';
import { useNotes, useSubjects } from '../../hooks/useData';
import { useToday } from '../../hooks/useNow';
import { formatDayShort, formatTimeOfDay } from '../../lib/format';
import { dayKey } from '../../lib/time';
import { useUI } from '../../state/UIProvider';
import { useTimer } from '../../timer/TimerProvider';
import { Dot, EmptyState } from '../ui/controls';

const PREVIEW = 8;

const DONE_TEXT = 'text-zinc-400 line-through decoration-zinc-300 dark:text-zinc-500 dark:decoration-zinc-600';

function StatusButton({ note }: { note: QuickNote }) {
  const done = note.resolved;
  return (
    <button
      type="button"
      onClick={() => void setNoteResolved(note.id, !done)}
      aria-label={done ? 'Done. Mark as open' : 'Open. Mark as done'}
      className={`rounded-md px-2.5 py-0.5 text-[11px] font-bold transition ${
        done
          ? 'bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/20'
          : 'bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/20'
      }`}
    >
      {done ? 'Done' : 'Open'}
    </button>
  );
}

function DeleteButton({ note, className }: { note: QuickNote; className: string }) {
  return (
    <button type="button" onClick={() => void deleteNote(note.id)} aria-label={`Delete note: ${note.text}`} title="Delete note" className={`icon-btn ${className}`}>
      <Trash2 size={14} strokeWidth={1.75} />
    </button>
  );
}

/** "1:05 PM" today, "3 Jun, 1:05 PM" on earlier days. */
function NoteTime({ note, today }: { note: QuickNote; today: string }) {
  const day = dayKey(note.createdAt);
  return (
    <span className="tabular whitespace-nowrap font-medium text-zinc-400 dark:text-zinc-500">
      {day !== today && `${formatDayShort(day)}, `}
      {formatTimeOfDay(note.createdAt)}
    </span>
  );
}

const NoteRow = memo(function NoteRow({ note, today }: { note: QuickNote; today: string }) {
  return (
    <tr className="group text-zinc-700 dark:text-zinc-300">
      <td className="max-w-[200px] py-2.5 pr-3 align-top">
        <div className="break-words whitespace-normal font-semibold leading-relaxed text-zinc-800 dark:text-zinc-100">{note.context}</div>
      </td>
      <td className="py-2.5 pr-3 align-top text-zinc-600 dark:text-zinc-400">
        <span className={`break-words whitespace-normal leading-relaxed ${note.resolved ? DONE_TEXT : ''}`}>{note.text}</span>
      </td>
      <td className="py-2.5 pr-3 align-top">
        <StatusButton note={note} />
      </td>
      <td className="py-2.5 align-top">
        <div className="flex items-center justify-end gap-1.5">
          <NoteTime note={note} today={today} />
          <DeleteButton note={note} className="h-6 w-6 opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100" />
        </div>
      </td>
    </tr>
  );
});

/** Subject named in a note's context, with its colour dot. */
function SubjectChip({ subject }: { subject: Subject }) {
  return (
    <span className="inline-flex max-w-full items-start gap-1.5 rounded-full border border-zinc-200/80 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-zinc-300">
      <Dot color={subject.color} className="mt-[3px] h-2 w-2 rounded-full" />
      <span className="min-w-0 break-words whitespace-normal leading-snug">{subject.name}</span>
    </span>
  );
}

/** Phone layout: a full-width glass card with the full note on top, then topic, subject, time and actions. */
const NoteCard = memo(function NoteCard({ note, today, subject }: { note: QuickNote; today: string; subject: Subject | undefined }) {
  return (
    <li className="glass w-full rounded-xl p-3 shadow-sm dark:shadow-[0_6px_18px_rgba(0,0,0,0.22)]">
      <p className={`break-words whitespace-normal text-sm leading-relaxed text-zinc-800 dark:text-zinc-100 ${note.resolved ? DONE_TEXT : ''}`}>{note.text}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-100 pt-2 text-[11px] dark:border-white/[0.06]">
        <div className="flex min-w-[140px] flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words whitespace-normal font-semibold leading-snug text-zinc-600 dark:text-zinc-300">{note.context}</span>
          {subject && <SubjectChip subject={subject} />}
          <NoteTime note={note} today={today} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <StatusButton note={note} />
          <DeleteButton note={note} className="h-8 w-8" />
        </div>
      </div>
    </li>
  );
});

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Finds the subject whose name appears in a note's context as a whole word, preferring the
 * longest name, so "Organic Chemistry" wins over "Chemistry".
 */
function subjectMatcher(subjects: Subject[]): (context: string) => Subject | undefined {
  const tests = subjects
    .filter((s) => s.name.trim() !== '')
    .sort((a, b) => b.name.trim().length - a.name.trim().length)
    .map((s) => ({ subject: s, re: new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(s.name.trim())}($|[^\\p{L}\\p{N}])`, 'iu') }));
  return (context) => tests.find((t) => t.re.test(context))?.subject;
}

export function QuickNotes() {
  const notes = useNotes();
  const subjects = useSubjects();
  const today = useToday();
  const subjectOf = useMemo(() => subjectMatcher(subjects), [subjects]);
  const timer = useTimer();
  const { noteFocusRequest } = useUI();
  const [text, setText] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialRequest = useRef(noteFocusRequest);

  useEffect(() => {
    if (noteFocusRequest === initialRequest.current) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [noteFocusRequest]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || saving) return;
    const topic = timer.activeTask?.title ?? 'General';
    const context = timer.state.status !== 'idle' ? `${topic}, ${timer.modeLabel}` : topic;
    setSaving(true);
    await addNote(text, context);
    setSaving(false);
    setText('');
    inputRef.current?.focus();
  };

  const visible = showAll ? notes : notes.slice(0, PREVIEW);

  return (
    <section className="space-y-3 border-t border-zinc-200/70 pt-4 dark:border-white/10" aria-labelledby="quick-notes-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="quick-notes-title" className="text-sm font-bold text-zinc-900 dark:text-white">
            Quick Notes
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">Write down a passing thought and return to your work.</p>
        </div>
        <form onSubmit={submit} className="flex w-full items-center gap-2 sm:w-auto sm:min-w-[300px] sm:max-w-md sm:flex-1">
          <label htmlFor="quick-note-input" className="sr-only">
            Quick note
          </label>
          <input
            ref={inputRef}
            id="quick-note-input"
            type="text"
            value={text}
            maxLength={280}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="A thought to come back to later"
            onChange={(e) => setText(e.target.value)}
            className="field py-1.5 text-xs"
          />
          <button type="submit" className="btn-primary shrink-0 py-1.5" disabled={!text.trim() || saving}>
            Save
          </button>
        </form>
      </div>

      {notes.length === 0 ? (
        <EmptyState icon={<StickyNote size={18} strokeWidth={1.75} />} title="No notes yet" hint="Type a thought above and press Enter. It waits here for after your session." />
      ) : (
        <>
          <ul className="space-y-2 sm:hidden" aria-label="Quick notes">
            {visible.map((n) => (
              <NoteCard key={n.id} note={n} today={today} subject={subjectOf(n.context)} />
            ))}
          </ul>
          <div className="custom-scroll hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-zinc-400 dark:border-white/5 dark:text-zinc-500">
                  <th scope="col" className="pb-2 pr-3 font-medium">
                    Context
                  </th>
                  <th scope="col" className="pb-2 pr-3 font-medium">
                    Note
                  </th>
                  <th scope="col" className="pb-2 pr-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                {visible.map((n) => (
                  <NoteRow key={n.id} note={n} today={today} />
                ))}
              </tbody>
            </table>
          </div>
          {notes.length > PREVIEW && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="btn-ghost py-1.5" aria-expanded={showAll}>
              {showAll ? (
                'Show less'
              ) : (
                <>
                  Show all <span className="tabular">({notes.length})</span>
                </>
              )}
            </button>
          )}
        </>
      )}
    </section>
  );
}
