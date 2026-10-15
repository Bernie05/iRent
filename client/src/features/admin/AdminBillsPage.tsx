import { useState } from 'react';
import { Pagination, usePaged } from '../../ui/Pagination';
import { useTranslation } from 'react-i18next';
import { useCreateBillMutation, useGetActiveTenanciesQuery, useGetBillsQuery, useUpdateBillSharesMutation } from '../../services/endpoints/admin';
import type { Bill, BillType, ShareRow } from '../../types/api';
import { billSchema } from '../../validation/admin';
import { toFieldErrors } from '../../validation/common';
import { isApiError, fieldErrors } from '../../services/errors';
import { equalSplit, hasAtMostTwoDecimals, sumCentavos, toCentavos } from '../../lib/money';
import { formatPeso, formatDate, formatPeriod } from '../../lib/format';
import { periodOf } from '../../lib/time';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../ui/uiSlice';
import { RecordPaymentModal, type RecordPaymentTarget } from '../shared/RecordPaymentModal';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { StatusBadge } from '../../ui/StatusBadge';
import { Modal } from '../../ui/Modal';
import { TextField, SelectField } from '../../ui/TextField';
import { Table, TableHeaderCell, TableCell } from '../../ui/Table';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { InlineAlert } from '../../ui/InlineAlert';
import { Receipt, Plus, Pencil, Wallet } from '../../ui/icons';
import { useToast } from '../../ui/ToastProvider';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';

const BILL_TYPES: BillType[] = ['electricity', 'water', 'internet'];
const STATUS_TONE = { unpaid: 'neutral', partial: 'warning', paid: 'success', overdue: 'danger' } as const;

/** Centavos of a typed peso amount, or null when it isn't valid money. */
function centsOf(text: string): number | null {
  const v = text.trim();
  return v !== '' && hasAtMostTwoDecimals(v) && Number(v) >= 0 ? toCentavos(v) : null;
}

/** Sum of typed shares in centavos, or null when any share is invalid. */
function sumOf(values: string[]): number | null {
  const cents = values.map(centsOf);
  return cents.every((c) => c !== null) ? sumCentavos(cents as number[]) : null;
}

const pesoText = (cents: number) => (cents / 100).toFixed(2);

/** R39 / OQ-21: "Shares must add up to ₱X. Now ₱Y." shown until the shares match the total. */
function SumHint({ totalCents, sum }: { totalCents: number; sum: number | null }) {
  const { t } = useTranslation();
  const language = useAppSelector(selectLanguage);
  if (sum === totalCents) return null;
  return (
    <p role="status" className="type-body-s text-danger">
      {t('validation:sharesSum', { total: formatPeso(totalCents / 100, { language }) })}
      {sum !== null && ` ${t('admin:bills.currentSum', { sum: formatPeso(sum / 100, { language }) })}`}
    </p>
  );
}

/** Enter bill (R39, BR-5): fields plus a live, editable equal-split preview across active tenancies. */
function EnterBillModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const tenancies = useGetActiveTenanciesQuery();
  const [createBill, { isLoading: isSaving }] = useCreateBillMutation();

  const [form, setForm] = useState({ type: 'electricity', month: periodOf().slice(0, 7), total: '', due_date: '' });
  const [edited, setEdited] = useState<string[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const active = tenancies.data ?? [];
  const totalCents = centsOf(form.total);
  // Until the admin edits a share, the preview follows the total (the API returns tenancies in BR-5 order).
  const shares =
    edited && edited.length === active.length
      ? edited
      : equalSplit(totalCents && totalCents > 0 ? totalCents : 0, active.length).map((c) => (totalCents ? pesoText(c) : ''));
  const sum = sumOf(shares);
  const noRenters = tenancies.isSuccess && active.length === 0;
  const canSave = !isSaving && !noRenters && !!totalCents && sum === totalCents;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (k === 'total') setEdited(null);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const parsed = billSchema.safeParse({
      type: form.type,
      period: `${form.month}-01`,
      total_amount: form.total,
      due_date: form.due_date,
      shares: shares.map((amount, i) => ({ id: active[i].id, amount })),
    });
    if (!parsed.success) {
      const fe = toFieldErrors(parsed.error);
      setErrors({ ...fe, ...(fe.period ? { month: fe.period } : {}) });
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await createBill({
        type: parsed.data.type,
        period: parsed.data.period,
        total_amount: Number(form.total),
        due_date: parsed.data.due_date,
        shares: shares.map((amount, i) => ({ tenancy_id: active[i].id, amount: Number(amount) })),
      }).unwrap();
      toast.show('success', t('admin:bills.saved'));
      onClose();
    } catch (err) {
      if (isApiError(err) && (err.code === 'NO_ACTIVE_TENANCIES' || err.code === 'SHARES_SUM_MISMATCH')) {
        setFormError(t(`errors:${err.code}`));
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

  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin:bills.enterTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="enter-bill-form" loading={isSaving} loadingText={t('common:saving')} disabled={!canSave}>
            {t('common:save')}
          </Button>
        </>
      }
    >
      <form id="enter-bill-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
        {noRenters && <InlineAlert tone="error">{t('errors:NO_ACTIVE_TENANCIES')}</InlineAlert>}
        <SelectField
          label={t('admin:bills.type')}
          options={BILL_TYPES.map((v) => ({ value: v, label: t(`domain:billTypeTitle.${v}`) }))}
          value={form.type}
          onChange={set('type')}
          error={errors.type ? t(errors.type) : undefined}
          required
        />
        <TextField label={t('admin:bills.period')} type="month" value={form.month} onChange={set('month')} error={errors.month ? t(errors.month) : undefined} required />
        <TextField
          label={t('admin:bills.total')}
          inputMode="decimal"
          value={form.total}
          onChange={set('total')}
          error={errors.total_amount ? t(errors.total_amount) : undefined}
          required
        />
        <TextField label={t('admin:bills.dueDate')} type="date" value={form.due_date} onChange={set('due_date')} error={errors.due_date ? t(errors.due_date) : undefined} required />

        {active.length > 0 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="type-label-s text-secondary">{t('admin:bills.preview')}</legend>
            <p className="type-caption text-tertiary">{t('admin:bills.previewHint')}</p>
            {active.map((ten, i) => (
              <TextField
                key={ten.id}
                label={t('admin:bills.shareLabel', { name: ten.renter.full_name })}
                inputMode="decimal"
                value={shares[i]}
                onChange={(e) => setEdited(shares.map((s, j) => (j === i ? e.target.value : s)))}
              />
            ))}
            {totalCents !== null && totalCents > 0 && <SumHint totalCents={totalCents} sum={sum} />}
          </fieldset>
        )}
      </form>
    </Modal>
  );
}

/** One bill with its shares; Edit shares saves several share amounts together (sum must stay = total). */
function BillCard({ bill, onPay }: { bill: Bill; onPay: (target: RecordPaymentTarget) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const language = useAppSelector(selectLanguage);
  const [updateShares, { isLoading: isSaving }] = useUpdateBillSharesMutation();
  const [amounts, setAmounts] = useState<Record<string, string> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const totalCents = toCentavos(bill.total_amount);
  const title = t('admin:bills.billTitle', { period: formatPeriod(bill.period, { language }), billType: t(`domain:billTypeTitle.${bill.type}`) });
  const editing = amounts !== null;
  const sum = editing ? sumOf(bill.shares.map((s) => amounts[s.id])) : totalCents;

  function startEdit() {
    setAmounts(Object.fromEntries(bill.shares.map((s) => [s.id, String(s.amount)])));
    setErrors({});
    setFormError(null);
  }

  async function onSave() {
    if (!amounts || isSaving || sum !== totalCents) return;
    const below = Object.fromEntries(
      bill.shares.filter((s) => (centsOf(amounts[s.id]) ?? 0) < toCentavos(s.paid_total)).map((s) => [s.id, t('validation:shareBelowPaid')]),
    );
    setErrors(below);
    if (Object.keys(below).length) return;
    setFormError(null);
    try {
      await updateShares({ billId: bill.id, shares: bill.shares.map((s) => ({ id: s.id, amount: Number(amounts[s.id]) })) }).unwrap();
      toast.show('success', t('admin:bills.sharesSaved'));
      setAmounts(null);
    } catch (err) {
      const code = isApiError(err) ? err.code : '';
      setFormError(code === 'SHARES_SUM_MISMATCH' || code === 'AMOUNT_BELOW_PAID' ? t(`errors:${code}`) : t('errors:UNKNOWN'));
    }
  }

  const renderAmount = (s: ShareRow) =>
    editing ? (
      <TextField
        label={t('admin:bills.shareLabel', { name: s.renter?.full_name ?? '' })}
        labelHidden
        inputMode="decimal"
        value={amounts[s.id]}
        onChange={(e) => setAmounts((a) => ({ ...a!, [s.id]: e.target.value }))}
        error={errors[s.id]}
        containerClassName="w-32"
      />
    ) : (
      formatPeso(s.amount, { language })
    );

  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="type-h3 text-primary">{title}</h2>
          <p className="type-body-s text-secondary">
            {t('admin:bills.summary', { total: formatPeso(bill.total_amount, { language }), due: formatDate(bill.due_date, { language }) })}
          </p>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAmounts(null)}>
              {t('common:cancel')}
            </Button>
            <Button onClick={() => void onSave()} loading={isSaving} loadingText={t('common:saving')} disabled={isSaving || sum !== totalCents}>
              {t('admin:bills.saveShares')}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" iconLeft={<Pencil className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={startEdit}>
            {t('admin:bills.editShares')}
          </Button>
        )}
      </div>
      {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
      {editing && <SumHint totalCents={totalCents} sum={sum} />}
      <Table>
        <thead>
          <tr>
            <TableHeaderCell>{t('admin:bills.columnRenter')}</TableHeaderCell>
            <TableHeaderCell>{t('admin:bills.columnAmount')}</TableHeaderCell>
            <TableHeaderCell>{t('admin:bills.columnPaid')}</TableHeaderCell>
            <TableHeaderCell>{t('admin:bills.columnRemaining')}</TableHeaderCell>
            <TableHeaderCell>{t('admin:bills.columnStatus')}</TableHeaderCell>
            <TableHeaderCell>
              <span className="sr-only">{t('admin:bills.markPaid')}</span>
            </TableHeaderCell>
          </tr>
        </thead>
        <tbody>
          {bill.shares.map((s) => {
            const key = s.is_overdue ? 'overdue' : s.status;
            return (
              <tr key={s.id}>
                <TableCell variant="strong">{s.renter?.full_name}</TableCell>
                <TableCell>{renderAmount(s)}</TableCell>
                <TableCell>
                  {formatPeso(s.paid_total, { language })}
                  {s.paid_from_credit > 0 && (
                    <span className="type-caption block text-tertiary">{t('admin:bills.fromCredit', { amount: formatPeso(s.paid_from_credit, { language }) })}</span>
                  )}
                </TableCell>
                <TableCell>{formatPeso(s.remaining, { language })}</TableCell>
                <TableCell>
                  <StatusBadge tone={STATUS_TONE[key]}>{t(`domain:itemStatus.${key}`)}</StatusBadge>
                </TableCell>
                <TableCell>
                  {s.remaining > 0 && !editing && (
                    <IconButton
                      label={t('admin:bills.markPaid')}
                      icon={<Wallet className="h-icon-sm w-icon-sm" aria-hidden="true" />}
                      onClick={() => onPay({ item: s.item, remaining: s.remaining, renterName: s.renter?.full_name })}
                    />
                  )}
                </TableCell>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </section>
  );
}

/** R39 (S12): bills with their shares, Enter bill, Edit shares, Mark share paid. */
export function AdminBillsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useGetBillsQuery();
  const showSkeleton = useDelayedFlag(isLoading);
  const [entering, setEntering] = useState(false);
  const [paying, setPaying] = useState<RecordPaymentTarget | null>(null);

  const paged = usePaged(data ?? [], 10);

  if (error && !isLoading) {
    return <ErrorState message={t('admin:bills.errorLoading')} onRetry={() => void refetch()} />;
  }

  const bills = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="type-h2 text-primary">{t('admin:bills.title')}</h1>
        <Button iconLeft={<Plus className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setEntering(true)}>
          {t('admin:bills.enter')}
        </Button>
      </div>

      {isLoading ? (
        showSkeleton ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="row" />
            ))}
          </div>
        ) : null
      ) : bills.length === 0 ? (
        <EmptyState icon={<Receipt className="h-icon-lg w-icon-lg text-tertiary" aria-hidden="true" />} title={t('admin:bills.empty')} />
      ) : (
        paged.rows.map((b) => <BillCard key={b.id} bill={b} onPay={setPaying} />)
      )}
      <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('admin:bills.title') })} />

      {entering && <EnterBillModal onClose={() => setEntering(false)} />}
      <RecordPaymentModal target={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
