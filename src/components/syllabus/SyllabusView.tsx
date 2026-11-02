import { BookOpen, BookMarked, CheckCircle2, Clock3, Layers, Library, Plus, Target, type LucideIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { SUBJECT_COLORS } from '../../db/defaults';
import { addSubject } from '../../db/repo';
import { useChapters, useQuestionsByChapter, useQuestionsBySubject, useSubjects, useTasks } from '../../hooks/useData';
import { useLiveSessions } from '../../hooks/useLiveSessions';
import { focusMsByChapter, focusMsBySubject } from '../../lib/stats';
import { chaptersWithOpenBrushUp, lastStudiedByChapter } from '../../lib/decay';
import { useToday } from '../../hooks/useNow';
import { useUI } from '../../state/UIProvider';
import type { Chapter } from '../../types';
import { Segmented } from '../ui/controls';
import { LiquidBar } from '../ui/LiquidBar';
import { ChapterTracker } from './ChapterTracker';
import { SubjectCard } from './SubjectCard';
import { SubjectForm } from './SubjectForm';
import { TestsTab } from './TestsTab';
import { SYLLABUS_CARD, hm } from './shared';
import { subjectProgress } from '../../lib/syllabus';
import { questionGoal } from '../../lib/backlog';
import { goalTone } from '../../lib/solarPhase';

const NO_CHAPTERS: Chapter[] = [];

type Tab = 'subjects' | 'tests';

const TABS: { value: Tab; label: string }[] = [
  { value: 'subjects', label: 'Subjects' },
  { value: 'tests', label: 'Tests' },
];

/** Syllabus Tracker: every subject and chapter, with what is done and what is next, plus tests and deadlines. */
export function SyllabusView() {
  const { section, navigate, openBulkTargets } = useUI();
  const tab: Tab = section === 'tests' ? 'tests' : 'subjects';
  const [adding, setAdding] = useState(false);

  const changeTab = (t: Tab) => {
    if (t === tab) return;
    if (t === 'tests') navigate('syllabus', 'tests');
    else navigate('syllabus');
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white sm:text-xl">Syllabus Tracker</h1>
          <p className="muted text-xs sm:text-sm">
            {tab === 'tests' ? 'Tests and deadlines, with the chapters still left before each one.' : 'Every subject and chapter, with what is done and what is next.'}
          </p>
        </div>
        {tab === 'subjects' && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-soft press" onClick={() => openBulkTargets()}>
              <Target size={14} strokeWidth={1.75} aria-hidden />
              Set Target Qs
            </button>
            {!adding && <AddSubjectButton adding={adding} onClick={() => setAdding(true)} />}
          </div>
        )}
      </header>

      <Segmented label="Syllabus section" value={tab} onChange={changeTab} options={TABS} />

      {tab === 'tests' ? <TestsTab /> : <SubjectsTab adding={adding} setAdding={setAdding} />}
    </div>
  );
}

function AddSubjectButton({ adding, onClick }: { adding: boolean; onClick: () => void }) {
  return (
    <button type="button" className="btn-primary" onClick={onClick} aria-expanded={adding}>
      <Plus size={14} strokeWidth={1.75} aria-hidden />
      Add Subject
    </button>
  );
}

function SubjectsTab({ adding, setAdding }: { adding: boolean; setAdding: (v: boolean) => void }) {
  const subjects = useSubjects();
  const chapters = useChapters();
  const tasks = useTasks();
  const sessions = useLiveSessions();
  const questionsBySubject = useQuestionsBySubject();
  const questionsByChapter = useQuestionsByChapter();
  const { openTask } = useUI();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const msBySubject = useMemo(() => focusMsBySubject(sessions), [sessions]);
  const msByChapter = useMemo(() => focusMsByChapter(sessions, tasks), [sessions, tasks]);
  const today = useToday();
  const lastStudied = useMemo(() => lastStudiedByChapter(chapters, sessions), [chapters, sessions]);
  const brushUpOpen = useMemo(() => chaptersWithOpenBrushUp(tasks), [tasks]);

  const chaptersBySubject = useMemo(() => {
    const out = new Map<string, Chapter[]>();
    for (const c of chapters) {
      const list = out.get(c.subjectId);
      if (list) list.push(c);
      else out.set(c.subjectId, [c]);
    }
    return out;
  }, [chapters]);

  const openTasksByChapter = useMemo(() => {
    const out = new Map<string, number>();
    for (const t of tasks) {
      if (t.column === 'completed' || !t.chapterId) continue;
      out.set(t.chapterId, (out.get(t.chapterId) ?? 0) + 1);
    }
    return out;
  }, [tasks]);

  /** A chapter's own Target Questions, or else the targets of its tasks (open or done), summed. */
  const questionTargetByChapter = useMemo(() => {
    const out = new Map<string, number>();
    for (const t of tasks) {
      const goal = t.chapterId ? questionGoal(t) : null;
      if (goal === null || !t.chapterId) continue;
      out.set(t.chapterId, (out.get(t.chapterId) ?? 0) + goal);
    }
    for (const c of chapters) if (c.targetQuestions !== null) out.set(c.id, c.targetQuestions);
    return out;
  }, [tasks, chapters]);

  const summary = useMemo(() => {
    let completed = 0;
    let ms = 0;
    const all: Chapter[] = [];
    for (const s of subjects) {
      const list = chaptersBySubject.get(s.id) ?? NO_CHAPTERS;
      all.push(...list);
      completed += list.filter((c) => c.status === 'completed').length;
      ms += msBySubject.get(s.id) ?? 0;
    }
    // Weighted by milestones: the average progress of every chapter across subjects.
    return { subjects: subjects.length, chapters: all.length, completed, ms, pct: subjectProgress(all) };
  }, [subjects, chaptersBySubject, msBySubject]);

  const selected = subjects.find((s) => s.id === selectedId) ?? subjects[0] ?? null;
  const nextColor = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];

  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  const createSubject = async (name: string, color: string) => {
    const s = await addSubject(name, color);
    setSelectedId(s.id);
    setAdding(false);
  };

  return (
    <>
      {adding && (
        <section className={`${SYLLABUS_CARD} p-4 sm:p-5`} aria-label="Add Subject">
          <SubjectForm initialColor={nextColor} submitLabel="Add Subject" onSubmit={createSubject} onCancel={() => setAdding(false)} />
        </section>
      )}

      {subjects.length === 0 ? (
        !adding && (
          <section className={`${SYLLABUS_CARD} flex flex-col items-center gap-2 px-6 py-12 text-center`} aria-label="Syllabus is empty">
            <BookOpen size={20} strokeWidth={1.75} className="text-zinc-400 dark:text-zinc-500" aria-hidden />
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Your syllabus is empty.</p>
            <p className="muted max-w-sm text-xs">Add a subject, then its chapters, to track what is done and what is ongoing.</p>
            <div className="mt-2">
              <AddSubjectButton adding={adding} onClick={() => setAdding(true)} />
            </div>
          </section>
        )
      ) : (
        <>
          <section aria-label="Overall progress">
            {/* Bento grid: overall completion takes the wide tile on phones and tablets. */}
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
              <SummaryItem icon={Library} tint="sky" label="Subjects" value={String(summary.subjects)} />
              <SummaryItem icon={Layers} tint="sky" label="Chapters" value={String(summary.chapters)} />
              <SummaryItem icon={CheckCircle2} tint="emerald" label="Completed Chapters" value={String(summary.completed)} />
              <div className="glass relative col-span-2 flex min-w-0 flex-col gap-2 overflow-hidden p-4 sm:col-span-2 lg:col-span-1">
                <span aria-hidden className="pointer-events-none absolute inset-0 hidden dark:block" style={{ background: 'radial-gradient(120% 90% at 50% 0%, rgba(234,179,8,0.14), transparent 70%)' }} />
                <dt className="relative flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                  <BookMarked size={13} strokeWidth={1.75} className="text-amber-600 dark:text-amber-300" aria-hidden />
                  Overall Completion
                </dt>
                <dd className="relative flex flex-col gap-2.5">
                  <span className="tabular text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{summary.pct}%</span>
                  <LiquidBar value={summary.pct / 100} tone={goalTone(summary.pct / 100)} label="Overall completion" className="h-1.5" growIn />
                </dd>
              </div>
              <SummaryItem icon={Clock3} tint="amber" label="Time Spent" value={hm(summary.ms)} />
            </dl>
          </section>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Subjects">
            {subjects.map((s) => {
              const list = chaptersBySubject.get(s.id) ?? NO_CHAPTERS;
              return (
                <li key={s.id} className="min-w-0">
                  <SubjectCard
                    subject={s}
                    chapters={list}
                    questions={questionsBySubject.get(s.id) ?? 0}
                    focusMs={msBySubject.get(s.id) ?? 0}
                    selected={selected?.id === s.id}
                    onSelect={onSelect}
                  />
                </li>
              );
            })}
          </ul>

          {selected && (
            <ChapterTracker
              key={selected.id}
              subject={selected}
              chapters={chaptersBySubject.get(selected.id) ?? NO_CHAPTERS}
              msByChapter={msByChapter}
              openTasksByChapter={openTasksByChapter}
              questionsByChapter={questionsByChapter}
              questionTargetByChapter={questionTargetByChapter}
              lastStudied={lastStudied}
              brushUpOpen={brushUpOpen}
              today={today}
              openTask={openTask}
            />
          )}
        </>
      )}
    </>
  );
}

const TILE_TINT = {
  sky: { icon: 'text-sky-600 dark:text-sky-300', glow: 'rgba(56,189,248,0.12)', edge: 'dark:border-t-sky-300/40' },
  emerald: { icon: 'text-emerald-600 dark:text-emerald-300', glow: 'rgba(16,185,129,0.12)', edge: 'dark:border-t-emerald-300/40' },
  amber: { icon: 'text-amber-600 dark:text-amber-300', glow: 'rgba(234,179,8,0.12)', edge: 'dark:border-t-amber-300/40' },
} as const;

/** One frosted bento tile with a tinted top edge and a soft inner glow in dark mode. */
function SummaryItem({ icon: Icon, tint, label, value }: { icon: LucideIcon; tint: keyof typeof TILE_TINT; label: string; value: string }) {
  const t = TILE_TINT[tint];
  return (
    <div className={`glass relative flex min-w-0 flex-col gap-2 overflow-hidden p-4 ${t.edge}`}>
      <span aria-hidden className="pointer-events-none absolute inset-0 hidden dark:block" style={{ background: `radial-gradient(120% 90% at 50% 0%, ${t.glow}, transparent 70%)` }} />
      <dt className="relative flex items-start gap-1.5 whitespace-normal break-normal text-[11px] font-semibold leading-snug text-zinc-500 dark:text-zinc-400">
        <Icon size={13} strokeWidth={1.75} className={`mt-px shrink-0 ${t.icon}`} aria-hidden />
        {label}
      </dt>
      <dd className="tabular relative text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{value}</dd>
    </div>
  );
}
