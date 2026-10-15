import { useTranslation } from 'react-i18next';
import { Pagination, usePaged } from '../../ui/Pagination';
import { useNavigate } from 'react-router-dom';
import { useGetMyBillsQuery } from '../../services/endpoints/renter';
import { Table, TableCell, TableHeaderCell } from '../../ui/Table';
import { StatusBadge } from '../../ui/StatusBadge';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { EmptyState } from '../../ui/EmptyState';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { formatPeso, formatPeriod, formatDate } from '../../lib/format';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../../features/ui/uiSlice';

const STATUS_TONE = { unpaid: 'neutral', partial: 'warning', paid: 'success', overdue: 'danger' } as const;

/** R25: Portal / Bills as a stacked table (D-31, R79, 10 per page). Newest period first; "Pay" preselects the share in Pay Rent (SC-24). */
export function PortalBillsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = useAppSelector(selectLanguage);
  const bills = useGetMyBillsQuery();

  const showSkeleton = useDelayedFlag(bills.isLoading);

  const paged = usePaged([...(bills.data ?? [])].sort((a, b) => b.item.period.localeCompare(a.item.period)), 10);

  if (bills.error && !bills.isLoading) {
    return <ErrorState message={t('portal:bills.errorLoading')} onRetry={() => void bills.refetch()} />;
  }

  if (bills.isLoading) {
    return showSkeleton ? (
      <div className="flex flex-col gap-3">
        <Skeleton variant="row" />
        <Skeleton variant="row" />
      </div>
    ) : null;
  }

  const rows = [...(bills.data ?? [])].sort((a, b) => b.item.period.localeCompare(a.item.period));

  return (
    <section aria-labelledby="bills-title">
      <h1 id="bills-title" className="type-h1 text-primary max-sm:type-h2">
        {t('portal:bills.title')}
      </h1>
      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState title={t('portal:bills.empty')} />
        ) : (
          <Table stacked>
            <caption className="sr-only">{t('portal:bills.title')}</caption>
            <thead>
              <tr>
                <TableHeaderCell>{t('portal:bills.col.bill')}</TableHeaderCell>
                <TableHeaderCell>{t('portal:bills.col.period')}</TableHeaderCell>
                <TableHeaderCell>{t('portal:bills.col.share')}</TableHeaderCell>
                <TableHeaderCell>{t('portal:bills.col.paid')}</TableHeaderCell>
                <TableHeaderCell>{t('portal:bills.col.status')}</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">{t('portal:bills.pay')}</span>
                </TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((share) => {
                const statusKey = share.is_overdue ? 'overdue' : share.status;
                const period = formatPeriod(share.item.period, { language });
                const billType = share.item.bill_type ? t(`domain:billTypeTitle.${share.item.bill_type}`) : '';
                return (
                  <tr key={share.id}>
                    <TableCell variant="strong">{billType}</TableCell>
                    <TableCell className="whitespace-nowrap">{period}</TableCell>
                    <TableCell>{formatPeso(share.amount, { language })}</TableCell>
                    <TableCell>{formatPeso(share.paid_total, { language })}</TableCell>
                    <TableCell variant="badge">
                      <span className="flex flex-col items-end gap-1 md:items-start">
                        <StatusBadge tone={STATUS_TONE[statusKey]}>{t(`domain:itemStatus.${statusKey}`)}</StatusBadge>
                        {share.status !== 'paid' && (
                          <span className="type-caption text-secondary">
                            {t('portal:home.remaining', { amount: formatPeso(share.remaining, { language }) })} · {formatDate(share.due_date, { language })}
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell variant="actions">
                      {share.status !== 'paid' && (
                        <Button
                          variant="secondary"
                          aria-label={t('portal:bills.payLabel', { item: t('domain:item.bill_share', { period, billType }) })}
                          onClick={() => navigate(`/portal/pay?item=bill_share:${share.id}`)}
                        >
                          {t('portal:bills.pay')}
                        </Button>
                      )}
                    </TableCell>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('portal:bills.title') })} className="mt-3" />
      </div>
    </section>
  );
}
