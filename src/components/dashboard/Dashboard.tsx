import { BacklogCommandCenter } from '../backlog/BacklogCommandCenter';
import { Header } from '../layout/Header';
import { BackupBanner } from '../review/BackupBanner';
import { FocusTimeline } from './FocusTimeline';
import { OverviewCard } from './OverviewCard';
import { QuickNotes } from './QuickNotes';
import { StudyBoard } from './StudyBoard';
import { SummaryToday } from './SummaryToday';
import { TestsWidget } from './TestsWidget';

/** Main study workspace, laid out like Reference Image 1 and design.html. */
export function Dashboard() {
  return (
    <div className="space-y-6">
      <Header />
      <BackupBanner />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <FocusTimeline />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <OverviewCard />
        </div>
      </div>

      <BacklogCommandCenter />

      <div className="grid grid-cols-1 gap-6 border-t border-zinc-200/70 pt-6 dark:border-white/10 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-4 lg:border-r lg:border-zinc-200/70 lg:pr-6 lg:dark:border-white/10">
          <TestsWidget />
          <SummaryToday />
        </div>
        <div className="min-w-0 space-y-6 lg:col-span-8">
          <StudyBoard />
          <QuickNotes />
        </div>
      </div>
    </div>
  );
}
