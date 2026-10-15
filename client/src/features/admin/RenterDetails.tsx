import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useGetDashboardAnalyticsQuery, useGetPaymentsQuery, useGetRenterCreditQuery } from '../../services/endpoints/admin';
import { useFormat } from '../../hooks/useFormat';
import { manilaToday } from '../../lib/time';
import type { RenterRow } from '../../types/api';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Pagination, usePaged } from '../../ui/Pagination';
import { Skeleton } from '../../ui/Skeleton';
import { StatusBadge } from '../../ui/StatusBadge';
import { Table, TableCell, TableHeaderCell } from '../../ui/Table';
import { ChevronLeft, Pencil, Wallet } from '../../ui/icons';
import { CreditLedgerList } from '../shared/CreditLedgerList';
import { RecordPaymentModal, type RecordPaymentTarget } from '../shared/RecordPaymentModal';
import { daysBetween, debtsByRenter } from './dashboard/metrics';
import { Card } from './dashboard/Card';

export interface RenterActions {
  onEdit: () => void;
  onResend: () => void;
  onAssign: () => void;
  onMoveOut: () => void;
  onCredit: () => void;
  resending: boolean;
}

const VERIFICATION_TONE = { confirmed: 'success', auto_verified: 'info', rejected: 'danger' } as const;

/**
 * Renter details (/admin/renters/:id, Bernie 2026-10-14): profile, balance with the open items and Record payment toward
 * the total, payment history, credit ledger, and the same actions as the Renters table (the modals stay in
 * AdminRentersPage). Data comes from existing endpoints: the renters list, GET /payments (admin, filtered by renter),
 * GET /dashboard/analytics?range=total (open items) and GET /renters/:id/credit. A GET /renters/:id is proposed.
 */
export function RenterDetails({ renter, actions }: { renter: RenterRow; actions: RenterActions }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [paying, setPaying] = useState<RecordPaymentTarget | null>(null);
  const analytics = useGetDashboardAnalyticsQuery({ range: 'total' });
  const payments = useGetPaymentsQuery();
  const credit = useGetRenterCreditQuery(renter.id);
  const debt = analytics.data ? debtsByRenter(analytics.data.open_items.filter((i) => i.renter?.id === renter.id), 'all')[0] : undefined;
  const history = (payments.data ?? []).filter((p) => p.renter?.id === renter.id);
  const pagedHistory = usePaged(history, 10);
  const today = manilaToday();

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/admin/renters"
        className="inline-flex min-h-touch w-fit items-center gap-1 rounded-md type-label-s text-secondary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ChevronLeft className="h-icon-sm w-icon-sm" aria-hidden="true" />
        {t('admin:renters.backToList')}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-surface p-5 shadow-elevation-1">
        <div className="flex items-center gap-4">
          <span aria-hidden="true">
            <Avatar name={renter.full_name} size="lg" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="type-h2 text-primary">{renter.full_name}</h1>
            <div className="flex flex-wrap gap-1">
              <StatusBadge tone={renter.status === 'active' ? 'success' : 'neutral'}>{renter.status === 'active' ? t('admin:renters.active') : t('admin:renters.movedOut')}</StatusBadge>
              {renter.invite_pending && <StatusBadge tone="warning">{t('admin:renters.invitePending')}</StatusBadge>}
              {renter.refund_due > 0 && <StatusBadge tone="info">{t('admin:renters.refundDue', { amount: f.peso(renter.refund_due) })}</StatusBadge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" iconLeft={<Pencil className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={actions.onEdit}>
            {t('admin:renters.edit')}
          </Button>
          {renter.invite_pending && (
            <Button variant="secondary" loading={actions.resending} onClick={actions.onResend}>
              {t('admin:renters.resendInvite')}
            </Button>
          )}
          {renter.tenancy ? (
            <Button variant="secondary" onClick={actions.onMoveOut}>
              {t('admin:renters.moveOut')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={actions.onAssign}>
              {t('admin:renters.assignBed')}
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={t('admin:renterDetails.profile')}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 type-body-s">
            <dt className="text-secondary">{t('admin:renters.phone')}</dt>
            <dd>
              <a href={`tel:${renter.phone}`} className="text-primary underline-offset-4 hover:underline">
                {renter.phone}
              </a>
            </dd>
            <dt className="text-secondary">{t('admin:renters.email')}</dt>
            <dd className="min-w-0 break-words">
              <a href={`mailto:${renter.email}`} className="text-primary underline-offset-4 hover:underline">
                {renter.email}
              </a>
            </dd>
            <dt className="text-secondary">{t('admin:renters.birthday')}</dt>
            <dd className="text-primary">{renter.birthday ? f.date(renter.birthday) : '—'}</dd>
            <dt className="text-secondary">{t('admin:renters.columnBed')}</dt>
            <dd className="text-primary">
              {renter.tenancy ? (
                <Link to="/admin/beds" className="underline-offset-4 hover:underline">
                  {renter.tenancy.bed.label}
                </Link>
              ) : (
                t('admin:renters.noBed')
              )}
            </dd>
            <dt className="text-secondary">{t('admin:renters.columnMoveIn')}</dt>
            <dd className="text-primary">{renter.tenancy ? f.date(renter.tenancy.move_in) : '—'}</dd>
            <dt className="text-secondary">{t('admin:renters.columnDueDay')}</dt>
            <dd className="text-primary">{renter.tenancy ? f.dueDay(renter.tenancy.due_day) : '—'}</dd>
          </dl>
        </Card>

        <Card
          title={t('admin:renterDetails.balance')}
          className="xl:col-span-2"
          action={
            debt && (
              <Button
                iconLeft={<Wallet className="h-icon-sm w-icon-sm" aria-hidden="true" />}
                onClick={() => setPaying({ item: debt.items[0].item, remaining: debt.total, renterName: renter.full_name, openItems: debt.items })}
              >
                {t('admin:renterDetails.recordPayment')}
              </Button>
            )
          }
        >
          {analytics.isLoading ? (
            <Skeleton variant="row" />
          ) : !debt ? (
            <p className="type-body-s-strong text-primary">{t('admin:renterDetails.paidUp')}</p>
          ) : (
            <>
              <p className="type-body-s text-secondary">
                <span className="type-amount-l text-primary">{f.peso(debt.total)}</span>{' '}
                {t('admin:renterDetails.outstandingLine', { count: debt.months })}
              </p>
              <ul className="flex flex-col divide-y divide-default rounded-lg border">
                {debt.items.map((i) => {
                  const late = daysBetween(i.due_date, today);
                  return (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 type-body-s">
                      <span className="text-primary">
                        {f.item(i.item)}
                        <span className="block type-caption text-tertiary">
                          {f.date(i.due_date)}
                          {late > 0 && ` · ${t('admin:dashboard.daysOverdue', { count: late })}`}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <StatusBadge tone={i.is_overdue ? 'danger' : i.status === 'partial' ? 'warning' : 'neutral'}>
                          {t(`domain:itemStatus.${i.is_overdue ? 'overdue' : i.status}`)}
                        </StatusBadge>
                        <span className="w-24 text-right type-body-s-strong tabular-nums text-primary">{f.peso(i.remaining)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={t('admin:renterDetails.history')} className="xl:col-span-2">
          {payments.isLoading ? (
            <Skeleton variant="row" />
          ) : history.length === 0 ? (
            <p className="type-body-s text-secondary">{t('admin:renterDetails.noPayments')}</p>
          ) : (
            <Table>
              <caption className="sr-only">{t('admin:renterDetails.history')}</caption>
              <thead>
                <tr>
                  <TableHeaderCell>{t('admin:renterDetails.col.date')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin:renterDetails.col.item')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin:renterDetails.col.method')}</TableHeaderCell>
                  <TableHeaderCell className="text-right">{t('admin:renterDetails.col.amount')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin:renterDetails.col.status')}</TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {pagedHistory.rows.map((p) => (
                  <tr key={p.id}>
                    <TableCell variant="muted" className="whitespace-nowrap">
                      {f.date(p.paid_at)}
                    </TableCell>
                    <TableCell>
                      {f.item(p.item)}
                      {p.reference_no && <span className="block type-caption text-tertiary">{p.reference_no}</span>}
                    </TableCell>
                    <TableCell>{t(`domain:method.${p.method}`)}</TableCell>
                    <TableCell variant="strong" className="text-right">
                      {f.peso(p.amount)}
                    </TableCell>
                    <TableCell variant="badge">
                      <StatusBadge tone={VERIFICATION_TONE[p.verification]}>{t(`domain:verification.${p.verification}`)}</StatusBadge>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination pager={pagedHistory} label={t('ui:pagination.pagesOf', { name: t('admin:renterDetails.history') })} />
        </Card>

        <Card
          title={t('admin:renterDetails.credit')}
          action={
            <Button variant="secondary" onClick={actions.onCredit}>
              {t('admin:renterDetails.creditAndRefunds')}
            </Button>
          }
        >
          {credit.data ? <CreditLedgerList ledger={credit.data} /> : <Skeleton variant="row" />}
        </Card>
      </div>

      <RecordPaymentModal target={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
