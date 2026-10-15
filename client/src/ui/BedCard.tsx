import { useTranslation } from 'react-i18next';
import type { BedStatus, BunkType } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { formatPeso } from '../lib/format';

const PRESS = 'transition-[background-color,border-color,color,transform] duration-fast ease-out active:scale-[0.98] motion-reduce:active:scale-100';

const STATUS_TONE: Record<BedStatus, 'success' | 'neutral' | 'warning'> = {
  vacant: 'success',
  occupied: 'neutral',
  reserved: 'warning',
};

interface BedCardProps {
  room: string;
  bunkType: BunkType;
  rate: number;
  status: BedStatus;
  onClick?: () => void;
  className?: string;
}

export function BedCard({ room, bunkType, rate, status, onClick, className = '' }: BedCardProps) {
  const { t } = useTranslation();
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-lg border bg-surface p-4 text-left ${
        onClick ? `${PRESS} hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus` : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="type-body-m-strong text-primary">{room}</p>
        <StatusBadge tone={STATUS_TONE[status]}>{t(`domain:bedStatus.${status}`)}</StatusBadge>
      </div>
      <p className="type-body-s text-secondary">{t(`domain:bunkType.${bunkType}`)}</p>
      <p className="type-amount-m text-primary">{formatPeso(rate, { whole: true })}</p>
    </Component>
  );
}
