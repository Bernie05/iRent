import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecordPaymentMutation } from '../../services/endpoints/admin';
import type { AdminMethod, ChargeRow, Item } from '../../types/api';
import { allocate } from '../admin/dashboard/metrics';
import { adminPaymentSchema } from '../../validation/payments';
import { toFieldErrors } from '../../validation/common';
import { isApiError, fieldErrors } from '../../services/errors';
import { formatPeso, formatPeriod } from '../../lib/format';
import { manilaToday } from '../../lib/time';
import { fromCentavos, hasAtMostTwoDecimals, toCentavos } from '../../lib/money';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../ui/uiSlice';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { TextField, SelectField } from '../../ui/TextField';
import { FileUpload } from '../../ui/FileUpload';
import { InlineAlert } from '../../ui/InlineAlert';
import { useToast } from '../../ui/ToastProvider';

const METHODS: AdminMethod[] = ['cash', 'gcash', 'maya', 'bpi'];

export interface RecordPaymentTarget {
  item: Item;
  remaining: number;
  renterName?: string;
  /**
   * Pay toward the renter's total: their open items, oldest due first. The payment is recorded against the first
   * (`item`, with `remaining` = the total); the existing excess-to-credit rule (BR-9, BR-10) then pays the rest, oldest first.
   */
  openItems?: ChargeRow[];
}

const initial = (remaining: number) => ({ method: 'cash', amount: String(remaining), paid_at: manilaToday(), reference_no: '', notes: '' });

/** F17 (R37, R52): shared by Rent (F16) and Bills (F19). Mounted per target so the form resets on each open. */
export function RecordPaymentModal({ target, onClose }: { target: RecordPaymentTarget | null; onClose: () => void }) {
  return target ? <Form key={`${target.item.type}-${target.item.id}`} target={target} onClose={onClose} /> : null;
}

function Form({ target, onClose }: { target: RecordPaymentTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const language = useAppSelector(selectLanguage);
  const [recordPayment, { isLoading }] = useRecordPaymentMutation();
  const [form, setForm] = useState(() => initial(target.remaining));
  const [receipt, setReceipt] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const { item } = target;
  const period = formatPeriod(item.period, { language });
  const itemLabel =
    item.type === 'charge'
      ? t('domain:item.charge', { period })
      : t('domain:item.bill_share', { period, billType: item.bill_type ? t(`domain:billTypeTitle.${item.bill_type}`) : '' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const amountNum = Number(form.amount);
  const validAmount = Number.isFinite(amountNum) && amountNum > 0 && hasAtMostTwoDecimals(form.amount.trim());
  const excess = validAmount ? toCentavos(amountNum) - toCentavos(target.remaining) : 0;
  const plan = target.openItems && validAmount ? allocate(target.openItems, amountNum) : null;
  const peso = (n: number) => formatPeso(n, { language });
  const labelOf = (i: Item) =>
    i.type === 'charge'
      ? t('domain:item.charge', { period: formatPeriod(i.period, { language }) })
      : t('domain:item.bill_share', { period: formatPeriod(i.period, { language }), billType: i.bill_type ? t(`domain:billType.${i.bill_type}`) : '' });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    const parsed = adminPaymentSchema().safeParse({ item_type: item.type, item_id: item.id, ...form, receipt });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      const { item_type, item_id, method, amount, paid_at, reference_no, notes, receipt: file } = parsed.data;
      const r = await recordPayment({ item_type, item_id, method, amount, paid_at, reference_no: reference_no || undefined, notes: notes || undefined, receipt: file }).unwrap();
      // Toward the total, credit_added is mostly re-applied to the next items; what stays as credit is credit_balance.
      const credit = target.openItems ? r.credit_balance : r.credit_added;
      toast.show('success', credit > 0 ? t('admin:recordPayment.savedCredit', { amount: formatPeso(credit, { language }) }) : t('admin:recordPayment.saved'));
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) {
        setErrors(fe);
        return;
      }
      const code = isApiError(err) ? err.code : null;
      setFormError(code === 'DUPLICATE_REFERENCE' || code === 'ITEM_ALREADY_PAID' || code === 'INVALID_FILE_TYPE' || code === 'FILE_TOO_LARGE' ? t(`errors:${code}`) : t('errors:UNKNOWN'));
    }
  }

  const err = (k: string) => (errors[k] ? t(errors[k]) : undefined);

  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin:recordPayment.title')}
      description={
        target.openItems
          ? `${target.renterName ?? ''} · ${t('admin:recordPayment.totalOutstanding', { amount: peso(target.remaining), count: target.openItems.length })}`
          : `${target.renterName ? `${target.renterName} · ` : ''}${itemLabel} · ${t('admin:recordPayment.remaining', { amount: formatPeso(target.remaining, { language }) })}`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="record-payment-form" loading={isLoading} loadingText={t('common:saving')} disabled={isLoading}>
            {t('admin:recordPayment.save')}
          </Button>
        </>
      }
    >
      <form id="record-payment-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
        <SelectField
          label={t('admin:recordPayment.method')}
          value={form.method}
          onChange={set('method')}
          options={METHODS.map((m) => ({ value: m, label: t(`domain:method.${m}`) }))}
          error={err('method')}
          required
        />
        <TextField
          label={t('admin:recordPayment.amount')}
          inputMode="decimal"
          value={form.amount}
          onChange={set('amount')}
          error={err('amount')}
          helper={excess > 0 ? t('admin:recordPayment.excessHelper', { amount: formatPeso(fromCentavos(excess), { language }) }) : undefined}
          required
        />
        {target.openItems && (
          <div className="rounded-md border bg-muted p-3" aria-live="polite">
            <p className="type-label-s text-primary">{t('admin:recordPayment.thisPays')}</p>
            {plan && plan.lines.some((l) => l.applied > 0) ? (
              <ul className="mt-1 flex flex-col gap-0.5 type-body-s text-secondary">
                {plan.lines
                  .filter((l) => l.applied > 0)
                  .map((l) => (
                    <li key={l.row.id} className="flex justify-between gap-3">
                      <span>
                        {labelOf(l.row.item)} ({l.left > 0 ? t('admin:recordPayment.partLeft', { amount: peso(l.left) }) : t('admin:recordPayment.full')})
                      </span>
                      <span className="tabular-nums text-primary">{peso(l.applied)}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="type-body-s text-secondary">{t('admin:recordPayment.enterAmount')}</p>
            )}
            {plan && <p className="mt-2 type-body-s-strong text-primary">{t('admin:recordPayment.leftAfter', { amount: peso(plan.remaining) })}</p>}
          </div>
        )}
        <TextField label={t('admin:recordPayment.date')} type="date" max={manilaToday()} value={form.paid_at} onChange={set('paid_at')} error={err('paid_at')} required />
        <TextField
          label={form.method === 'cash' ? t('admin:recordPayment.referenceOptional') : t('admin:recordPayment.reference')}
          value={form.reference_no}
          onChange={set('reference_no')}
          error={err('reference_no')}
          required={form.method !== 'cash'}
        />
        <TextField label={t('admin:recordPayment.notes')} value={form.notes} onChange={set('notes')} error={err('notes')} />
        <FileUpload label={t('admin:recordPayment.receipt')} value={receipt} onChange={setReceipt} error={err('receipt')} />
      </form>
    </Modal>
  );
}
