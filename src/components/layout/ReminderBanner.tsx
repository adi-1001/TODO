import type { ReactNode } from 'react';
import { AlarmClock, CalendarClock, CircleStop, ClipboardList, Eye, Play } from 'lucide-react';
import { useReminders } from '../../hooks/useReminders';
import { useUI } from '../../state/UIProvider';
import { useTimer } from '../../timer/TimerProvider';

function BannerItem({ icon, title, detail, actions }: { icon: ReactNode; title: string; detail?: string; actions: ReactNode }) {
  return (
    <div
      className="pointer-events-auto flex w-full max-w-md animate-rise-in items-start gap-3 rounded-2xl border border-zinc-200/80 bg-white/90 p-3 shadow-lg backdrop-blur-md dark:border-white/[0.08] dark:bg-[#161922]/90"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold leading-snug text-zinc-900 dark:text-white">{title}</div>
        {detail && <div className="tabular mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{detail}</div>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">{actions}</div>
      </div>
    </div>
  );
}

function DismissButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="btn-ghost px-2.5 py-1 text-[11px]" aria-label={label}>
      Dismiss
    </button>
  );
}

/** Task reminders, the 20-20-20 eye-rest prompt and the Strict Mode notice, top centre. */
export function ReminderBanner() {
  const { active, dismiss } = useReminders();
  const timer = useTimer();
  const { clockOpen, navigate } = useUI();
  const showEyeRest = timer.eyeRestDue && !clockOpen;
  const showStrict = timer.strictStoppedAt !== null && !clockOpen;

  // The live region stays mounted so screen readers announce items as they appear.
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-3" role="region" aria-live="polite" aria-label="Reminders">
      {showStrict && (
        <BannerItem
          icon={<CircleStop size={16} strokeWidth={1.75} />}
          title="The last session stopped because the app was left for more than 3 seconds. It is saved as Failed (Strict Mode)."
          actions={<DismissButton onClick={timer.clearStrictStop} label="Dismiss Strict Mode notice" />}
        />
      )}
      {showEyeRest && (
        <BannerItem
          icon={<Eye size={16} strokeWidth={1.75} />}
          title="Look at something about 20 feet away for 20 seconds."
          actions={<DismissButton onClick={timer.dismissEyeRest} label="Dismiss eye rest reminder" />}
        />
      )}
      {active.map((r) =>
        r.kind === 'test' ? (
          <BannerItem
            key={r.key}
            icon={<CalendarClock size={16} strokeWidth={1.75} />}
            title={r.title}
            detail={r.body}
            actions={
              <>
                <button
                  type="button"
                  onClick={() => {
                    navigate('syllabus', 'tests');
                    dismiss(r.key);
                  }}
                  className="btn-primary px-2.5 py-1 text-[11px]"
                >
                  <ClipboardList size={14} strokeWidth={1.75} aria-hidden />
                  View tests
                </button>
                <DismissButton onClick={() => dismiss(r.key)} label={`Dismiss reminder: ${r.title}`} />
              </>
            }
          />
        ) : (
          <BannerItem
            key={r.key}
            icon={<AlarmClock size={16} strokeWidth={1.75} />}
            title={r.title}
            detail={r.body}
            actions={
              <>
                <button
                  type="button"
                  onClick={() => {
                    timer.start({ taskId: r.taskId });
                    dismiss(r.key);
                  }}
                  className="btn-primary px-2.5 py-1 text-[11px]"
                >
                  <Play size={14} strokeWidth={1.75} aria-hidden />
                  Start Focus
                </button>
                <DismissButton onClick={() => dismiss(r.key)} label={`Dismiss reminder for ${r.title}`} />
              </>
            }
          />
        ),
      )}
    </div>
  );
}
