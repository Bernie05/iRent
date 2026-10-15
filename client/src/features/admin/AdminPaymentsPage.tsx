import { useState } from 'react';
import { Pagination, usePaged } from '../../ui/Pagination';
import { useTranslation } from 'react-i18next';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetPaymentProofQuery, useGetPaymentsQuery, useReviewPaymentMutation } from '../../services/endpoints/admin';
import type { Item, Payment, RejectResult } from '../../types/api';
import { rejectReasonSchema } from '../../validation/payments';
import { toFieldErrors } from '../../validation/common';
import { isApiError } from '../../services/errors';
import { formatPeso, formatDate, formatPeriod } from '../../lib/format';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../ui/uiSlice';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Modal } from '../../ui/Modal';
import { TextareaField } from '../../ui/TextField';
import { Table, TableHeaderCell, TableCell } from '../../ui/Table';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { InlineAlert } from '../../ui/InlineAlert';
import { CheckCircle2, ZoomIn, ZoomOut } from '../../ui/icons';
import { useToast } from '../../ui/ToastProvider';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';

type T = (key: string, opts?: Record<string, unknown>) => string;

function itemLabel(item: Item, t: T, language: 'en' | 'fil') {
  const period = formatPeriod(item.period, { language });
  return item.type === 'charge'
    ? t('domain:item.charge', { period })
    : t('domain:item.bill_share', { period, billType: item.bill_type ? t(`domain:billTypeTitle.${item.bill_type}`) : '' });
}

/** R38, R55, R56: auto-verified uploads oldest first, the review modal (Confirm / Reject with reason). */
export function AdminPaymentsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const language = useAppSelector(selectLanguage);

  const { data, isLoading, error, refetch } = useGetPaymentsQuery({ verification: 'auto_verified' });
  const showSkeleton = useDelayedFlag(isLoading);
  const [reviewPayment, { isLoading: isReviewing }] = useReviewPaymentMutation();

  const [reviewing, setReviewing] = useState<Payment | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const proof = useGetPaymentProofQuery(reviewing?.has_proof ? reviewing.id : skipToken);

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  function openReview(payment: Payment) {
    setReviewing(payment);
    setZoomed(false);
  }

  function closeAll() {
    setRejecting(false);
    setReviewing(null);
  }

  function openReject() {
    setReason('');
    setReasonError(null);
    setRejecting(true);
  }

  /** E6: someone else reviewed it first. Close the modals and reload the list. */
  function onFailure(err: unknown) {
    if (isApiError(err) && err.code === 'ALREADY_REVIEWED') {
      toast.show('error', t('errors:ALREADY_REVIEWED'));
      closeAll();
      void refetch();
      return;
    }
    toast.show('error', t('errors:UNKNOWN'));
  }

  async function onConfirm() {
    if (!reviewing || isReviewing) return;
    try {
      await reviewPayment({ id: reviewing.id, action: 'confirm' }).unwrap();
      toast.show('success', t('admin:payments.confirmed'));
      closeAll();
    } catch (err) {
      onFailure(err);
    }
  }

  async function onReject(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewing || isReviewing) return;
    const parsed = rejectReasonSchema.safeParse({ reason });
    if (!parsed.success) {
      setReasonError(t(toFieldErrors(parsed.error).reason));
      return;
    }
    try {
      const r = (await reviewPayment({ id: reviewing.id, action: 'reject', reason: parsed.data.reason }).unwrap()) as RejectResult;
      const credit = r.credit_reversed > 0 ? t('admin:payments.rejectedCredit', { amount: formatPeso(r.credit_reversed, { language }) }) : '';
      const reopened = r.items_reopened.length
        ? t('admin:payments.rejectedReopened', { items: r.items_reopened.map((x) => itemLabel(x.item, t, language)).join(', ') })
        : '';
      toast.show('success', t('admin:payments.rejected') + credit + reopened);
      closeAll();
    } catch (err) {
      onFailure(err);
    }
  }

  const paged = usePaged(data ?? [], 10);

  if (error && !isLoading) {
    return <ErrorState message={t('admin:payments.errorLoading')} onRetry={() => void refetch()} />;
  }

  const rows = data ?? [];
  const excessText = (p: Payment) => (p.credit_amount > 0 ? formatPeso(p.credit_amount, { language }) : '—');
  const alreadyUsed = reviewing?.credit_already_used ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="type-h2 text-primary">{t('admin:payments.title')}</h1>

      {isLoading ? (
        showSkeleton ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="row" />
            ))}
          </div>
        ) : null
      ) : rows.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-icon-lg w-icon-lg text-tertiary" aria-hidden="true" />} title={t('admin:payments.empty')} />
      ) : (
        <Table>
          <thead>
            <tr>
              <TableHeaderCell>{t('admin:payments.columnRenter')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:payments.columnItem')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:payments.columnMethod')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:payments.columnAmount')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:payments.columnReference')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:payments.columnSubmitted')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:payments.columnExcess')}</TableHeaderCell>
              <TableHeaderCell>
                <span className="sr-only">{t('admin:payments.review')}</span>
              </TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((p) => (
              <tr key={p.id}>
                <TableCell variant="strong">{p.renter?.full_name}</TableCell>
                <TableCell>{itemLabel(p.item, t, language)}</TableCell>
                <TableCell>{t(`domain:method.${p.method}`)}</TableCell>
                <TableCell>{formatPeso(p.amount, { language })}</TableCell>
                <TableCell>{p.reference_no ?? '—'}</TableCell>
                <TableCell>{formatDate(p.paid_at, { language })}</TableCell>
                <TableCell>{excessText(p)}</TableCell>
                <TableCell>
                  <Button variant="secondary" onClick={() => openReview(p)}>
                    {t('admin:payments.review')}
                  </Button>
                </TableCell>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('admin:payments.title') })} />

      <Modal
        open={!!reviewing}
        onClose={closeAll}
        title={t('admin:payments.reviewTitle')}
        footer={
          <>
            <Button variant="danger" onClick={openReject} disabled={isReviewing}>
              {t('admin:payments.reject')}
            </Button>
            <Button onClick={() => void onConfirm()} loading={isReviewing && !rejecting} loadingText={t('common:saving')} disabled={isReviewing}>
              {t('admin:payments.confirm')}
            </Button>
          </>
        }
      >
        {reviewing && (
          <div className="flex flex-col gap-4">
            {alreadyUsed > 0 && <InlineAlert tone="warning">{t('admin:payments.alreadyUsed', { amount: formatPeso(alreadyUsed, { language }) })}</InlineAlert>}

            <section aria-label={t('admin:payments.screenshot')} className="flex flex-col gap-2">
              {!reviewing.has_proof ? (
                <p className="type-body-s text-secondary">{t('admin:payments.noScreenshot')}</p>
              ) : proof.isError ? (
                <InlineAlert tone="error">{t('admin:payments.screenshotError')}</InlineAlert>
              ) : !proof.currentData ? (
                <Skeleton variant="row" />
              ) : (
                <>
                  <div className="flex justify-end">
                    <IconButton
                      label={zoomed ? t('admin:payments.zoomOut') : t('admin:payments.zoomIn')}
                      icon={zoomed ? <ZoomOut className="h-icon-sm w-icon-sm" aria-hidden="true" /> : <ZoomIn className="h-icon-sm w-icon-sm" aria-hidden="true" />}
                      aria-pressed={zoomed}
                      onClick={() => setZoomed((z) => !z)}
                    />
                  </div>
                  {/* Scrollable when zoomed; tabIndex lets keyboard users pan with the arrow keys. */}
                  <div className="max-h-[60vh] overflow-auto rounded-md border" tabIndex={0}>
                    <img
                      src={proof.currentData.url}
                      alt={t('admin:payments.screenshotAlt', { reference: reviewing.reference_no ?? '—' })}
                      className={zoomed ? 'w-[200%] max-w-none' : 'w-full'}
                    />
                  </div>
                </>
              )}
            </section>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 type-body-s">
              {(
                [
                  ['renter', reviewing.renter?.full_name ?? '—'],
                  ['item', itemLabel(reviewing.item, t, language)],
                  ['method', t(`domain:method.${reviewing.method}`)],
                  ['amount', formatPeso(reviewing.amount, { language })],
                  ['reference', reviewing.reference_no ?? '—'],
                  ['submitted', formatDate(reviewing.paid_at, { language })],
                  ...(reviewing.credit_amount > 0 ? [['excess', excessText(reviewing)]] : []),
                ] as [string, string][]
              ).map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-secondary">{t(`admin:payments.${key}`)}</dt>
                  <dd className="text-primary">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Modal>

      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={t('admin:payments.rejectTitle')}
        description={t('admin:payments.rejectDescription')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(false)}>
              {t('common:cancel')}
            </Button>
            <Button
              type="submit"
              form="reject-payment-form"
              variant="danger"
              loading={isReviewing}
              loadingText={t('common:saving')}
              disabled={isReviewing || !reason.trim()}
            >
              {t('admin:payments.rejectConfirm')}
            </Button>
          </>
        }
      >
        <form id="reject-payment-form" onSubmit={onReject} noValidate>
          <TextareaField
            label={t('admin:payments.reason')}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError(null);
            }}
            maxLength={500}
            error={reasonError ?? undefined}
            required
          />
        </form>
      </Modal>
    </div>
  );
}
