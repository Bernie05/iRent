import { useId, type ReactNode } from 'react';

/** Dashboard panel: white card, small title (and hint) on top, optional action at the top right. */
export function Card({ title, hint, action, children, className = '' }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`flex min-w-0 flex-col gap-4 rounded-lg border bg-surface p-5 shadow-elevation-1 xl:min-h-0 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id={id} className="type-h4 text-primary">
            {title}
          </h2>
          {hint && <p className="type-caption text-secondary">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
