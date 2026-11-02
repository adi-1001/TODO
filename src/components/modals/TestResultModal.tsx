import { Check, ListPlus, Minus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createFixTasks, deleteTestResult, saveTestResult, type ResultInput } from '../../db/repo';
import { isLiveStoreLoaded } from '../../db/liveStore';
import { useChapters, useSubjectMap, useTestResults, useTests } from '../../hooks/useData';
import { MISTAKE_COLORS, MISTAKE_TYPES, resultPercent } from '../../lib/tests';
import { useUI } from '../../state/UIProvider';
import type { Chapter, MistakeCounts, TestEvent, TestResult } from '../../types';
import { CHIP, CHIP_OFF, CHIP_ON, testTitle } from '../syllabus/shared';
import { Dot } from '../ui/controls';
import { Modal } from '../ui/Modal';

const FORM_ID = 'test-result-form';

const NO_MISTAKES: MistakeCounts = { conceptual: 0, calculation: 0, timePressure: 0, guessed: 0 };

interface Saved {
  pct: number;
  scored: number;
  total: number;
  weakCount: number;
}

type Phase = { step: 'form' } | { step: 'confirmDelete' } | { step: 'saved'; saved: Saved };

/** Rounds to two decimals so sums of marks like 0.1 + 0.2 read cleanly. */
const tidy = (n: number) => Math.round(n * 100) / 100;

function parseNum(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const numText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

/** Test Review: marks, mistakes, weak chapters and a reflection for one test. */
export function TestResultModal() {
  const { modal, closeModal } = useUI();
  const open = modal?.name === 'testResult';
  // Keep the last test while the dialog animates out.
  const lastId = useRef<string | null>(null);
  if (modal?.name === 'testResult') lastId.current = modal.testId;
  const testId = lastId.current;

  const tests = useTests();
  const results = useTestResults();
  const test = testId ? tests.find((t) => t.id === testId) : undefined;
  const hasResult = testId !== null && results.some((r) => r.testId === testId);

  const [phase, setPhase] = useState<Phase>({ step: 'form' });
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    setPhase({ step: 'form' });
    setOpenCount((n) => n + 1);
  }, [open, testId]);

  const remove = async () => {
    if (!testId) return;
    await deleteTestResult(testId);
    closeModal();
  };

  let footer: ReactNode;
  if (phase.step === 'saved') {
    footer = (
      <button type="button" className="btn-primary" onClick={closeModal}>
        Done
      </button>
    );
  } else if (phase.step === 'confirmDelete') {
    footer = (
      <>
        <span className="mr-auto self-center text-xs text-zinc-700 dark:text-zinc-200">Delete this result? The test stays.</span>
        <button type="button" className="btn-ghost" onClick={() => setPhase({ step: 'form' })}>
          Keep
        </button>
        <button
          type="button"
          className="btn bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-300/10 dark:text-rose-200 dark:hover:bg-rose-300/15"
          onClick={() => void remove()}
          autoFocus
        >
          <Trash2 size={14} strokeWidth={1.75} aria-hidden />
          Delete Result
        </button>
      </>
    );
  } else {
    footer = (
      <>
        {hasResult && (
          <button type="button" className="btn-ghost mr-auto text-rose-700 dark:text-rose-200" onClick={() => setPhase({ step: 'confirmDelete' })}>
            <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            Delete Result
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={closeModal}>
          Cancel
        </button>
        <button type="submit" form={FORM_ID} className="btn-primary" disabled={!test}>
          <Check size={14} strokeWidth={1.75} aria-hidden />
          Save Result
        </button>
      </>
    );
  }

  return (
    <Modal open={open} onClose={closeModal} eyebrow={test ? testTitle(test) : undefined} title="Test Review" size="lg" footer={footer}>
      {phase.step === 'saved' && testId ? (
        <SavedPanel testId={testId} saved={phase.saved} />
      ) : !test || !testId ? (
        <p className="muted py-4 text-sm">{isLiveStoreLoaded('tests') ? 'This test no longer exists.' : 'Loading the test.'}</p>
      ) : (
        <ResultForm
          key={`${testId}|${openCount}`}
          test={test}
          onSaved={(saved) => {
            if (saved.weakCount > 0) setPhase({ step: 'saved', saved });
            else closeModal();
          }}
        />
      )}
    </Modal>
  );
}

function SavedPanel({ testId, saved }: { testId: string; saved: Saved }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    try {
      const n = await createFixTasks(testId);
      setMessage(n > 0 ? `Added ${n} ${n === 1 ? 'task' : 'tasks'} to Current Topics` : 'These tasks are already on your Study Board');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-300/20 dark:bg-emerald-300/10">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Result saved</p>
        <p className="tabular mt-0.5 text-xs text-emerald-800 dark:text-emerald-200">
          {saved.scored} / {saved.total}, {saved.pct}%
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          You marked {saved.weakCount} weak {saved.weakCount === 1 ? 'chapter' : 'chapters'}. Add a task for each to the Study Board with steps to fix it.
        </p>
        <button type="button" className="btn-primary" onClick={() => void create()} disabled={busy || message !== null}>
          <ListPlus size={14} strokeWidth={1.75} aria-hidden />
          Create Fix Weak Chapter tasks
        </button>
        {message && (
          <p role="status" className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="min-w-0 space-y-2">
      <div className="flex min-h-[32px] items-center justify-between gap-2">
        <span id={id} className="label mb-0">
          {title}
        </span>
        {aside}
      </div>
      {children}
    </div>
  );
}

interface SubjectRow {
  scored: string;
  total: string;
}

function ResultForm({ test, onSaved }: { test: TestEvent; onSaved: (s: Saved) => void }) {
  const results = useTestResults();
  const chapters = useChapters();
  const subjectMap = useSubjectMap();

  const [loaded, setLoaded] = useState(false);
  const [scored, setScored] = useState('');
  const [total, setTotal] = useState(numText(test.totalMarks));
  const [rows, setRows] = useState<Record<string, SubjectRow>>({});
  const [rank, setRank] = useState('');
  const [percentile, setPercentile] = useState('');
  const [mistakes, setMistakes] = useState<MistakeCounts>(NO_MISTAKES);
  const [weak, setWeak] = useState<string[]>([]);
  const [reflection, setReflection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scoredTouched = useRef(false);
  const totalTouched = useRef(false);
  const savingRef = useRef(false);

  const subjectIds = useMemo(() => test.subjectIds.filter((id) => subjectMap.has(id)), [test.subjectIds, subjectMap]);

  // Prefill once from an existing result.
  useEffect(() => {
    if (loaded || !isLiveStoreLoaded('testResults')) return;
    const r: TestResult | undefined = results.find((x) => x.testId === test.id);
    if (r) {
      setScored(numText(r.scored));
      setTotal(numText(r.total));
      const next: Record<string, SubjectRow> = {};
      for (const s of r.subjects) next[s.subjectId] = { scored: numText(s.scored), total: numText(s.total) };
      setRows(next);
      setRank(numText(r.rank));
      setPercentile(numText(r.percentile));
      setMistakes({ ...NO_MISTAKES, ...r.mistakes });
      setWeak(r.weakChapterIds);
      setReflection(r.reflection);
      scoredTouched.current = true;
      totalTouched.current = true;
    }
    setLoaded(true);
  }, [loaded, results, test.id]);

  const sums = useMemo(() => {
    let s = 0;
    let t = 0;
    let anyScored = false;
    let allTotals = subjectIds.length > 0;
    for (const id of subjectIds) {
      const row = rows[id];
      const rs = row ? parseNum(row.scored) : null;
      const rt = row ? parseNum(row.total) : null;
      if (rs !== null) {
        s += rs;
        anyScored = true;
      }
      if (rt !== null) t += rt;
      else allTotals = false;
    }
    return { scored: tidy(s), total: tidy(t), anyScored, allTotals };
  }, [rows, subjectIds]);

  const changeRow = (id: string, field: keyof SubjectRow, value: string) => {
    const next = { ...rows, [id]: { scored: rows[id]?.scored ?? '', total: rows[id]?.total ?? '', [field]: value } };
    setRows(next);
    // Fill the overall marks from the subject rows until the student edits them by hand.
    let s = 0;
    let t = 0;
    let anyScored = false;
    let allTotals = subjectIds.length > 0;
    for (const sid of subjectIds) {
      const rs = parseNum(next[sid]?.scored ?? '');
      const rt = parseNum(next[sid]?.total ?? '');
      if (rs !== null) {
        s += rs;
        anyScored = true;
      }
      if (rt !== null) t += rt;
      else allTotals = false;
    }
    if (!scoredTouched.current && anyScored) setScored(String(tidy(s)));
    if (!totalTouched.current && allTotals) setTotal(String(tidy(t)));
  };

  const applySubjectTotals = () => {
    setScored(String(sums.scored));
    if (sums.allTotals) setTotal(String(sums.total));
  };

  const scoredNum = parseNum(scored);
  const totalNum = parseNum(total);
  const livePct = scoredNum !== null && totalNum !== null && totalNum > 0 ? resultPercent({ scored: scoredNum, total: totalNum }) : null;
  const sumsDiffer = sums.anyScored && (scoredNum !== sums.scored || (sums.allTotals && totalNum !== sums.total));

  // Weak chapter choices: the test syllabus first, then the other chapters of its subjects.
  const { testChapters, otherChapters } = useMemo(() => {
    const byId = new Map(chapters.map((c) => [c.id, c]));
    const own = test.chapterIds.map((id) => byId.get(id)).filter((c): c is Chapter => c !== undefined);
    const ownSet = new Set(own.map((c) => c.id));
    const subjectSet = new Set([...test.subjectIds, ...own.map((c) => c.subjectId)]);
    const others = chapters.filter((c) => !ownSet.has(c.id) && (subjectSet.has(c.subjectId) || weak.includes(c.id)));
    return { testChapters: own, otherChapters: others };
  }, [chapters, test.chapterIds, test.subjectIds, weak]);

  const toggleWeak = (id: string) => setWeak((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const stepMistake = (key: keyof MistakeCounts, delta: number) => setMistakes((m) => ({ ...m, [key]: Math.max(0, m[key] + delta) }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (savingRef.current || !loaded) return;
    if (totalNum === null || totalNum <= 0) {
      setError('Enter the total marks for the test.');
      return;
    }
    if (scoredNum === null || scoredNum < 0) {
      setError('Enter the marks you scored.');
      return;
    }
    if (scoredNum > totalNum) {
      setError('Marks scored cannot be more than the total marks.');
      return;
    }
    const rankNum = parseNum(rank);
    const pctileNum = parseNum(percentile);
    if (pctileNum !== null && (pctileNum < 0 || pctileNum > 100)) {
      setError('Percentile must be between 0 and 100.');
      return;
    }
    const chapterIds = new Set(chapters.map((c) => c.id));
    const weakIds = weak.filter((id) => chapterIds.has(id));
    const input: ResultInput = {
      scored: scoredNum,
      total: totalNum,
      subjects: subjectIds
        .map((id) => ({ subjectId: id, scored: parseNum(rows[id]?.scored ?? ''), total: parseNum(rows[id]?.total ?? '') }))
        .filter((s) => s.scored !== null || s.total !== null)
        .map((s) => ({ subjectId: s.subjectId, scored: s.scored ?? 0, total: s.total ?? 0 })),
      rank: rankNum,
      percentile: pctileNum,
      mistakes,
      weakChapterIds: weakIds,
      reflection: reflection.trim(),
    };
    savingRef.current = true;
    try {
      await saveTestResult(test.id, input);
      onSaved({ pct: resultPercent({ scored: scoredNum, total: totalNum }), scored: scoredNum, total: totalNum, weakCount: weakIds.length });
    } finally {
      savingRef.current = false;
    }
  };

  const numField = 'field tabular';

  return (
    <form id={FORM_ID} onSubmit={(e) => void submit(e)} className="space-y-6 pt-1" noValidate>
      <Section title="Overall marks">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 sm:gap-3">
          <div>
            <label htmlFor="result-scored" className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Marks scored
            </label>
            <input
              id="result-scored"
              data-autofocus
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              className={numField}
              value={scored}
              onChange={(e) => {
                scoredTouched.current = true;
                setScored(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div>
            <label htmlFor="result-total" className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Total marks
            </label>
            <input
              id="result-total"
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              className={numField}
              value={total}
              onChange={(e) => {
                totalTouched.current = true;
                setTotal(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="min-w-[4.5rem] pb-2 text-right" aria-live="polite">
            <span className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Percentage</span>
            <span className="tabular text-lg font-bold text-zinc-900 dark:text-white">{livePct === null ? '-' : `${livePct}%`}</span>
          </div>
        </div>
      </Section>

      {subjectIds.length > 0 && (
        <Section
          title="By subject"
          aside={
            sumsDiffer ? (
              <button type="button" className="min-h-[32px] rounded-lg px-1.5 text-[11px] font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white" onClick={applySubjectTotals}>
                Use subject totals ({sums.scored}
                {sums.allTotals ? ` / ${sums.total}` : ''})
              </button>
            ) : undefined
          }
        >
          <ul className="space-y-2">
            {subjectIds.map((id) => {
              const s = subjectMap.get(id)!;
              const row = rows[id];
              return (
                <li key={id} className="grid grid-cols-[minmax(0,1fr)_4.75rem_4.75rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_6rem]">
                  <span className="flex min-w-0 items-start gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    <Dot color={s.color} className="mt-1 rounded-full" />
                    <span className="min-w-0 break-words whitespace-normal leading-relaxed">{s.name}</span>
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    aria-label={`${s.name} marks scored`}
                    placeholder="Scored"
                    className={`${numField} px-2`}
                    value={row?.scored ?? ''}
                    onChange={(e) => changeRow(id, 'scored', e.target.value)}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    aria-label={`${s.name} total marks`}
                    placeholder="Total"
                    className={`${numField} px-2`}
                    value={row?.total ?? ''}
                    onChange={(e) => changeRow(id, 'total', e.target.value)}
                  />
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="result-rank" className="label">
            Rank (optional)
          </label>
          <input id="result-rank" type="number" inputMode="numeric" min={1} step={1} className={numField} value={rank} onChange={(e) => setRank(e.target.value)} />
        </div>
        <div>
          <label htmlFor="result-percentile" className="label">
            Percentile (optional)
          </label>
          <input
            id="result-percentile"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            className={numField}
            value={percentile}
            onChange={(e) => setPercentile(e.target.value)}
          />
        </div>
      </div>

      <Section title="Where marks were lost">
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-white/[0.06] dark:border-white/[0.07]">
          {MISTAKE_TYPES.map((m) => (
            <li key={m.key} className="flex items-center gap-3 px-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: MISTAKE_COLORS[m.key] }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-100">{m.label}</span>
                <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{m.hint}</span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5" role="group" aria-label={`${m.label} count`}>
                <button
                  type="button"
                  className="icon-btn disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  onClick={() => stepMistake(m.key, -1)}
                  disabled={mistakes[m.key] <= 0}
                  aria-label={`One fewer ${m.label}`}
                >
                  <Minus size={14} strokeWidth={1.75} />
                </button>
                <span className="tabular min-w-[2ch] text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100" aria-live="polite">
                  {mistakes[m.key]}
                </span>
                <button type="button" className="icon-btn" onClick={() => stepMistake(m.key, 1)} aria-label={`One more ${m.label}`}>
                  <Plus size={14} strokeWidth={1.75} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Weak chapters">
        {testChapters.length === 0 && otherChapters.length === 0 ? (
          <p className="muted text-xs">Link subjects or chapters to this test to choose weak chapters.</p>
        ) : (
          <div className="space-y-3">
            {testChapters.length > 0 && (
              <ChapterChips label="From this test's syllabus" chapters={testChapters} selected={weak} onToggle={toggleWeak} colorOf={(c) => subjectMap.get(c.subjectId)?.color} />
            )}
            {otherChapters.length > 0 && (
              <ChapterChips
                label={testChapters.length > 0 ? 'Other chapters' : 'Chapters'}
                chapters={otherChapters}
                selected={weak}
                onToggle={toggleWeak}
                colorOf={(c) => subjectMap.get(c.subjectId)?.color}
              />
            )}
          </div>
        )}
      </Section>

      <div>
        <label htmlFor="result-reflection" className="label">
          What went wrong, and what will I change before the next test?
        </label>
        <textarea id="result-reflection" className="field min-h-[96px] resize-y" value={reflection} onChange={(e) => setReflection(e.target.value)} maxLength={4000} />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-300/10 dark:text-amber-200">
          {error}
        </p>
      )}
    </form>
  );
}

function ChapterChips({
  label,
  chapters,
  selected,
  onToggle,
  colorOf,
}: {
  label: string;
  chapters: Chapter[];
  selected: string[];
  onToggle: (id: string) => void;
  colorOf: (c: Chapter) => string | undefined;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {chapters.map((c) => {
          const on = selected.includes(c.id);
          const color = colorOf(c);
          return (
            <button key={c.id} type="button" aria-pressed={on} className={`${CHIP} max-w-full text-left ${on ? CHIP_ON : CHIP_OFF}`} onClick={() => onToggle(c.id)}>
              {color && <Dot color={color} className="rounded-full" />}
              <span className="min-w-0 break-words whitespace-normal leading-snug">{c.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
