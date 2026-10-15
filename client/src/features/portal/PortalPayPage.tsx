import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  useGetMyBillsQuery,
  useGetMyChargesQuery,
  useGetMyPaymentAccountsQuery,
  useSubmitPaymentMutation,
} from '../../services/endpoints/renter';
import type { ChargeRow, ExternalMethod, ItemType, PayResult, ShareRow } from '../../types/api';
import { paymentUploadSchema } from '../../validation/payments';
import { toFieldErrors } from '../../validation/common';
import { isApiError, fieldErrors } from '../../services/errors';
import { formatPeso, formatPeriod } from '../../lib/format';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../../features/ui/uiSlice';
import { selectProfile } from '../../features/auth/authSlice';
import { SelectField, TextField } from '../../ui/TextField';
import { FileUpload } from '../../ui/FileUpload';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { InlineAlert } from '../../ui/InlineAlert';
import { EmptyState } from '../../ui/EmptyState';
import { Card } from '../admin/dashboard/Card';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { Copy, Check } from '../../ui/icons';
import { useToast } from '../../ui/ToastProvider';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';

const METHODS: ExternalMethod[] = ['gcash', 'maya', 'bpi'];

type OpenItem = (ChargeRow | ShareRow) & { key: string };

function itemLabel(item: OpenItem, t: (key: string, opts?: Record<string, unknown>) => string, language: 'en' | 'fil'): string {
  const period = formatPeriod(item.item.period, { language });
  const base =
    item.item.type === 'charge'
      ? t('domain:item.charge', { period })
      : t('domain:item.bill_share', { period, billType: item.item.bill_type ? t(`domain:billTypeTitle.${item.item.bill_type}`) : '' });
  return `${base} — ${formatPeso(item.remaining, { language })}`;
}

/** R19/R20: payment account card with a Copy button for the account number. */
function AccountCard({ account }: { account: { method: ExternalMethod; account_name: string; account_number: string; qr_url: string | null } }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(account.account_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable: no-op, the number is still visible to copy manually.
    }
  }

  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      {account.qr_url && <img src={account.qr_url} alt="" className="h-16 w-16 shrink-0 rounded-md border object-cover" />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-label-s text-secondary">{t(`domain:method.${account.method}`)}</p>
        <p className="type-body-m-strong text-primary">{account.account_name}</p>
        <p className="break-all type-body-m tabular-nums text-primary">{account.account_number}</p>
      </div>
      <IconButton
        label={copied ? t('portal:pay.copied') : t('portal:pay.copy')}
        icon={copied ? <Check className="h-icon-md w-icon-md" aria-hidden="true" /> : <Copy className="h-icon-md w-icon-md" aria-hidden="true" />}
        onClick={copy}
      />
    </div>
  );
}

interface FormState {
  item_type: ItemType | '';
  item_id: string;
  method: ExternalMethod | '';
  amount: string;
  reference_no: string;
  proof: File | null;
}

const EMPTY_FORM: FormState = { item_type: '', item_id: '', method: '', amount: '', reference_no: '', proof: null };

/** R19–R23, R52: Portal / Pay Rent. */
export function PortalPayPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const language = useAppSelector(selectLanguage);
  const profile = useAppSelector(selectProfile);
  const [params] = useSearchParams();

  const accounts = useGetMyPaymentAccountsQuery();
  const charges = useGetMyChargesQuery();
  const bills = useGetMyBillsQuery();
  const [submitPayment, { isLoading: isSubmitting }] = useSubmitPaymentMutation();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<PayResult | null>(null);

  const items: OpenItem[] = useMemo(() => {
    const openCharges = (charges.data ?? []).filter((c) => c.status !== 'paid').map((c) => ({ ...c, key: `charge:${c.id}` }));
    const openShares = (bills.data ?? []).filter((s) => s.status !== 'paid').map((s) => ({ ...s, key: `bill_share:${s.id}` }));
    return [...openCharges, ...openShares];
  }, [charges.data, bills.data]);

  // Preselect from ?item=<type>:<id> (SC-24, from Bills' Pay button); default the amount to the remaining balance.
  useEffect(() => {
    if (form.item_id || items.length === 0) return;
    const preselect = params.get('item');
    const match = preselect ? items.find((i) => i.key === preselect) : undefined;
    const initial = match ?? items[0];
    setForm((f) => ({ ...f, item_type: initial.item.type, item_id: initial.id, amount: String(initial.remaining) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, params]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSelectItem(key: string) {
    const item = items.find((i) => i.key === key);
    if (!item) return;
    setForm((f) => ({ ...f, item_type: item.item.type, item_id: item.id, amount: String(item.remaining) }));
  }

  const selectedItem = items.find((i) => i.id === form.item_id && i.item.type === form.item_type);
  const amountNumber = Number(form.amount);
  const excess = selectedItem && Number.isFinite(amountNumber) && amountNumber > selectedItem.remaining ? amountNumber - selectedItem.remaining : 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return; // E1: block a double submit
    const parsed = paymentUploadSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      const payResult = await submitPayment(parsed.data).unwrap();
      setResult(payResult);
      setForm(EMPTY_FORM);
    } catch (error) {
      if (isApiError(error) && error.code === 'VALIDATION_ERROR') {
        setErrors(fieldErrors(error));
        return;
      }
      if (isApiError(error) && error.code === 'ITEM_ALREADY_PAID') {
        setFormError(t('errors:ITEM_ALREADY_PAID'));
        void charges.refetch();
        void bills.refetch();
        return;
      }
      if (isApiError(error) && error.code === 'DUPLICATE_REFERENCE') {
        setFormError(t('errors:DUPLICATE_REFERENCE'));
        return;
      }
      toast.show('error', t('errors:UNKNOWN'));
    }
  }

  const isLoading = accounts.isLoading || charges.isLoading || bills.isLoading;
  const showSkeleton = useDelayedFlag(isLoading);
  const error = accounts.error || charges.error || bills.error;

  if (error && !isLoading) {
    return (
      <ErrorState
        message={t('portal:pay.errorLoading')}
        onRetry={() => {
          if (accounts.error) void accounts.refetch();
          if (charges.error) void charges.refetch();
          if (bills.error) void bills.refetch();
        }}
      />
    );
  }

  if (isLoading) {
    return showSkeleton ? (
      <div className="flex flex-col gap-4">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    ) : null;
  }

  const pageTitle = <h1 className="type-h1 text-primary max-sm:type-h2">{t('nav:pay')}</h1>;

  if (result) {
    const period = formatPeriod(result.payment.item.period, { language });
    const itemText =
      result.payment.item.type === 'charge'
        ? t('domain:item.charge', { period })
        : t('domain:item.bill_share', { period, billType: result.payment.item.bill_type ? t(`domain:billTypeTitle.${result.payment.item.bill_type}`) : '' });
    const paidKey = result.item_status === 'paid' ? 'portal:pay.successPaid' : 'portal:pay.successPartial';
    const creditApplied = result.credit_applied.reduce((sum, a) => sum + a.amount, 0);
    return (
      <div className="flex flex-col gap-4">
        {pageTitle}
        <InlineAlert tone="success">{t(paidKey, { item: itemText, email: profile?.email })}</InlineAlert>
        {result.credit_added > 0 && creditApplied > 0 && (
          <InlineAlert tone="info">
            {t('portal:pay.successCreditApplied', {
              amount: formatPeso(result.credit_added, { language }),
              applied: formatPeso(creditApplied, { language }),
              item: itemText,
            })}
          </InlineAlert>
        )}
        {result.credit_added > 0 && creditApplied === 0 && (
          <InlineAlert tone="info">{t('portal:pay.successCreditOnly', { amount: formatPeso(result.credit_added, { language }) })}</InlineAlert>
        )}
        <Button variant="secondary" onClick={() => setResult(null)} className="w-fit">
          {t('common:close')}
        </Button>
      </div>
    );
  }

  const enabledAccounts = accounts.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {pageTitle}
      {enabledAccounts.length === 0 ? (
        <EmptyState title={t('portal:pay.noAccounts')} />
      ) : (
        <>
          <Card title={t('portal:pay.accountsTitle')} className="max-sm:p-4">
            <div className="flex flex-col divide-y">
              {enabledAccounts.map((a) => (
                <AccountCard key={a.method} account={a} />
              ))}
            </div>
          </Card>

          <Card title={t('portal:pay.submit')} className="max-sm:p-4">
            {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
            {items.length === 0 ? (
              <p className="py-6 text-center type-body-s text-secondary">{t('portal:home.itemsEmpty')}</p>
            ) : (
              <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
                <SelectField
                  label={t('portal:pay.item')}
                  placeholder={t('portal:pay.itemPlaceholder')}
                  value={selectedItem?.key ?? ''}
                  onChange={(e) => onSelectItem(e.target.value)}
                  options={items.map((i) => ({ value: i.key, label: itemLabel(i, t, language) }))}
                  error={errors.item_id ? t(errors.item_id) : undefined}
                  required
                />
                <SelectField
                  label={t('portal:pay.method')}
                  placeholder={t('portal:pay.methodPlaceholder')}
                  value={form.method}
                  onChange={(e) => set('method', e.target.value as ExternalMethod)}
                  options={METHODS.map((m) => ({ value: m, label: t(`domain:method.${m}`) }))}
                  error={errors.method ? t(errors.method) : undefined}
                  required
                />
                <TextField
                  label={t('portal:pay.amount')}
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.amount}
                  onChange={(e) => set('amount', e.target.value)}
                  error={errors.amount ? t(errors.amount) : undefined}
                  helper={excess > 0 ? t('portal:pay.excessHelper', { amount: formatPeso(excess, { language }) }) : undefined}
                  required
                />
                <TextField
                  label={t('portal:pay.reference')}
                  value={form.reference_no}
                  onChange={(e) => set('reference_no', e.target.value)}
                  error={errors.reference_no ? t(errors.reference_no) : undefined}
                  required
                />
                <FileUpload
                  label={t('portal:pay.screenshot')}
                  value={form.proof}
                  onChange={(file) => set('proof', file)}
                  error={errors.proof ? t(errors.proof) : undefined}
                  invalidKey="validation:screenshotInvalid"
                  required
                />
                <Button type="submit" loading={isSubmitting} loadingText={t('common:sending')} disabled={isSubmitting} className="w-full sm:w-fit">
                  {t('portal:pay.submit')}
                </Button>
              </form>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
