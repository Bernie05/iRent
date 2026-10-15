import { useTranslation } from 'react-i18next';
import { AlertTriangle } from './icons';
import { Button } from './Button';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** Error state with a Retry action (screens that fail to load data). */
export function ErrorState({ message, onRetry, className = '' }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <div role="alert" className={`flex flex-col items-center gap-3 py-12 text-center ${className}`}>
      <AlertTriangle className="h-icon-lg w-icon-lg text-danger" aria-hidden="true" />
      <p className="type-body-m text-primary">{message ?? t('errors:UNKNOWN')}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>{t('retry')}</Button>}
    </div>
  );
}
