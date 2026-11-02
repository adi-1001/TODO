import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { useToday } from '../../hooks/useNow';
import { formatDayTitle } from '../../lib/format';
import { addDays } from '../../lib/time';
import { CustomizeMetricsButton, MetricsGrid } from '../ui/MetricsPanel';
import { BackupBanner } from './BackupBanner';
import { HydrationStreakSection } from './HydrationStreakSection';
import { ReflectionSection } from './ReflectionSection';
import { WhatWentWrongSection } from './WhatWentWrongSection';
import { PastFirstTaskSection, TomorrowSection } from './TomorrowSection';

/** A calm end-of-day check-in. Earlier dates can be read and edited. */
export function EveningReviewView() {
  const today = useToday();
  // null follows today, so the page moves to the new day after midnight.
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked !== null && picked < today ? picked : today;
  const isToday = date === today;

  const goPrev = () => setPicked(addDays(date, -1));
  const goNext = () => {
    const next = addDays(date, 1);
    setPicked(next >= today ? null : next);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Evening Review</h1>
          <p className="muted mt-0.5 text-sm">A calm end-of-day check-in. About a minute.</p>
        </div>
        <nav aria-label="Review date" className="flex items-center gap-1">
          <button type="button" className="icon-btn" onClick={goPrev} aria-label="Previous day">
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <button type="button" className="icon-btn" onClick={goNext} disabled={isToday} aria-label="Next day">
            <ChevronRight size={18} strokeWidth={1.75} />
          </button>
          <button type="button" className="btn-soft ml-1 px-3 py-1.5" onClick={() => setPicked(null)} disabled={isToday}>
            Today
          </button>
        </nav>
      </header>

      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-semibold text-zinc-800 dark:text-zinc-100" aria-live="polite">
          {formatDayTitle(date)}
        </span>
        {!isToday && <span className="muted text-xs">Earlier review. Changes save to this date.</span>}
      </div>

      <DaySummary date={date} isToday={isToday} />
      <BackupBanner />
      <WhatWentWrongSection date={date} isToday={isToday} />
      <HydrationStreakSection date={date} />
      <ReflectionSection key={date} date={date} />
      {isToday ? <TomorrowSection today={today} /> : <PastFirstTaskSection date={date} />}
    </div>
  );
}

/** The chosen review metrics for the date shown, with a Customize button at the top right. */
function DaySummary({ date, isToday }: { date: string; isToday: boolean }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="card-plain p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={headingId} className="muted text-[11px] font-semibold">
          {isToday ? 'Your day so far' : 'That day'}
        </h2>
        <CustomizeMetricsButton place="review" />
      </div>
      <MetricsGrid place="review" day={date} />
    </section>
  );
}
