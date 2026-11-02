import { useId, type ReactNode } from 'react';

interface ReviewSectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

/**
 * Card used for each part of the Evening Review: `.card-plain` is specular glass in dark mode
 * (brighter 1px top edge, soft top sheen). The heading keeps at least 160px before an action
 * wraps below it, so a title never squeezes to one word per line.
 */
export function ReviewSection({ title, description, action, children }: ReviewSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="card-plain relative p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-[160px] flex-1">
          <h2 id={headingId} className="section-title">
            {title}
          </h2>
          {description && <p className="muted mt-0.5 text-xs">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
