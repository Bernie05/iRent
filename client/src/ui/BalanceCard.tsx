import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPeso } from '../lib/format';
import { StatusBadge } from './StatusBadge';

export type BalanceStatus = 'due' | 'overdue' | 'paid';

const STATUS_TONE: Record<BalanceStatus, 'warning' | 'danger' | 'success'> = {
  due: 'warning',
  overdue: 'danger',
  paid: 'success',
};

interface BalanceCardProps {
  status: BalanceStatus;
  outstanding: number;
  nextDueDate?: string;
  /** R17/R54 (design gap): shown when credit_balance > 0. */
  creditBalance?: number;
  className?: string;
  /** Extra lines at the bottom (the R76 rent countdown). */
  children?: ReactNode;
}

/** Portal Home balance card. Credit line and "Owes ₱X" state are a DESIGN.md gap (SPEC R17, R54, BR-11). */
export function BalanceCard({ status, outstanding, nextDueDate, creditBalance = 0, className = '', children }: BalanceCardProps) {
  const { t } = useTranslation();
  const owes = creditBalance < 0;

  return (
    <div className={`flex flex-col items-center gap-1 rounded-lg border bg-surface p-5 text-center shadow-elevation-1 ${className}`}>
      <StatusBadge tone={STATUS_TONE[status]}>{t(`domain:balanceStatus.${status}`)}</StatusBadge>
      <p className="mt-1 type-label-s text-secondary">{t('ui:balance.outstanding')}</p>
      <p className="type-amount-l tabular-nums text-primary sm:text-[2.75rem] sm:leading-[3rem]">{formatPeso(outstanding)}</p>
      {nextDueDate && <p className="type-caption text-secondary">{t('ui:balance.nextDue', { date: nextDueDate })}</p>}
      {creditBalance > 0 && (
        <p className="type-body-s-strong text-success">{t('domain:creditLine', { amount: formatPeso(creditBalance) })}</p>
      )}
      {owes && (
        <p className="type-body-s-strong text-danger">{t('domain:owesLine', { amount: formatPeso(Math.abs(creditBalance)) })}</p>
      )}
      {children}
    </div>
  );
}
