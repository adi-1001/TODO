import { Check, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { NO_FILTERS, NO_REPEAT, SUBJECT_COLORS, UNIT_SUGGESTIONS } from '../../db/defaults';
import { addChapter, addSubject, addTask, editTask, type TaskInput } from '../../db/repo';
import { useChapters, useSettings, useSubjects, useTasks } from '../../hooks/useData';
import { useToday } from '../../hooks/useNow';
import { notificationsSupported, requestNotificationPermission } from '../../hooks/useReminders';
import { formatDayShort, formatShort } from '../../lib/format';
import { GENERAL_COLOR } from '../../lib/stats';
import { TASK_KINDS } from '../../lib/backlog';
import { isQuestionUnit } from '../../lib/questions';
import { estimatedTotalMinutes } from '../../lib/target';
import { MINUTE, addDays } from '../../lib/time';
import { useUI, type TaskDialogOptions } from '../../state/UIProvider';
import type { Category, Priority, RepeatKind, TargetMode, Task, TaskFilters, TaskKind } from '../../types';
import { Modal } from '../ui/Modal';
import { TargetPresets } from '../ui/TargetPresets';
import { TimeInput12h } from '../ui/TimeInput12h';
import { PRIORITY_LABEL, Segmented, Switch } from '../ui/controls';

const FORM_ID = 'task-form';
const PRIORITIES: Priority[] = ['urgent', 'high-yield', 'normal'];
const MINUTE_CHIPS = [15, 25, 50];

/** New tasks follow the lane until a category is picked: Current is live homework, Pending is catch-up. */
const kindForLane = (c: Category): TaskKind => (c === 'current' ? 'homework' : 'backlog');
const MAX_POMODOROS = 20;

const SWATCH_NAMES: Record<string, string> = {
  '#F5A35C': 'Orange',
  '#6FA8DC': 'Blue',
  '#E79AA6': 'Pink',
  '#86BFA0': 'Green',
  '#B39DDB': 'Purple',
  '#E6C35C': 'Yellow',
  '#7CC4C6': 'Teal',
  '#C9A27E': 'Tan',
};

const FILTER_LABELS: { key: keyof TaskFilters; label: string }[] = [
  { key: 'examWeightage', label: 'Carries direct exam weightage' },
  { key: 'activeRecall', label: 'Focuses on active problem solving or recall' },
  { key: 'requiredForClass', label: 'Required for current ongoing classes' },
];

/** Indexed by how many Priority Filter boxes are ticked. */
const FILTER_NOTES = [
  'This may be lower-value work. You can still add it.',
  'Worth a look: could this be shorter or more active?',
  'A good choice for today.',
  'A strong use of study time.',
];

const REPEAT_OPTIONS: { value: RepeatKind; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays (Mon to Fri)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'interval', label: 'Custom interval' },
];

type DueChoice = 'today' | 'tomorrow' | 'week' | 'custom' | 'none';

const DUE_OPTIONS: { value: DueChoice; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'Next Week' },
  { value: 'custom', label: 'Custom' },
  { value: 'none', label: 'None' },
];

const clampInt = (raw: string | number, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(raw));
  if (raw === '' || !Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

function dueFromChoice(choice: DueChoice, custom: string, today: string): string | null {
  if (choice === 'today') return today;
  if (choice === 'tomorrow') return addDays(today, 1);
  if (choice === 'week') return addDays(today, 7);
  if (choice === 'custom') return custom || null;
  return null;
}

function choiceFromDate(date: string | null, today: string): DueChoice {
  if (!date) return 'none';
  if (date === today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';
  if (date === addDays(today, 7)) return 'week';
  return 'custom';
}

/** True when the browser has blocked notifications. Reading the permission can throw where the API is missing or restricted. */
function notificationDenied(): boolean {
  try {
    return typeof Notification !== 'undefined' && Notification.permission === 'denied';
  } catch {
    return false;
  }
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

const LINK_BTN = 'text-[11px] font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white';
const CHIP = 'tabular rounded-full border px-3 py-1.5 text-xs font-semibold transition';
const CHIP_ON = 'border-zinc-900 bg-zinc-900 text-white dark:border-amber-300/80 dark:bg-amber-300/90 dark:text-zinc-950';
const CHIP_OFF = 'border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-300 dark:hover:border-white/20 dark:hover:text-white';

/** The Priority Filter dialog: adds a task, or edits one when `options.taskId` is set. */
export function TaskModal() {
  const { modal, closeModal } = useUI();
  const open = modal?.name === 'task';
  // Keep the last options while the dialog animates out.
  const lastOptions = useRef<TaskDialogOptions>({});
  if (modal?.name === 'task') lastOptions.current = modal.options;
  const options = lastOptions.current;
  const editing = Boolean(options.taskId);
  const formKey = `${options.taskId ?? 'new'}|${options.category ?? ''}|${options.subjectId ?? ''}|${options.chapterId ?? ''}`;

  return (
    <Modal
      open={open}
      onClose={closeModal}
      eyebrow={editing ? 'Edit Task' : 'New Task'}
      title="Priority Filter"
      size="lg"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={closeModal}>
            Cancel
          </button>
          <button type="submit" form={FORM_ID} className="btn-primary">
            <Check size={14} strokeWidth={1.75} />
            {editing ? 'Save Changes' : 'Add to Board'}
          </button>
        </>
      }
    >
      <TaskForm key={formKey} options={options} onDone={closeModal} />
    </Modal>
  );
}

/** Mounted fresh each time the dialog opens, so every field starts from the options. */
function TaskForm({ options, onDone }: { options: TaskDialogOptions; onDone: () => void }) {
  const subjects = useSubjects();
  const chapters = useChapters();
  const tasks = useTasks();
  const settings = useSettings();
  const today = useToday();
  const editingId = options.taskId ?? null;
  const initialCategory: Category = options.category ?? 'current';

  const [loaded, setLoaded] = useState(!editingId);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>(initialCategory);
  const [subjectId, setSubjectId] = useState(options.subjectId ?? '');
  const [chapterId, setChapterId] = useState(options.chapterId ?? '');
  const [priority, setPriority] = useState<Priority>('normal');
  const [targetMode, setTargetMode] = useState<TargetMode>('pomodoro');
  const [pomodoros, setPomodoros] = useState(2);
  const [minutesText, setMinutesText] = useState(String(settings.defaultPomodoroMinutes));
  const [minutesTouched, setMinutesTouched] = useState(false);
  const [unitTargetText, setUnitTargetText] = useState('20');
  const [unitLabel, setUnitLabel] = useState('Questions');
  const [dueChoice, setDueChoice] = useState<DueChoice>(initialCategory === 'current' ? 'today' : 'none');
  const [customDue, setCustomDue] = useState('');
  const [dueTouched, setDueTouched] = useState(false);
  const [repeatKind, setRepeatKind] = useState<RepeatKind>('never');
  const [intervalText, setIntervalText] = useState(String(NO_REPEAT.intervalDays));
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderTime, setReminderTime] = useState('08:00');
  const [inAppOnly, setInAppOnly] = useState(false);
  const [checklist, setChecklist] = useState('');
  const [filters, setFilters] = useState<TaskFilters>(NO_FILTERS);
  const [kind, setKind] = useState<TaskKind | null>(kindForLane(initialCategory));
  const [kindTouched, setKindTouched] = useState(false);
  const [targetQText, setTargetQText] = useState('');

  const [newSubjectOpen, setNewSubjectOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectColor, setNewSubjectColor] = useState(SUBJECT_COLORS[0]);
  const [newChapterOpen, setNewChapterOpen] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');

  const formRef = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);

  // Edit: load the task once and prefill every field.
  useEffect(() => {
    if (loaded || !editingId) return;
    const t: Task | undefined = tasks.find((x) => x.id === editingId);
    if (!t) return;
    setTitle(t.title);
    setCategory(t.category);
    setSubjectId(t.subjectId);
    setChapterId(t.chapterId ?? '');
    setPriority(t.priority);
    setTargetMode(t.targetMode);
    setPomodoros(Math.max(1, t.estimatedPomodoros));
    setMinutesText(String(t.pomodoroMinutes));
    setMinutesTouched(true);
    setUnitTargetText(String(t.unitTarget));
    setUnitLabel(t.unitLabel);
    const choice = choiceFromDate(t.dueDate, today);
    setDueChoice(choice);
    setCustomDue(choice === 'custom' && t.dueDate ? t.dueDate : '');
    setDueTouched(true);
    setRepeatKind(t.repeat.kind);
    setIntervalText(String(t.repeat.intervalDays));
    setReminderOn(t.reminderTime !== null);
    setReminderTime(t.reminderTime ?? '08:00');
    setInAppOnly(t.reminderTime !== null && (!notificationsSupported() || notificationDenied()));
    setChecklist(t.subtasks.map((s) => s.label).join('\n'));
    setFilters({ ...NO_FILTERS, ...t.filters });
    setKind(t.kind);
    setKindTouched(true);
    setTargetQText(t.targetQuestions === null ? '' : String(t.targetQuestions));
    setLoaded(true);
  }, [loaded, editingId, tasks, today]);

  // New tasks follow the default Pomodoro length until the student changes it.
  useEffect(() => {
    if (!minutesTouched && !editingId) setMinutesText(String(settings.defaultPomodoroMinutes));
  }, [settings.defaultPomodoroMinutes, minutesTouched, editingId]);

  // Pick a subject once subjects load: the chapter's subject when a chapter was given, else the first.
  useEffect(() => {
    if (subjectId || subjects.length === 0 || !loaded) return;
    if (chapterId) {
      if (chapters.length === 0) return;
      const ch = chapters.find((c) => c.id === chapterId);
      if (ch) {
        setSubjectId(ch.subjectId);
        return;
      }
    }
    setSubjectId(subjects[0].id);
  }, [subjectId, subjects, chapterId, chapters, loaded]);

  const subjectChapters = chapters.filter((c) => c.subjectId === subjectId);
  const minutesNum = clampInt(minutesText, 1, 240, settings.defaultPomodoroMinutes);
  const unitTargetNum = clampInt(unitTargetText, 1, 100_000, 1);
  const unitName = unitLabel.trim() || 'Questions';
  const dueDate = dueFromChoice(dueChoice, customDue, today);
  const ticked = FILTER_LABELS.filter((f) => filters[f.key]).length;
  const targetQNum = targetQText.trim() === '' ? null : clampInt(targetQText, 1, 100_000, 1);
  const unitIsQuestions = targetMode === 'unit' && isQuestionUnit(unitName);

  const changeCategory = (c: Category) => {
    setCategory(c);
    if (!kindTouched) setKind(kindForLane(c));
    if (!dueTouched) setDueChoice(c === 'current' ? 'today' : 'none');
  };

  const changeSubject = (id: string) => {
    setSubjectId(id);
    const ch = chapters.find((c) => c.id === chapterId);
    if (ch && ch.subjectId !== id) setChapterId('');
  };

  const chooseDue = (c: DueChoice) => {
    setDueChoice(c);
    setDueTouched(true);
    if (c === 'custom' && !customDue) setCustomDue(dueDate ?? today);
  };

  const toggleReminder = (on: boolean) => {
    setReminderOn(on);
    if (!on) {
      setInAppOnly(false);
      return;
    }
    requestNotificationPermission()
      .then((granted) => setInAppOnly(!granted))
      .catch(() => setInAppOnly(true));
  };

  const ensureSubject = async (): Promise<string> => {
    if (subjectId) return subjectId;
    const s = await addSubject('General', GENERAL_COLOR);
    setSubjectId(s.id);
    return s.id;
  };

  const createSubject = async () => {
    const name = newSubjectName.trim();
    if (!name) return;
    const s = await addSubject(name, newSubjectColor);
    setSubjectId(s.id);
    setChapterId('');
    setNewSubjectName('');
    setNewSubjectOpen(false);
  };

  const createChapter = async () => {
    const name = newChapterTitle.trim();
    if (!name) return;
    const sid = await ensureSubject();
    const ch = await addChapter(sid, name);
    setChapterId(ch.id);
    setNewChapterTitle('');
    setNewChapterOpen(false);
  };

  const enterTo = (fn: () => Promise<void>) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void fn();
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = title.trim();
    if (!clean || !loaded || savingRef.current) return;
    savingRef.current = true;
    try {
      const sid = await ensureSubject();
      const chapter = chapters.find((c) => c.id === chapterId);
      const cid = chapterId && (!chapter || chapter.subjectId === sid) ? chapterId : null;
      const input: TaskInput = {
        title: clean,
        subjectId: sid,
        chapterId: cid,
        kind,
        targetQuestions: unitIsQuestions ? null : targetQNum,
        category,
        priority,
        dueDate,
        targetMode,
        estimatedPomodoros: pomodoros,
        pomodoroMinutes: minutesNum,
        unitTarget: unitTargetNum,
        unitLabel: unitName,
        repeat: { kind: repeatKind, intervalDays: clampInt(intervalText, 1, 365, NO_REPEAT.intervalDays) },
        reminderTime: reminderOn ? reminderTime || '08:00' : null,
        filters,
        subtasks: checklist.split('\n'),
      };
      if (editingId) await editTask(editingId, input);
      else await addTask(input);
      onDone();
    } finally {
      savingRef.current = false;
    }
  };

  return (
    <form id={FORM_ID} ref={formRef} onSubmit={(e) => void submit(e)} className="space-y-5 pt-1">
      <Field label="Title" htmlFor="task-title">
        <input
          id="task-title"
          data-autofocus
          required
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          placeholder="For example: Electrostatics past papers"
          autoComplete="off"
          maxLength={200}
        />
      </Field>

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Lane">
          <Segmented<Category>
            label="Lane"
            value={category}
            onChange={changeCategory}
            options={[
              { value: 'current', label: 'Current Topic' },
              { value: 'pending', label: 'Pending Topic' },
            ]}
          />
        </Field>
        <div className="min-w-[9rem] flex-1">
          <Field label="Priority" htmlFor="task-priority">
            <select id="task-priority" className="field" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Subject"
          htmlFor="task-subject"
          aside={
            <button type="button" className={LINK_BTN} onClick={() => setNewSubjectOpen((v) => !v)} aria-expanded={newSubjectOpen}>
              {newSubjectOpen ? 'Cancel' : 'New subject'}
            </button>
          }
        >
          <select id="task-subject" className="field" value={subjectId} onChange={(e) => changeSubject(e.target.value)} disabled={subjects.length === 0}>
            {subjects.length === 0 && <option value="">General</option>}
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Chapter (Optional)"
          htmlFor="task-chapter"
          aside={
            <button type="button" className={LINK_BTN} onClick={() => setNewChapterOpen((v) => !v)} aria-expanded={newChapterOpen}>
              {newChapterOpen ? 'Cancel' : 'New chapter'}
            </button>
          }
        >
          <select id="task-chapter" className="field" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
            <option value="">No chapter</option>
            {subjectChapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {newSubjectOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 p-2 dark:border-white/10">
          <label htmlFor="task-new-subject" className="sr-only">
            New subject name
          </label>
          <input
            id="task-new-subject"
            className="field min-w-[8rem] flex-1 py-1.5"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            onKeyDown={enterTo(createSubject)}
            placeholder="Subject name"
            autoComplete="off"
            maxLength={60}
          />
          <div role="radiogroup" aria-label="Subject colour" className="flex flex-wrap items-center gap-1.5">
            {SUBJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={newSubjectColor === c}
                aria-label={SWATCH_NAMES[c] ?? c}
                title={SWATCH_NAMES[c] ?? c}
                onClick={() => setNewSubjectColor(c)}
                className={`h-5 w-5 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-[#161922] ${newSubjectColor === c ? 'ring-2 ring-zinc-700 dark:ring-zinc-200' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button type="button" className="btn-soft py-1.5" onClick={() => void createSubject()} disabled={!newSubjectName.trim()}>
            <Plus size={14} strokeWidth={1.75} />
            Add
          </button>
        </div>
      )}

      {newChapterOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 p-2 dark:border-white/10">
          <label htmlFor="task-new-chapter" className="sr-only">
            New chapter title
          </label>
          <input
            id="task-new-chapter"
            className="field min-w-[8rem] flex-1 py-1.5"
            value={newChapterTitle}
            onChange={(e) => setNewChapterTitle(e.target.value)}
            onKeyDown={enterTo(createChapter)}
            placeholder={subjects.length === 0 ? 'Chapter title (added under General)' : 'Chapter title'}
            autoComplete="off"
            maxLength={120}
          />
          <button type="button" className="btn-soft py-1.5" onClick={() => void createChapter()} disabled={!newChapterTitle.trim()}>
            <Plus size={14} strokeWidth={1.75} />
            Add
          </button>
        </div>
      )}

      <Field label="Task Category">
        <div role="radiogroup" aria-label="Task Category" className="flex flex-wrap gap-1.5">
          {TASK_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              className={`${CHIP} whitespace-normal text-left leading-snug ${kind === k.value ? CHIP_ON : CHIP_OFF}`}
              onClick={() => {
                setKind((prev) => (prev === k.value ? null : k.value));
                setKindTouched(true);
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="muted mt-1.5 break-words text-[11px] leading-relaxed" aria-live="polite">
          {kind ? TASK_KINDS.find((k) => k.value === kind)?.hint : 'No category. Tap one to count this task in the Backlog and Recovery card.'}
        </p>
      </Field>

      <div className="card space-y-3 p-4">
        <Field label="Target">
          <Segmented<TargetMode>
            label="Target mode"
            value={targetMode}
            onChange={setTargetMode}
            options={[
              { value: 'pomodoro', label: 'Pomodoros' },
              { value: 'unit', label: 'Units' },
              { value: 'none', label: 'No target' },
            ]}
          />
        </Field>

        {targetMode === 'pomodoro' && (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Estimated Pomodoros" htmlFor="task-pomodoros">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="icon-btn h-9 w-9 shrink-0 border border-zinc-200 dark:border-white/10"
                    onClick={() => setPomodoros((n) => Math.max(1, n - 1))}
                    disabled={pomodoros <= 1}
                    aria-label="One fewer Pomodoro"
                  >
                    <Minus size={14} strokeWidth={1.75} />
                  </button>
                  <input
                    id="task-pomodoros"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_POMODOROS}
                    className="field tabular w-16 text-center"
                    value={pomodoros}
                    onChange={(e) => {
                      if (e.target.value !== '') setPomodoros(clampInt(e.target.value, 1, MAX_POMODOROS, 1));
                    }}
                  />
                  <button
                    type="button"
                    className="icon-btn h-9 w-9 shrink-0 border border-zinc-200 dark:border-white/10"
                    onClick={() => setPomodoros((n) => Math.min(MAX_POMODOROS, n + 1))}
                    disabled={pomodoros >= MAX_POMODOROS}
                    aria-label="One more Pomodoro"
                  >
                    <Plus size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </Field>
              <span className="pb-2 text-sm text-zinc-400 dark:text-zinc-500" aria-hidden>
                ×
              </span>
              <Field label="Minutes per Pomodoro" htmlFor="task-minutes">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div role="radiogroup" aria-label="Minutes per Pomodoro" className="flex gap-1.5">
                    {MINUTE_CHIPS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={minutesNum === m}
                        className={`${CHIP} ${minutesNum === m ? CHIP_ON : CHIP_OFF}`}
                        onClick={() => {
                          setMinutesText(String(m));
                          setMinutesTouched(true);
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <input
                    id="task-minutes"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={240}
                    className="field tabular w-20 text-center"
                    value={minutesText}
                    onChange={(e) => {
                      setMinutesText(e.target.value);
                      setMinutesTouched(true);
                    }}
                    onBlur={() => setMinutesText(String(minutesNum))}
                  />
                </div>
              </Field>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300" aria-live="polite">
              Total Estimated Time: <span className="tabular font-semibold">{formatShort(estimatedTotalMinutes(pomodoros, minutesNum) * MINUTE)}</span>
            </p>
          </>
        )}

        {targetMode === 'unit' && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Target number" htmlFor="task-unit-target">
                <input
                  id="task-unit-target"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100000}
                  className="field tabular w-28"
                  value={unitTargetText}
                  onChange={(e) => setUnitTargetText(e.target.value)}
                  onBlur={() => setUnitTargetText(String(unitTargetNum))}
                />
              </Field>
              <div className="min-w-[10rem] flex-1">
                <Field label="Unit" htmlFor="task-unit-label">
                  <input
                    id="task-unit-label"
                    className="field"
                    list="task-unit-suggestions"
                    value={unitLabel}
                    onChange={(e) => setUnitLabel(e.target.value)}
                    placeholder="Questions"
                    autoComplete="off"
                    maxLength={40}
                  />
                  <datalist id="task-unit-suggestions">
                    {UNIT_SUGGESTIONS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </Field>
              </div>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300" aria-live="polite">
              Target: <span className="tabular font-semibold">{unitTargetNum}</span> {unitName}
            </p>
          </>
        )}

        {targetMode === 'none' && <p className="muted text-xs">A simple checkbox task with no time or count.</p>}

        <div className="border-t border-zinc-200/70 pt-3 dark:border-white/[0.06]">
          {unitIsQuestions ? (
            <p className="muted break-words text-xs leading-relaxed">
              Target Questions: the unit target above (<span className="tabular font-semibold">{unitTargetNum}</span> {unitName}) is this task's question goal.
            </p>
          ) : (
            <Field label="Target Questions (optional)">
              <TargetPresets value={targetQNum} onChange={(n) => setTargetQText(n === null ? '' : String(n))} label="Target Questions" allowNone step={5} />
              <p className="muted mt-1.5 whitespace-normal break-normal text-[11px] leading-relaxed" aria-live="polite">
                {targetQNum === null ? (
                  'Questions you log on this task still count toward its chapter.'
                ) : (
                  <>
                    Target: <span className="tabular font-semibold">{targetQNum} Qs</span>. Questions and focus time on this task also update its chapter in the Syllabus Tracker.
                  </>
                )}
              </p>
            </Field>
          )}
        </div>
      </div>

      <Field label="Due date">
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="radiogroup" aria-label="Due date" className="flex flex-wrap gap-1.5">
            {DUE_OPTIONS.map((o) => (
              <button key={o.value} type="button" role="radio" aria-checked={dueChoice === o.value} className={`${CHIP} ${dueChoice === o.value ? CHIP_ON : CHIP_OFF}`} onClick={() => chooseDue(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          {dueChoice === 'custom' && (
            <>
              <label htmlFor="task-due-custom" className="sr-only">
                Custom due date
              </label>
              <input
                id="task-due-custom"
                type="date"
                className="field tabular w-auto py-1.5"
                value={customDue}
                onChange={(e) => {
                  setCustomDue(e.target.value);
                  setDueTouched(true);
                }}
              />
            </>
          )}
          {dueDate && dueChoice !== 'custom' && <span className="muted tabular ml-1 text-xs">{formatDayShort(dueDate)}</span>}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Field label="Repeat" htmlFor="task-repeat">
            <select id="task-repeat" className="field" value={repeatKind} onChange={(e) => setRepeatKind(e.target.value as RepeatKind)}>
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {repeatKind === 'interval' && (
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <label htmlFor="task-interval">Every</label>
              <input
                id="task-interval"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                className="field tabular w-20 py-1.5 text-center"
                value={intervalText}
                onChange={(e) => setIntervalText(e.target.value)}
                onBlur={() => setIntervalText(String(clampInt(intervalText, 1, 365, NO_REPEAT.intervalDays)))}
              />
              <span>days</span>
            </div>
          )}
          {repeatKind !== 'never' && <p className="muted mt-1.5 text-[11px]">When you complete it, the next one is added automatically.</p>}
        </div>
        <div>
          <Field label="Reminder">
            <div className="flex flex-wrap items-center gap-3">
              <Switch checked={reminderOn} onChange={toggleReminder} label="Remind me" />
              <TimeInput12h value={reminderTime} onChange={setReminderTime} label="Reminder time" minuteStep={1} disabled={!reminderOn} />
            </div>
          </Field>
          {reminderOn && inAppOnly && <p className="muted mt-1.5 text-[11px]">Reminders will show inside the app while it is open.</p>}
        </div>
      </div>

      <Field label="Checklist (optional)" htmlFor="task-checklist">
        <textarea
          id="task-checklist"
          className="field custom-scroll min-h-[72px] resize-y"
          value={checklist}
          onChange={(e) => setChecklist(e.target.value)}
          placeholder="One step per line"
          rows={3}
        />
      </Field>

      <fieldset className="card space-y-2.5 p-4">
        <legend className="sr-only">Priority Filter questions</legend>
        {FILTER_LABELS.map((f) => (
          <label key={f.key} className="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 accent-zinc-900 dark:border-zinc-600 dark:accent-amber-300"
              checked={filters[f.key]}
              onChange={(e) => setFilters((prev) => ({ ...prev, [f.key]: e.target.checked }))}
            />
            <span>{f.label}</span>
          </label>
        ))}
        <p className="border-t border-zinc-200/70 pt-2.5 text-xs text-zinc-500 dark:border-white/[0.06] dark:text-zinc-400" aria-live="polite">
          {FILTER_NOTES[ticked]}
        </p>
      </fieldset>
    </form>
  );
}
