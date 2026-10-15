import { useState } from 'react';
import { ConfirmDelete } from '../../ui/ConfirmDialog';
import { useTranslation } from 'react-i18next';
import { useDeleteChargeMutation, useGenerateRentMutation, useGetRentChargesQuery, useUpdateChargeMutation } from '../../services/endpoints/admin';
import type { ChargeRow, RentStatusFilter } from '../../types/api';
import { rentChargeEditSchema } from '../../validation/admin';
import { toFieldErrors } from '../../validation/common';
import { isApiError, fieldErrors } from '../../services/errors';
import { formatPeso, formatDate, formatPeriod } from '../../lib/format';
import { periodOf } from '../../lib/time';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../ui/uiSlice';
import { RecordPaymentModal, type RecordPaymentTarget } from '../shared/RecordPaymentModal';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { StatusBadge } from '../../ui/StatusBadge';
import { Modal } from '../../ui/Modal';
import { TextField } from '../../ui/TextField';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Table, TableHeaderCell, TableCell } from '../../ui/Table';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { InlineAlert } from '../../ui/InlineAlert';
import { Receipt, Plus, Pencil, Trash2, Wallet } from '../../ui/icons';
import { useToast } from '../../ui/ToastProvider';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';

const FILTERS: RentStatusFilter[] = ['all', 'unpaid', 'partial', 'overdue'];
const STATUS_TONE = { unpaid: 'neutral', partial: 'warning', paid: 'success', overdue: 'danger' } as const;

/** `YYYY-MM-01` <-> the `YYYY-MM` value of `<input type="month">`. */
const toMonth = (period: string) => period.slice(0, 7);
const toPeriod = (month: string) => `${month}-01`;

/** R35/R36: charges table with period and status filters, Generate month, and row actions. */
export function AdminRentPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const language = useAppSelector(selectLanguage);

  const [month, setMonth] = useState(toMonth(periodOf()));
  const [status, setStatus] = useState<RentStatusFilter>('all');
  const period = /^\d{4}-\d{2}$/.test(month) ? toPeriod(month) : periodOf();
  const { data, isLoading, error, refetch } = useGetRentChargesQuery({ period, status });
  const showSkeleton = useDelayedFlag(isLoading);
  const [generateRent, { isLoading: isGenerating }] = useGenerateRentMutation();
  const [updateCharge, { isLoading: isSaving }] = useUpdateChargeMutation();
  const [deleteCharge] = useDeleteChargeMutation();

  const [paying, setPaying] = useState<RecordPaymentTarget | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genMonth, setGenMonth] = useState('');
  const [genError, setGenError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ChargeRow | null>(null);
  const [form, setForm] = useState({ amount: '', due_date: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function openGenerate() {
    setGenMonth(toMonth(periodOf()));
    setGenError(null);
    setGenerating(true);
  }

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (isGenerating) return;
    if (!/^\d{4}-\d{2}$/.test(genMonth)) {
      setGenError(t('validation:required'));
      return;
    }
    try {
      const r = await generateRent({ period: toPeriod(genMonth) }).unwrap();
      const credit = r.credit_applied_total > 0 ? t('admin:rent.generatedCredit', { amount: formatPeso(r.credit_applied_total, { language }) }) : '';
      toast.show('success', t('admin:rent.generated', { created: r.created, skipped: r.skipped_existing + r.skipped_not_moved_in }) + credit);
      setGenerating(false);
    } catch {
      setGenError(t('errors:UNKNOWN'));
    }
  }

  function openEdit(charge: ChargeRow) {
    setEditing(charge);
    setForm({ amount: String(charge.amount), due_date: charge.due_date });
    setErrors({});
    setFormError(null);
  }

  async function onSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving || !editing) return;
    const parsed = rentChargeEditSchema(editing.paid_total).safeParse(form);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await updateCharge({ id: editing.id, ...parsed.data }).unwrap();
      toast.show('success', t('admin:rent.saved'));
      setEditing(null);
    } catch (err) {
      if (isApiError(err) && err.code === 'AMOUNT_BELOW_PAID') {
        setErrors({ amount: 'errors:AMOUNT_BELOW_PAID' });
        return;
      }
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) {
        setErrors(fe);
        return;
      }
      setFormError(t('errors:UNKNOWN'));
    }
  }

  const [deleting, setDeleting] = useState<ChargeRow | null>(null);
  async function onDelete(charge: ChargeRow) {
    try {
      await deleteCharge(charge.id).unwrap();
      setDeleting(null);
      toast.show('success', t('admin:rent.deleted'));
    } catch (err) {
      toast.show('error', isApiError(err) && err.code === 'CHARGE_HAS_PAYMENTS' ? t('errors:CHARGE_HAS_PAYMENTS') : t('errors:UNKNOWN'));
    }
  }

  if (error && !isLoading) {
    return <ErrorState message={t('admin:rent.errorLoading')} onRetry={() => void refetch()} />;
  }

  const rows = data ?? [];
  const filterLabels: Record<RentStatusFilter, string> = {
    all: t('admin:rent.filterAll'),
    unpaid: t('admin:rent.filterUnpaid'),
    partial: t('admin:rent.filterPartial'),
    overdue: t('admin:rent.filterOverdue'),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="type-h2 text-primary">{t('admin:rent.title')}</h1>
        <Button iconLeft={<Plus className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={openGenerate}>
          {t('admin:rent.generate')}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <TextField label={t('admin:rent.period')} type="month" value={month} onChange={(e) => setMonth(e.target.value)} containerClassName="w-48" />
        <SegmentedControl
          label={t('admin:rent.filterLabel')}
          options={FILTERS.map((f) => ({ value: f, label: filterLabels[f] }))}
          value={status}
          onChange={setStatus}
        />
      </div>

      {isLoading ? (
        showSkeleton ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="row" />
            ))}
          </div>
        ) : null
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-icon-lg w-icon-lg text-tertiary" aria-hidden="true" />}
          title={status === 'all' ? t('admin:rent.empty') : t('admin:rent.emptyFilter', { filter: filterLabels[status].toLowerCase() })}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <TableHeaderCell>{t('admin:rent.columnRenter')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:rent.columnBed')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:rent.columnPeriod')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:rent.columnAmount')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:rent.columnPaid')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:rent.columnRemaining')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:rent.columnDue')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:rent.columnStatus')}</TableHeaderCell>
              <TableHeaderCell>
                <span className="sr-only">{t('admin:renters.edit')}</span>
              </TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const key = c.is_overdue ? 'overdue' : c.status;
              const hasPayments = c.paid_total > 0;
              return (
                <tr key={c.id}>
                  <TableCell variant="strong">{c.renter?.full_name}</TableCell>
                  <TableCell>{c.bed?.label}</TableCell>
                  <TableCell>{formatPeriod(c.item.period, { language })}</TableCell>
                  <TableCell>{formatPeso(c.amount, { language })}</TableCell>
                  <TableCell>
                    {formatPeso(c.paid_total, { language })}
                    {/* R55: shown as text (not hover-only) so it is reachable by keyboard and screen readers. */}
                    {c.paid_from_credit > 0 && (
                      <span className="type-caption block text-tertiary">{t('admin:rent.fromCredit', { amount: formatPeso(c.paid_from_credit, { language }) })}</span>
                    )}
                  </TableCell>
                  <TableCell>{formatPeso(c.remaining, { language })}</TableCell>
                  <TableCell>{formatDate(c.due_date, { language })}</TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_TONE[key]}>{t(`domain:itemStatus.${key}`)}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {c.remaining > 0 && (
                        <IconButton
                          label={t('admin:rent.recordPayment')}
                          icon={<Wallet className="h-icon-sm w-icon-sm" aria-hidden="true" />}
                          onClick={() => setPaying({ item: c.item, remaining: c.remaining, renterName: c.renter?.full_name })}
                        />
                      )}
                      <IconButton label={t('admin:rent.edit')} icon={<Pencil className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => openEdit(c)} />
                      <IconButton
                        label={hasPayments ? t('admin:rent.deleteDisabledTooltip') : t('admin:rent.delete')}
                        icon={<Trash2 className="h-icon-sm w-icon-sm" aria-hidden="true" />}
                        aria-disabled={hasPayments || undefined}
                        onClick={() => {
                          if (!hasPayments) setDeleting(c);
                        }}
                      />
                    </div>
                  </TableCell>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <RecordPaymentModal target={paying} onClose={() => setPaying(null)} />
      <ConfirmDelete item={deleting ? `${deleting.renter?.full_name ?? ''} · ${t('domain:item.charge', { period: formatPeriod(deleting.item.period, { language }) })}` : null} onCancel={() => setDeleting(null)} onConfirm={() => deleting && void onDelete(deleting)} />

      <Modal
        open={generating}
        onClose={() => setGenerating(false)}
        title={t('admin:rent.generateTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenerating(false)}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" form="generate-form" loading={isGenerating} loadingText={t('common:saving')} disabled={isGenerating}>
              {t('admin:rent.generateConfirm')}
            </Button>
          </>
        }
      >
        <form id="generate-form" onSubmit={onGenerate} noValidate className="flex flex-col gap-4">
          <TextField label={t('admin:rent.period')} type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} error={genError ?? undefined} required />
        </form>
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t('admin:rent.editTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" form="edit-charge-form" loading={isSaving} loadingText={t('common:saving')} disabled={isSaving}>
              {t('common:save')}
            </Button>
          </>
        }
      >
        <form id="edit-charge-form" onSubmit={onSubmitEdit} noValidate className="flex flex-col gap-4">
          {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
          <TextField
            label={t('admin:rent.amount')}
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            error={errors.amount ? t(errors.amount) : undefined}
            required
          />
          <TextField
            label={t('admin:rent.dueDate')}
            type="date"
            value={form.due_date}
            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
            error={errors.due_date ? t(errors.due_date) : undefined}
            required
          />
        </form>
      </Modal>
    </div>
  );
}
