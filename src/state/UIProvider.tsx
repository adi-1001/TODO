import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Category } from '../types';

export type View = 'dashboard' | 'syllabus' | 'report' | 'review' | 'settings';
export type TimelineRange = 'day' | 'week' | 'month';

export const VIEWS: View[] = ['dashboard', 'syllabus', 'report', 'review', 'settings'];

/** Options for the task dialog: edit an existing task, or prefill a new one. */
export interface TaskDialogOptions {
  taskId?: string;
  category?: Category;
  subjectId?: string;
  chapterId?: string;
}

/** Weekly Class Schedule drawer: the weekly template, or this week's dates. */
export interface ScheduleDialogOptions {
  tab?: 'weekly' | 'week';
}

/** Test dialog: edit an existing test, or prefill a new one. */
export interface TestDialogOptions {
  testId?: string;
  subjectIds?: string[];
  chapterIds?: string[];
}

export type ModalState =
  | { name: 'task'; options: TaskDialogOptions }
  | { name: 'milestones' }
  | { name: 'schedule'; options: ScheduleDialogOptions }
  | { name: 'test'; options: TestDialogOptions }
  | { name: 'testResult'; testId: string }
  | { name: 'bulkTargets'; subjectId: string | null };

interface UIValue {
  view: View;
  /** Optional section inside the view, for example 'sync' in Settings. */
  section: string | null;
  navigate: (view: View, section?: string) => void;
  modal: ModalState | null;
  openTask: (options?: TaskDialogOptions) => void;
  openMilestones: () => void;
  openSchedule: (options?: ScheduleDialogOptions) => void;
  openTest: (options?: TestDialogOptions) => void;
  /** Opens the Test Review form for a test. */
  openTestResult: (testId: string) => void;
  /** Opens Set Target Qs for every chapter of a subject (or of all subjects). */
  openBulkTargets: (subjectId?: string | null) => void;
  closeModal: () => void;
  clockOpen: boolean;
  setClockOpen: (open: boolean) => void;
  timelineRange: TimelineRange;
  setTimelineRange: (r: TimelineRange) => void;
  /** Incrementing value used to ask the Quick Notes input to take focus. */
  noteFocusRequest: number;
  requestNoteFocus: () => void;
}

const Ctx = createContext<UIValue | null>(null);

/** `''`, `#`, `#/` and anything unknown open the Dashboard. */
export function parseHash(hash: string | null | undefined): { view: View; section: string | null } {
  const parts = String(hash ?? '')
    .replace(/^#\/?/, '')
    .split(/[/?]/)
    .filter(Boolean);
  const view = (VIEWS as string[]).includes(parts[0] ?? '') ? (parts[0] as View) : 'dashboard';
  return { view, section: parts[1] ?? null };
}

export function hashFor(view: View, section?: string | null): string {
  if (view === 'dashboard') return '#/';
  return `#/${view}${section ? `/${section}` : ''}`;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [modal, setModal] = useState<ModalState | null>(null);
  const [clockOpen, setClockOpen] = useState(false);
  const [timelineRange, setTimelineRange] = useState<TimelineRange>('day');
  const [noteFocusRequest, setNoteFocusRequest] = useState(0);

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((view: View, section?: string) => {
    const hash = hashFor(view, section);
    if (window.location.hash !== hash) window.location.hash = hash;
    setRoute({ view, section: section ?? null });
    // Instant, so the new view is not drawn mid-scroll.
    window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo<UIValue>(
    () => ({
      view: route.view,
      section: route.section,
      navigate,
      modal,
      openTask: (options = {}) => setModal({ name: 'task', options }),
      openMilestones: () => setModal({ name: 'milestones' }),
      openSchedule: (options = {}) => setModal({ name: 'schedule', options }),
      openTest: (options = {}) => setModal({ name: 'test', options }),
      openTestResult: (testId: string) => setModal({ name: 'testResult', testId }),
      openBulkTargets: (subjectId: string | null = null) => setModal({ name: 'bulkTargets', subjectId }),
      closeModal: () => setModal(null),
      clockOpen,
      setClockOpen,
      timelineRange,
      setTimelineRange,
      noteFocusRequest,
      requestNoteFocus: () => setNoteFocusRequest((n) => n + 1),
    }),
    [route, navigate, modal, clockOpen, timelineRange, noteFocusRequest],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUI(): UIValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI must be used inside UIProvider');
  return v;
}
