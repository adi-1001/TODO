import { ClipboardCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { saveTest } from '../../db/repo';
import { useSubjectMap, useTestResults, useTests } from '../../hooks/useData';
import { useToday } from '../../hooks/useNow';
import { formatTimeOfDay } from '../../lib/format';
import { useUI } from '../../state/UIProvider';
import { useTimer } from '../../timer/TimerProvider';
import { Modal } from '../ui/Modal';
import { ProgressBar } from '../ui/controls';

const minutes = (ms: number) => Math.round(ms / 60_000);

function hm(ms: number): string {
  const m = minutes(ms);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/**
 * End-of-test summary for Test Mode: time spent per subject section, and a button that opens
 * the Test Review form for today's test (creating a mock test record when none is scheduled).
 */
export function TestSummaryModal() {
  const { testSummary, clearTestSummary } = useTimer();
  const { openTestResult } = useUI();
  const subjects = useSubjectMap();
  const tests = useTests();
  const results = useTestResults();
  const today = useToday();
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () =>
      (testSummary?.laps ?? []).map((l) => {
        const s = l.subjectId ? subjects.get(l.subjectId) : undefined;
        return { key: l.subjectId ?? 'none', name: s?.name ?? (l.subjectId ? 'Removed subject' : 'No section chosen'), color: s?.color ?? '#A1A1AA', ms: l.ms };
      }),
    [testSummary, subjects],
  );
  const total = testSummary?.totalMs ?? 0;
  const line = rows.map((r) => `${r.name}: ${minutes(r.ms)}m`).join(' | ');

  const logMarks = async () => {
    if (!testSummary || busy) return;
    setBusy(true);
    try {
      const done = new Set(results.map((r) => r.testId));
      // A test scheduled today that has no result yet is the one just sat.
      const scheduled = tests.find((t) => t.date === today && t.kind !== 'assignment' && !done.has(t.id));
      const subjectIds = testSummary.laps.map((l) => l.subjectId).filter((id): id is string => id !== null && subjects.has(id));
      const test =
        scheduled ??
        (await saveTest({ title: 'Mock test (Exam Simulation)', kind: 'other', date: today, repeatEveryDays: null, subjectIds, chapterIds: [], totalMarks: null, targetPercent: null }));
      clearTestSummary();
      openTestResult(test.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={testSummary !== null}
      onClose={clearTestSummary}
      eyebrow={testSummary ? (testSummary.submittedEarly ? `Submitted at ${formatTimeOfDay(testSummary.endedAt)}` : 'Time is up') : undefined}
      title="Test Summary"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={clearTestSummary}>
            Done
          </button>
          <button type="button" className="btn-primary" onClick={() => void logMarks()} disabled={busy}>
            <ClipboardCheck size={14} strokeWidth={1.75} aria-hidden />
            Log Marks and Mistakes
          </button>
        </>
      }
    >
      {testSummary && (
        <div className="space-y-4 py-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="tabular text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">{hm(total)}</span>
            <span className="muted tabular text-xs">of a {hm(testSummary.plannedMinutes * 60_000)} paper</span>
          </div>
          {rows.length === 0 ? (
            <p className="muted text-sm">Less than a minute was timed.</p>
          ) : (
            <>
              <p className="tabular text-xs font-semibold text-zinc-700 dark:text-zinc-200">{line}</p>
              <ul className="space-y-2.5" aria-label="Time spent per subject">
                {rows.map((r) => (
                  <li key={r.key} className="space-y-1">
                    <div className="flex items-start justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-start gap-2 font-semibold text-zinc-800 dark:text-zinc-100">
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                        <span className="min-w-0 break-words whitespace-normal leading-relaxed">{r.name}</span>
                      </span>
                      <span className="tabular shrink-0 leading-relaxed text-zinc-600 dark:text-zinc-300">
                        {hm(r.ms)}, {total > 0 ? Math.round((r.ms / total) * 100) : 0}%
                      </span>
                    </div>
                    <ProgressBar value={total > 0 ? r.ms / total : 0} className="h-1.5" barClassName="bg-zinc-500 dark:bg-zinc-300" label={`${r.name} share of the paper`} />
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="muted text-xs">The time is saved as focus sessions per subject. Log your marks and where they were lost to see your trend in the Detailed Report.</p>
        </div>
      )}
    </Modal>
  );
}
