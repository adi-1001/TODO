import { useEffect, type ComponentType } from 'react';
import { AmbientOrb } from './components/layout/AmbientOrb';
import { BottomNav } from './components/layout/BottomNav';
import { MobileTopBar } from './components/layout/Header';
import { ReminderBanner } from './components/layout/ReminderBanner';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './components/dashboard/Dashboard';
import { SyllabusView } from './components/syllabus/SyllabusView';
import { ReportView } from './components/report/ReportView';
import { EveningReviewView } from './components/review/EveningReviewView';
import { SettingsView } from './components/settings/SettingsView';
import { FullScreenClock } from './components/clock/FullScreenClock';
import { MiniTimer } from './components/clock/MiniTimer';
import { TaskModal } from './components/modals/TaskModal';
import { MilestonesDrawer } from './components/modals/MilestonesDrawer';
import { ScheduleDrawer } from './components/modals/ScheduleDrawer';
import { TestModal } from './components/modals/TestModal';
import { TestResultModal } from './components/modals/TestResultModal';
import { TestSummaryModal } from './components/modals/TestSummaryModal';
import { BulkTargetsModal } from './components/modals/BulkTargetsModal';
import { ensureTestOccurrences } from './db/repo';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackButtonBridge, NoticeToast } from './components/layout/BackButtonBridge';
import { useToday } from './hooks/useNow';
import { PrefsProvider } from './state/PrefsProvider';
import { UIProvider, useUI, type View } from './state/UIProvider';
import { StrictMonitor } from './timer/StrictMonitor';
import { TimerNotificationBridge } from './timer/TimerNotificationBridge';
import { TimerProvider } from './timer/TimerProvider';

/** Every main view is imported up front: switching tabs never waits on a lazy chunk. */
const VIEW_COMPONENTS: Record<View, ComponentType> = {
  dashboard: Dashboard,
  syllabus: SyllabusView,
  report: ReportView,
  review: EveningReviewView,
  settings: SettingsView,
};

/** Creates the next occurrence of repeating tests at startup and when the day changes. */
function TestOccurrences() {
  const today = useToday();
  useEffect(() => {
    ensureTestOccurrences(today).catch((e) => console.error('Repeating tests could not be updated', e));
  }, [today]);
  return null;
}

function Shell() {
  const { view } = useUI();
  // The route always resolves to a view: an unknown or missing hash shows the Dashboard.
  const Current = VIEW_COMPONENTS[view] ?? Dashboard;
  return (
    <div className="relative isolate min-h-[100dvh] p-2 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:p-6 lg:pb-6">
      <AmbientOrb />
      <div className="mx-auto flex max-w-[1480px] gap-5">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <MobileTopBar />
          {/* Translucent in dark mode, so the ambient glow of the canvas shows through. */}
          <main className="min-h-[calc(100dvh-3rem)] rounded-[24px] border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:border-t-white/[0.1] dark:bg-white/[0.015] dark:shadow-none sm:p-6 lg:rounded-[28px] lg:p-7">
            {/* The new view replaces the old one in the same frame with no fade, and its data
                comes from the shared cache, so nothing blank or stale is drawn in between. */}
            {/* A page that fails shows its error here; the sidebar and bottom nav keep working. */}
            <ErrorBoundary key={view} scope="view">
              <Current />
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <BottomNav />
      <MiniTimer />
      <FullScreenClock />
      <TaskModal />
      <MilestonesDrawer />
      <ScheduleDrawer />
      <TestModal />
      <TestResultModal />
      <TestSummaryModal />
      <BulkTargetsModal />
      <ReminderBanner />
      <StrictMonitor />
      <TimerNotificationBridge />
      <TestOccurrences />
      <BackButtonBridge />
      <NoticeToast />
    </div>
  );
}

export default function App() {
  return (
    <PrefsProvider>
      <UIProvider>
        <TimerProvider>
          <Shell />
        </TimerProvider>
      </UIProvider>
    </PrefsProvider>
  );
}
