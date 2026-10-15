import type { ReactNode } from 'react';

export type StatusTone = 'brand' | 'warning' | 'success' | 'danger' | 'info' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  brand: 'bg-status-brand-bg text-status-brand-fg',
  warning: 'bg-status-warning-bg text-status-warning-fg',
  success: 'bg-status-success-bg text-status-success-fg',
  danger: 'bg-status-danger-bg text-status-danger-fg',
  info: 'bg-status-info-bg text-status-info-fg',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
};

interface StatusBadgeProps {
  tone: StatusTone;
  children: ReactNode;
  /** Extra icon before the text. Status is never shown by colour alone (NFR4), so text is always present. */
  icon?: ReactNode;
  className?: string;
}

export function StatusBadge({ tone, children, icon, className = '' }: StatusBadgeProps) {
  return (
    <span className={`type-label-xs inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 ${TONE_CLASSES[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}
