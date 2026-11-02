import { Check } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { saveTest, type TestInput } from '../../db/repo';
import { isLiveStoreLoaded } from '../../db/liveStore';
import { useChapters, useSubjects, useTests } from '../../hooks/useData';
import { useToday } from '../../hooks/useNow';
import { TEST_KINDS } from '../../lib/tests';
import { addDays, dayKey, daysInMonth } from '../../lib/time';
import { useUI, type TestDialogOptions } from '../../state/UIProvider';
import type { Chapter, TestKind } from '../../types';
import { CHIP, CHIP_OFF, CHIP_ON } from '../syllabus/shared';
import { Dot } from '../ui/controls';
import { Modal } from '../ui/Modal';

const FORM_ID = 'test-form';

type RepeatChoice = 'never' | '21' | '30' | 'custom';

const REPEAT_OPTIONS: { value: RepeatChoice; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: '21', label: 'Every 21 days (3 weeks)' },
  { value: '30', label: 'Every 30 days' },
  { value: 'custom', label: 'Custom' },
];

/** The same day next month, or the last day of next month when it is shorter. */
function inOneMonth(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const first = dayKey(new Date(y, m, 1));
  return dayKey(new Date(y, m, Math.min(d, daysInMonth(first))));
}

function repeatChoiceOf(every: number | null): RepeatChoice {
  if (every === null) return 'never';
  if (every === 21) return '21';
  if (every === 30) return '30';
  return 'custom';
}

/** Blank is null; anything else must be a finite number. Returns undefined when not valid. */
function optionalNumber(text: string): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function Field({ label, htmlFor, children, aside }: { label: string; htmlFor?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="label mb-0">
            {label}
          </label>
        ) : (
          <span className="label mb-0">{label}</span>
        )}
        {aside}
      </div>
      {children}
    </div>
  );
}

const LINK_BTN = 'min-h-[32px] rounded-lg px-1.5 text-[11px] font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white';

/** Add or edit a test or deadline. */
export function TestModal() {
  const { modal, closeModal } = useUI();
  const open = modal?.name === 'test';
  // Keep the last options while the dialog animates out.
  const lastOptions = useRef<TestDialogOptions>({});
  if (modal?.name === 'test') lastOptions.current = modal.options;
  const options = lastOptions.current;
  const editing = Boolean(options.testId);
  const formKey = `${options.testId ?? 'new'}|${(options.subjectIds ?? []).join(',')}|${(options.chapterIds ?? []).join(',')}`;

  return (
    <Modal
      open={open}
      onClose={closeModal}
      eyebrow={editing ? 'Edit Test' : 'New Test'}
      title="Test or Deadline"
      size="lg"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={closeModal}>
            Cancel
          </button>
          <button type="submit" form={FORM_ID} className="btn-primary">
            <Check size={14} strokeWidth={1.75} aria-hidden />
            {editing ? 'Save Changes' : 'Add Test'}
          </button>
        </>
      }
    >
      <TestForm key={formKey} options={options} onDone={closeModal} />
    </Modal>
  );
}

function TestForm({ options, onDone }: { options: TestDialogOptions; onDone: () => void }) {
  const subjects = useSubjects();
  const chapters = useChapters();
  const tests = useTests();
  const today = useToday();
  const editingId = options.testId ?? null;

  const [loaded, setLoaded] = useState(!editingId);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TestKind>('coaching');
  const [date, setDate] = useState('');
  const [repeat, setRepeat] = useState<RepeatChoice>('never');
  const [customDays, setCustomDays] = useState('14');
  const [subjectIds, setSubjectIds] = useState<string[]>(options.subjectIds ?? []);
  const [chapterIds, setChapterIds] = useState<string[]>(options.chapterIds ?? []);
  const [marksText, setMarksText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const derivedSubjects = useRef(false);

  // Edit: load the test once and prefill every field.
  useEffect(() => {
    if (loaded || !editingId || !isLiveStoreLoaded('tests')) return;
    const t = tests.find((x) => x.id === editingId);
    if (!t) return;
    setTitle(t.title);
    setKind(t.kind);
    setDate(t.date);
    setRepeat(repeatChoiceOf(t.repeatEveryDays));
    if (t.repeatEveryDays !== null) setCustomDays(String(t.repeatEveryDays));
    setSubjectIds(t.subjectIds);
    setChapterIds(t.chapterIds);
    setMarksText(t.totalMarks !== null ? String(t.totalMarks) : '');
    setTargetText(t.targetPercent !== null ? String(t.targetPercent) : '');
    setLoaded(true);
  }, [loaded, editingId, tests]);

  // New test prefilled with chapters only: select the subjects those chapters belong to.
  useEffect(() => {
    if (editingId || derivedSubjects.current || chapters.length === 0) return;
    derivedSubjects.current = true;
    const extra = chapters.filter((c) => chapterIds.includes(c.id)).map((c) => c.subjectId);
    if (extra.length > 0) setSubjectIds((cur) => [...new Set([...cur, ...extra])]);
  }, [editingId, chapters, chapterIds]);

  const chaptersBySubject = useMemo(() => {
    const out = new Map<string, Chapter[]>();
    for (const c of chapters) {
      const list = out.get(c.subjectId);
      if (list) list.push(c);
      else out.set(c.subjectId, [c]);
    }
    return out;
  }, [chapters]);

  const selectedSubjects = subjects.filter((s) => subjectIds.includes(s.id));
  const chapterSet = new Set(chapterIds);
  const quickDates = [
    { label: 'In 1 week', value: addDays(today, 7) },
    { label: 'In 3 weeks', value: addDays(today, 21) },
    { label: 'In 1 month', value: inOneMonth(today) },
  ];

  const toggleSubject = (id: string) => setSubjectIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleChapter = (id: string) => setChapterIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const setAllOfSubject = (subjectId: string, on: boolean) => {
    const ids = (chaptersBySubject.get(subjectId) ?? []).map((c) => c.id);
    setChapterIds((cur) => (on ? [...new Set([...cur, ...ids])] : cur.filter((x) => !ids.includes(x))));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!loaded || savingRef.current) return;
    if (!title.trim() && !kind) {
      setError('Enter a title or choose a kind.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Choose the date of the test.');
      return;
    }
    let every: number | null = null;
    if (repeat === '21') every = 21;
    else if (repeat === '30') every = 30;
    else if (repeat === 'custom') {
      const n = Number(customDays);
      if (!Number.isInteger(n) || n < 1 || n > 365) {
        setError('Repeat every 1 to 365 days.');
        return;
      }
      every = n;
    }
    const marks = optionalNumber(marksText);
    if (marks === undefined || (marks !== null && marks <= 0)) {
      setError('Total marks must be a number above 0, or left empty.');
      return;
    }
    const target = optionalNumber(targetText);
    if (target === undefined || (target !== null && (target < 0 || target > 100))) {
      setError('Target score must be between 0 and 100 percent, or left empty.');
      return;
    }
    const subjectSet = new Set(subjectIds);
    const input: TestInput = {
      title: title.trim(),
      kind,
      date,
      repeatEveryDays: every,
      subjectIds,
      // Only chapters of the selected subjects count toward the syllabus.
      chapterIds: chapters.filter((c) => chapterSet.has(c.id) && subjectSet.has(c.subjectId)).map((c) => c.id),
      totalMarks: marks,
      targetPercent: target,
    };
    savingRef.current = true;
    try {
      await saveTest(input, editingId ?? undefined);
      onDone();
    } finally {
      savingRef.current = false;
    }
  };

  return (
    <form id={FORM_ID} onSubmit={(e) => void submit(e)} className="space-y-5 pt-1" noValidate>
      <Field label="Title" htmlFor="test-title">
        <input
          id="test-title"
          data-autofocus
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="For example: Coaching Test 4"
          maxLength={120}
          autoComplete="off"
        />
      </Field>

      <Field label="Kind">
        <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1.5">
          {TEST_KINDS.map((k) => (
            <button key={k.value} type="button" role="radio" aria-checked={kind === k.value} className={`${CHIP} ${kind === k.value ? CHIP_ON : CHIP_OFF}`} onClick={() => setKind(k.value)}>
              {k.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Date" htmlFor="test-date">
        <input
          id="test-date"
          type="date"
          className="field"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setError(null);
          }}
          required
        />
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Quick dates">
          {quickDates.map((q) => (
            <button
              key={q.label}
              type="button"
              aria-pressed={date === q.value}
              className={`${CHIP} ${date === q.value ? CHIP_ON : CHIP_OFF}`}
              onClick={() => {
                setDate(q.value);
                setError(null);
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Repeat">
        <div role="radiogroup" aria-label="Repeat" className="flex flex-wrap gap-1.5">
          {REPEAT_OPTIONS.map((r) => (
            <button key={r.value} type="button" role="radio" aria-checked={repeat === r.value} className={`${CHIP} ${repeat === r.value ? CHIP_ON : CHIP_OFF}`} onClick={() => setRepeat(r.value)}>
              {r.label}
            </button>
          ))}
        </div>
        {repeat === 'custom' && (
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor="test-repeat-days" className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Every
            </label>
            <input
              id="test-repeat-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              className="field w-24"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
            />
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">days</span>
          </div>
        )}
      </Field>

      <Field label="Subjects">
        {subjects.length === 0 ? (
          <p className="muted text-xs">Add subjects in the Syllabus Tracker to link them here.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Subjects">
            {subjects.map((s) => {
              const on = subjectIds.includes(s.id);
              return (
                <button key={s.id} type="button" aria-pressed={on} className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`} onClick={() => toggleSubject(s.id)}>
                  <Dot color={s.color} className="rounded-full" />
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      {selectedSubjects.length > 0 && (
        <Field label="Test syllabus chapters">
          <div className="space-y-3">
            {selectedSubjects.map((s) => {
              const list = chaptersBySubject.get(s.id) ?? [];
              const allOn = list.length > 0 && list.every((c) => chapterSet.has(c.id));
              return (
                <div key={s.id} className="rounded-xl border border-zinc-200 p-3 dark:border-white/[0.07]">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-start gap-2 text-xs font-semibold leading-relaxed text-zinc-800 dark:text-zinc-100">
                      <Dot color={s.color} className="mt-1 rounded-full" />
                      <span className="min-w-0 break-words whitespace-normal leading-relaxed">{s.name}</span>
                      <span className="tabular muted shrink-0 font-medium">
                        {list.filter((c) => chapterSet.has(c.id)).length} of {list.length}
                      </span>
                    </span>
                    {list.length > 0 && (
                      <button type="button" className={LINK_BTN} onClick={() => setAllOfSubject(s.id, !allOn)}>
                        {allOn ? 'Clear' : 'Select all'}
                      </button>
                    )}
                  </div>
                  {list.length === 0 ? (
                    <p className="muted text-xs">No chapters in this subject yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${s.name} chapters`}>
                      {list.map((c) => {
                        const on = chapterSet.has(c.id);
                        return (
                          <button key={c.id} type="button" aria-pressed={on} className={`${CHIP} max-w-full text-left ${on ? CHIP_ON : CHIP_OFF}`} onClick={() => toggleChapter(c.id)}>
                            <span className="min-w-0 break-words whitespace-normal leading-snug">{c.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Total marks" htmlFor="test-marks">
          <input
            id="test-marks"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            className="field"
            value={marksText}
            onChange={(e) => setMarksText(e.target.value)}
            placeholder="Optional"
          />
        </Field>
        <Field label="Target score (%)" htmlFor="test-target">
          <input
            id="test-target"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            className="field"
            value={targetText}
            onChange={(e) => setTargetText(e.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-300/10 dark:text-amber-200">
          {error}
        </p>
      )}
    </form>
  );
}
