import type { ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle } from './icons';

export type AlertTone = 'success' | 'error' | 'info' | 'warning';

const TONE_CLASSES: Record<AlertTone, string> = {
  success: 'bg-status-success-bg text-status-success-fg',
  error: 'bg-status-danger-bg text-status-danger-fg',
  info: 'bg-status-info-bg text-status-info-fg',
  warning: 'bg-status-warning-bg text-status-warning-fg',
};

const TONE_ICON: Record<AlertTone, ReactNode> = {
  success: <CheckCircle2 className="h-icon-md w-icon-md" aria-hidden="true" />,
  error: <XCircle className="h-icon-md w-icon-md" aria-hidden="true" />,
  info: <Info className="h-icon-md w-icon-md" aria-hidden="true" />,
  warning: <AlertTriangle className="h-icon-md w-icon-md" aria-hidden="true" />,
};

interface InlineAlertProps {
  tone: AlertTone;
  children: ReactNode;
  className?: string;
}

/** Inline banner (form-level errors, page notices). role="alert" for error/warning so it's announced. */
export function InlineAlert({ tone, children, className = '' }: InlineAlertProps) {
  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-md px-4 py-3 type-body-s ${TONE_CLASSES[tone]} ${className}`}
    >
      {TONE_ICON[tone]}
      <div>{children}</div>
    </div>
  );
}
