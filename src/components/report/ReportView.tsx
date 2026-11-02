import { useQuestionLogs, useRestDays, useSettings, useSubjects, useTasks } from '../../hooks/useData';
import { useLiveSessions } from '../../hooks/useLiveSessions';
import { useNow } from '../../hooks/useNow';
import { dayKey } from '../../lib/time';
import { BacklogReport } from './BacklogReport';
import { DonutChart } from './DonutChart';
import { GoalCalendar } from './GoalCalendar';
import { PomodoroRecords } from './PomodoroRecords';
import { SubjectFocus } from './SubjectFocus';
import { SummaryBar } from './SummaryBar';
import { TestAnalysis } from './TestAnalysis';

/** Detailed Report, laid out like the Focus To-Do report screen (Reference Image 2). */
export function ReportView() {
  const sessions = useLiveSessions();
  const tasks = useTasks();
  const subjects = useSubjects();
  const settings = useSettings();
  const restDays = useRestDays();
  const questionLogs = useQuestionLogs();
  const now = useNow(30_000);
  const today = dayKey(now);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white sm:text-xl">Detailed Report</h1>
        <p className="muted text-xs sm:text-sm">Focus time, tasks, questions, goals and tests across days, weeks and months</p>
      </header>

      <SummaryBar sessions={sessions} tasks={tasks} questionLogs={questionLogs} now={now} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <PomodoroRecords sessions={sessions} subjects={subjects} today={today} restDays={restDays} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <SubjectFocus sessions={sessions} subjects={subjects} questionLogs={questionLogs} today={today} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <DonutChart sessions={sessions} subjects={subjects} today={today} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <GoalCalendar sessions={sessions} settings={settings} today={today} restDays={restDays} />
        </div>
      </div>

      <BacklogReport />

      <TestAnalysis />
    </div>
  );
}
