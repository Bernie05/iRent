import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pagination, usePaged } from '../../ui/Pagination';
import { useGetMyCreditQuery, useGetMyPaymentsQuery, useLazyGetMyPaymentProofQuery } from '../../services/endpoints/renter';
import type { Payment } from '../../types/api';
import { CreditLedgerList } from '../shared/CreditLedgerList';
import { Table, TableCell, TableHeaderCell } from '../../ui/Table';
import { Card } from '../admin/dashboard/Card';
import { StatusBadge } from '../../ui/StatusBadge';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { EmptyState } from '../../ui/EmptyState';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { formatPeso, formatPeriod, formatDate } from '../../lib/format';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../../features/ui/uiSlice';
import { useToast } from '../../ui/ToastProvider';
import { CheckCircle2, ChevronDown, Clock, Upload, Wallet, XCircle, type LucideIcon } from '../../ui/icons';

const VERIFICATION_TONE = { auto_verified: 'info', confirmed: 'success', rejected: 'danger' } as const;

interface Step {
  key: string;
  icon: LucideIcon;
  tone: string;
  date?: string | null;
  detail?: string | null;
}

/**
 * R77 (D-27): renter upload → Uploaded → Under review (current while auto_verified) → Confirmed | Rejected (reason);
 * recorded by the owner → Recorded → Confirmed. Each step is icon + text (never colour alone); the last is the current one.
 */
function PaymentTimeline({ payment }: { payment: Payment }) {
  const { t } = useTranslation();
  const language = useAppSelector(selectLanguage);
  const k = (key: string) => t(`portal:history.timeline.${key}`);
  const steps: Step[] =
    payment.source === 'admin'
      ? [{ key: 'recorded', icon: Wallet, tone: 'text-secondary', date: payment.paid_at }]
      : [
          { key: 'uploaded', icon: Upload, tone: 'text-secondary', date: payment.paid_at },
          { key: 'underReview', icon: Clock, tone: 'text-status-info-fg', detail: payment.verification === 'auto_verified' ? k('underReviewDetail') : null },
        ];
  if (payment.verification === 'confirmed') steps.push({ key: 'confirmed', icon: CheckCircle2, tone: 'text-success', date: payment.reviewed_at ?? payment.paid_at });
  if (payment.verification === 'rejected')
    steps.push({ key: 'rejected', icon: XCircle, tone: 'text-danger', date: payment.reviewed_at, detail: [payment.rejection_reason, k('rejectedDetail')].filter(Boolean).join(' ') });

  return (
    <ol className="flex flex-col gap-3 border-l-2 pl-4" aria-label={k('label')}>
      {steps.map((s, i) => {
        const Icon = s.icon;
        const current = i === steps.length - 1;
        return (
          <li key={s.key} aria-current={current ? 'step' : undefined} className="flex gap-2">
            <Icon className={`mt-0.5 h-icon-sm w-icon-sm shrink-0 ${s.tone}`} aria-hidden="true" />
            <span className="flex flex-col">
              <span className={current ? 'type-body-s-strong text-primary' : 'type-body-s text-secondary'}>
                {k(s.key)}
                {s.date && <span className="font-normal text-tertiary"> · {formatDate(s.date, { language })}</span>}
              </span>
              {s.detail && <span className="type-caption text-secondary">{s.detail}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** R24 (D-31): one payment as a table row, plus its details row (R77 timeline, reference, View screenshot) when open. */
function PaymentRow({ payment }: { payment: Payment }) {
  const { t } = useTranslation();
  const toast = useToast();
  const language = useAppSelector(selectLanguage);
  const [getProof] = useLazyGetMyPaymentProofQuery();
  const [open, setOpen] = useState(false);

  const period = formatPeriod(payment.item.period, { language });
  const itemLabel =
    payment.item.type === 'charge'
      ? t('domain:item.charge', { period })
      : t('domain:item.bill_share', { period, billType: payment.item.bill_type ? t(`domain:billTypeTitle.${payment.item.bill_type}`) : '' });
  const isCredit = payment.method === 'credit';

  async function viewProof() {
    try {
      const { url } = await getProof(payment.id).unwrap();
      window.open(url, '_blank', 'noopener');
    } catch {
      toast.show('error', t('errors:UNKNOWN'));
    }
  }

  return (
    <>
      <tr>
        <TableCell className="whitespace-nowrap">{formatDate(payment.paid_at, { language })}</TableCell>
        <TableCell variant="strong">{itemLabel}</TableCell>
        <TableCell>{isCredit ? t('portal:history.creditMethod') : t(`domain:method.${payment.method}`)}</TableCell>
        <TableCell>
          <span className="flex flex-col items-end md:items-start">
            <span className="type-body-s-strong">{formatPeso(payment.amount, { language })}</span>
            {payment.credit_amount > 0 && (
              <span className="type-caption text-secondary">
                {t('portal:history.splitLine', { applied: formatPeso(payment.applied_amount, { language }), credit: formatPeso(payment.credit_amount, { language }) })}
              </span>
            )}
          </span>
        </TableCell>
        <TableCell variant="badge">
          <span className="flex flex-col items-end gap-1 md:items-start">
            <StatusBadge tone={VERIFICATION_TONE[payment.verification]}>{t(`domain:verification.${payment.verification}`)}</StatusBadge>
            {payment.verification === 'rejected' && payment.rejection_reason && (
              <span className="whitespace-normal type-caption text-danger">{payment.rejection_reason}</span>
            )}
          </span>
        </TableCell>
        <TableCell variant="actions">
          {!isCredit && (
            <button
              type="button"
              aria-expanded={open}
              aria-label={t('portal:history.detailsFor', { item: itemLabel })}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex min-h-touch items-center gap-1 type-label-s text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t('portal:history.details')}
              <ChevronDown className={`h-icon-sm w-icon-sm transition-transform duration-fast motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          )}
        </TableCell>
      </tr>
      {open && (
        <tr>
          <TableCell colSpan={6} className="bg-muted">
            <div className="flex w-full flex-col gap-3 text-left">
              <PaymentTimeline payment={payment} />
              {payment.reference_no && (
                <p className="type-body-s text-secondary">{t('portal:history.reference', { reference: payment.reference_no })}</p>
              )}
              {payment.has_proof && (
                <button type="button" onClick={() => void viewProof()} className="inline-flex min-h-touch w-fit items-center type-label-s text-brand underline hover:no-underline">
                  {t('portal:history.viewScreenshot')}
                </button>
              )}
            </div>
          </TableCell>
        </tr>
      )}
    </>
  );
}

/** R24, R54: Portal / Payments history as a stacked table (D-31, R79, 20 per page) plus the Credit section. */
export function PortalHistoryPage() {
  const { t } = useTranslation();
  const payments = useGetMyPaymentsQuery();
  const credit = useGetMyCreditQuery();

  const isLoading = payments.isLoading || credit.isLoading;
  const showSkeleton = useDelayedFlag(isLoading);
  const error = payments.error || credit.error;

  const paged = usePaged(payments.data ?? [], 20);

  if (error && !isLoading) {
    return (
      <ErrorState
        message={t('portal:history.errorLoading')}
        onRetry={() => {
          if (payments.error) void payments.refetch();
          if (credit.error) void credit.refetch();
        }}
      />
    );
  }

  if (isLoading) {
    return showSkeleton ? (
      <div className="flex flex-col gap-3">
        <Skeleton variant="row" />
        <Skeleton variant="row" />
        <Skeleton variant="row" />
      </div>
    ) : null;
  }

  const rows = payments.data ?? [];
  const ledger = credit.data;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="history-title">
        <h1 id="history-title" className="type-h1 text-primary max-sm:type-h2">
          {t('portal:history.title')}
        </h1>
        <div className="mt-4">
          {rows.length === 0 ? (
            <EmptyState title={t('portal:history.empty')} />
          ) : (
            <Table stacked>
              <caption className="sr-only">{t('portal:history.title')}</caption>
              <thead>
                <tr>
                  <TableHeaderCell>{t('portal:history.col.date')}</TableHeaderCell>
                  <TableHeaderCell>{t('portal:history.col.item')}</TableHeaderCell>
                  <TableHeaderCell>{t('portal:history.col.method')}</TableHeaderCell>
                  <TableHeaderCell>{t('portal:history.col.amount')}</TableHeaderCell>
                  <TableHeaderCell>{t('portal:history.col.status')}</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">{t('portal:history.details')}</span>
                  </TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((p) => (
                  <PaymentRow key={p.id} payment={p} />
                ))}
              </tbody>
            </Table>
          )}
          <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('portal:history.title') })} className="mt-3" />
        </div>
      </section>

      {ledger && ledger.entries.length > 0 && (
        <Card title={t('portal:history.creditTitle')} className="max-sm:p-4">
          <CreditLedgerList ledger={ledger} />
        </Card>
      )}
    </div>
  );
}
