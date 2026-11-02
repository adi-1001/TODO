import { useBacklog } from '../../hooks/useBacklog';
import { useDayMeta } from '../../hooks/useData';
import { useFocusByDay, useStreakInfo } from '../../hooks/useStats';
import { hm } from '../../lib/metrics';
import { BottleneckInsight, RootCausePills } from '../backlog/RootCauses';
import { PaceLine } from '../backlog/Triage';
import { ReviewSection } from './ReviewSection';

/**
 * "What Went Wrong?" in the Evening Review: one-tap reasons for the date shown, the week's top
 * bottleneck with a fix, and solving speed per subject.
 */
export function WhatWentWrongSection({ date, isToday }: { date: string; isToday: boolean }) {
  const view = useBacklog();
  const byDay = useFocusByDay();
  const { thresholdMs } = useStreakInfo();
  const focusMs = byDay.get(date) ?? 0;
  const missedGoal = focusMs < thresholdMs;
  const homeworkLeft = isToday ? view.homework.tasks.length : 0;
  const restDay = useDayMeta(date)?.restDay ?? false;

  let prompt: string;
  if (restDay) prompt = 'A rest or sick day. Tap a reason only if one fits.';
  else if (missedGoal && homeworkLeft > 0) prompt = `The goal was missed (${hm(focusMs)} of ${hm(thresholdMs)}) and ${homeworkLeft} homework ${homeworkLeft === 1 ? 'task is' : 'tasks are'} left. What got in the way?`;
  else if (missedGoal) prompt = `The goal was missed (${hm(focusMs)} of ${hm(thresholdMs)}). What got in the way?`;
  else if (homeworkLeft > 0) prompt = `${homeworkLeft} homework ${homeworkLeft === 1 ? 'task is' : 'tasks are'} still pending. What got in the way?`;
  else prompt = 'The goal was reached. Tap a reason only if something still slowed you down.';

  return (
    <ReviewSection title="What Went Wrong?" description="Tap every reason that fits. No typing needed.">
      <div className="space-y-3">
        <p className="break-words text-sm leading-relaxed text-zinc-700 dark:text-zinc-200" aria-live="polite">
          {prompt}
        </p>
        <RootCausePills day={date} label="What went wrong on this day" />
        <BottleneckInsight bottlenecks={view.bottlenecks} />
        <PaceLine view={view} />
      </div>
    </ReviewSection>
  );
}
