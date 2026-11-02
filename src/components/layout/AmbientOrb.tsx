import { memo, useMemo } from 'react';
import { useSettings } from '../../hooks/useData';
import { useLiveSessions } from '../../hooks/useLiveSessions';
import { useToday } from '../../hooks/useNow';
import { goalTone } from '../../lib/solarPhase';
import { focusMsInRange } from '../../lib/stats';
import { MINUTE, dayEnd, dayStart } from '../../lib/time';

const LAYERS = [
  { tone: 'sky', color: 'rgba(56, 189, 248, 0.05)' },
  { tone: 'teal', color: 'rgba(45, 212, 191, 0.06)' },
  { tone: 'gold', color: 'rgba(234, 179, 8, 0.10)' },
] as const;

/**
 * Fixed glow along the top edge of the dark canvas. Its colour follows today's share of the
 * daily focus goal: midnight sky below 50%, teal to 79%, Golden Hour amber from 80%. Three
 * stacked gradients cross-fade with opacity; it updates with the live sessions (every 30 s
 * while a timer runs) and never on the clock tick. Hidden in light mode.
 */
export const AmbientOrb = memo(function AmbientOrb() {
  const sessions = useLiveSessions();
  const settings = useSettings();
  const today = useToday();
  const share = useMemo(() => {
    const goal = Math.max(1, settings.dailyGoalMinutes) * MINUTE;
    return focusMsInRange(sessions, dayStart(today), dayEnd(today)) / goal;
  }, [sessions, settings.dailyGoalMinutes, today]);
  const tone = goalTone(share);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 hidden h-[70dvh] dark:block">
      {LAYERS.map((l) => (
        <div
          key={l.tone}
          className={`absolute inset-0 transition-opacity duration-1000 ease-out ${l.tone === tone ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: `radial-gradient(70% 60% at 50% 0%, ${l.color.replace(/[\d.]+\)$/, (a) => `${Math.min(1, parseFloat(a) * 2.4)})`)}, ${l.color} 45%, transparent 100%)` }}
        />
      ))}
    </div>
  );
});
