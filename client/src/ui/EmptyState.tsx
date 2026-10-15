import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center ${className}`}>
      {icon}
      <p className="type-h4 text-primary">{title}</p>
      {description && <p className="type-body-s max-w-[48ch] text-secondary">{description}</p>}
      {action}
    </div>
  );
}
