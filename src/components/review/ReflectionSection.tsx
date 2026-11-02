import { Check, ChevronDown, ChevronUp, MessageSquareText, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';
import { memo, useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { addQuestion, deleteQuestion, moveQuestion, saveReflectionAnswer, updateQuestion } from '../../db/repo';
import { useEveningReview, useReflectionQuestions } from '../../hooks/useData';
import { useBackHandler } from '../../native/backButton';
import type { ReflectionQuestion } from '../../types';
import { EmptyState } from '../ui/controls';
import { ReviewSection } from './ReviewSection';

/** Glass input: translucent with a brighter top edge in dark mode. */
const GLASS_FIELD = 'field dark:border-white/[0.09] dark:border-t-white/[0.15] dark:bg-white/[0.04] dark:focus:border-amber-300/50';

const SAVE_DELAY_MS = 800;
const SAVED_VISIBLE_MS = 2000;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Reflection answers for one date. The parent remounts this section when the date changes,
 * so every draft starts fresh for the new date.
 */
export function ReflectionSection({ date }: { date: string }) {
  const questions = useReflectionQuestions();
  const review = useEveningReview(date);
  const [managing, setManaging] = useState(false);
  const ready = review !== undefined;
  useBackHandler(managing, () => setManaging(false));

  return (
    <ReviewSection
      title="Reflection"
      description="Short honest answers are enough. Each one saves on its own."
      action={
        questions.length > 0 ? (
          <button type="button" className="btn-ghost px-2.5 py-1.5" onClick={() => setManaging((m) => !m)} aria-pressed={managing}>
            {managing ? <Check size={14} strokeWidth={1.75} /> : <Settings2 size={14} strokeWidth={1.75} />}
            {managing ? 'Done' : 'Manage questions'}
          </button>
        ) : undefined
      }
    >
      {questions.length === 0 ? (
        <EmptyState icon={<MessageSquareText size={18} strokeWidth={1.75} />} title="No reflection questions" hint="Add a question below to shape your evening check-in." />
      ) : (
        <ol className="space-y-4">
          {questions.map((q, i) => (
            <li key={q.id}>
              <AnswerBlock
                date={date}
                question={q}
                saved={review?.answersByQuestionId[q.id]}
                ready={ready}
                managing={managing}
                isFirst={i === 0}
                isLast={i === questions.length - 1}
              />
            </li>
          ))}
        </ol>
      )}
      <AddQuestionForm />
    </ReviewSection>
  );
}

interface AnswerBlockProps {
  date: string;
  question: ReflectionQuestion;
  saved: string | undefined;
  ready: boolean;
  managing: boolean;
  isFirst: boolean;
  isLast: boolean;
}

const AnswerBlock = memo(function AnswerBlock({ date, question, saved, ready, managing, isFirst, isLast }: AnswerBlockProps) {
  const fieldId = useId();
  const statusId = useId();
  const qid = question.id;
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');

  const valueRef = useRef('');
  const lastSavedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedRef = useRef(false);
  const initialisedRef = useRef(false);
  const mountedRef = useRef(true);

  // Take the stored answer once the review has loaded. Later live updates (another tab or
  // device) are taken only while the student is not typing in this box.
  useEffect(() => {
    if (!ready) return;
    const next = saved ?? '';
    if (!initialisedRef.current) {
      initialisedRef.current = true;
      lastSavedRef.current = next;
      valueRef.current = next;
      setValue(next);
      return;
    }
    if (focusedRef.current || timerRef.current) return;
    lastSavedRef.current = next;
    if (next !== valueRef.current) {
      valueRef.current = next;
      setValue(next);
    }
  }, [ready, saved]);

  const save = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!initialisedRef.current) return;
    const text = valueRef.current;
    if (text === lastSavedRef.current) return;
    lastSavedRef.current = text;
    if (fadeRef.current) clearTimeout(fadeRef.current);
    setStatus('saving');
    try {
      await saveReflectionAnswer(date, qid, text);
      if (!mountedRef.current) return;
      setStatus('saved');
      fadeRef.current = setTimeout(() => setStatus('idle'), SAVED_VISIBLE_MS);
    } catch {
      lastSavedRef.current = null;
      if (mountedRef.current) setStatus('error');
    }
  }, [date, qid]);

  // Write a pending edit when the block goes away (date change, navigation).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (fadeRef.current) clearTimeout(fadeRef.current);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        if (valueRef.current !== lastSavedRef.current) void saveReflectionAnswer(date, qid, valueRef.current);
      }
    };
  }, [date, qid]);

  const onChange = (text: string) => {
    valueRef.current = text;
    setValue(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), SAVE_DELAY_MS);
  };

  const statusText = status === 'saving' ? 'Saving' : status === 'error' ? 'Not saved yet. It will try again when you type or leave the box.' : 'Saved';

  return (
    <div className="glass p-3.5">
      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
        <label htmlFor={fieldId} className="min-w-[160px] flex-1 whitespace-normal break-words text-sm font-medium leading-snug text-zinc-800 dark:text-zinc-100">
          {question.text}
        </label>
        <span
          id={statusId}
          role="status"
          className={`muted ml-auto max-w-full whitespace-normal break-normal pt-0.5 text-[11px] transition-opacity duration-300 ${status === 'idle' ? 'opacity-0' : 'opacity-100'} ${status === 'error' ? 'text-amber-700 dark:text-amber-300' : ''}`}
        >
          {statusText}
        </span>
      </div>
      {managing && <QuestionTools question={question} isFirst={isFirst} isLast={isLast} />}
      <textarea
        id={fieldId}
        className={`${GLASS_FIELD} custom-scroll min-h-[76px] resize-y leading-relaxed`}
        rows={3}
        value={value}
        readOnly={!ready}
        aria-busy={!ready}
        aria-describedby={statusId}
        placeholder={ready ? 'Write a few words' : 'Loading'}
        maxLength={4000}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          void save();
        }}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
});

function QuestionTools({ question, isFirst, isLast }: { question: ReflectionQuestion; isFirst: boolean; isLast: boolean }) {
  const editId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question.text);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useBackHandler(editing, () => {
    setDraft(question.text);
    setEditing(false);
  });
  useBackHandler(confirmDelete, () => setConfirmDelete(false));

  const commit = () => {
    const clean = draft.trim();
    if (clean && clean !== question.text) void updateQuestion(question.id, clean);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="mb-2 flex items-center gap-1.5">
        <label htmlFor={editId} className="sr-only">
          Question text
        </label>
        <input
          id={editId}
          className={GLASS_FIELD}
          value={draft}
          autoFocus
          maxLength={300}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(question.text);
              setEditing(false);
            }
          }}
        />
        <button type="button" className="icon-btn shrink-0" onClick={commit} disabled={!draft.trim()} aria-label="Save question">
          <Check size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn shrink-0"
          onClick={() => {
            setDraft(question.text);
            setEditing(false);
          }}
          aria-label="Cancel editing"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/[0.07] dark:text-amber-100">
        <span className="min-w-[160px] flex-1 whitespace-normal break-normal">Delete this question from your check-in?</span>
        <button type="button" className="btn-soft px-2.5 py-1" onClick={() => void deleteQuestion(question.id)}>
          <Trash2 size={14} strokeWidth={1.75} />
          Delete
        </button>
        <button type="button" className="btn-ghost px-2.5 py-1" onClick={() => setConfirmDelete(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1">
      {question.builtIn && (
        <span className="mr-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">Built-in</span>
      )}
      <button
        type="button"
        className="icon-btn h-7 w-7"
        onClick={() => {
          setDraft(question.text);
          setEditing(true);
        }}
        aria-label="Edit question"
      >
        <Pencil size={14} strokeWidth={1.75} />
      </button>
      <button type="button" className="icon-btn h-7 w-7" onClick={() => void moveQuestion(question.id, -1)} disabled={isFirst} aria-label="Move question up">
        <ChevronUp size={16} strokeWidth={1.75} />
      </button>
      <button type="button" className="icon-btn h-7 w-7" onClick={() => void moveQuestion(question.id, 1)} disabled={isLast} aria-label="Move question down">
        <ChevronDown size={16} strokeWidth={1.75} />
      </button>
      <button type="button" className="icon-btn h-7 w-7" onClick={() => setConfirmDelete(true)} aria-label="Delete question">
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function AddQuestionForm() {
  const inputId = useId();
  const [text, setText] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    await addQuestion(clean);
    setText('');
  };

  return (
    <form onSubmit={(e) => void add(e)} className="mt-5 border-t border-zinc-200/70 pt-4 dark:border-white/[0.06]">
      <label htmlFor={inputId} className="label flex items-center gap-1">
        <Plus size={14} strokeWidth={1.75} />
        Add Custom Reflection Question
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          className={GLASS_FIELD}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="For example: Which topic felt clearer today?"
          autoComplete="off"
          maxLength={300}
        />
        <button type="submit" className="btn-soft shrink-0" disabled={!text.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}
