import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeleteRecurringExpenseMutation, useGetRecurringExpensesQuery, useSaveRecurringExpenseMutation } from '../../../services/endpoints/admin';
import { fieldErrors } from '../../../services/errors';
import { useFormat } from '../../../hooks/useFormat';
import { periodOf } from '../../../lib/time';
import { EXPENSE_CATEGORIES, type RecurringExpense } from '../../../types/api';
import { recurringExpenseSchema } from '../../../validation/admin';
import { toFieldErrors } from '../../../validation/common';
import { Button } from '../../../ui/Button';
import { Switch } from '../../../ui/Checkbox';
import { ConfirmDelete } from '../../../ui/ConfirmDialog';
import { IconButton } from '../../../ui/IconButton';
import { InlineAlert } from '../../../ui/InlineAlert';
import { Modal } from '../../../ui/Modal';
import { Skeleton } from '../../../ui/Skeleton';
import { EMPTY_FRAME, Table, TableCell, TableHeaderCell } from '../../../ui/Table';
import { SelectField, TextareaField, TextField } from '../../../ui/TextField';
import { useToast } from '../../../ui/ToastProvider';
import { Pencil, Trash2 } from '../../../ui/icons';
import { fixedPerMonth } from './metrics';

const month = (period: string | null) => (period ? period.slice(0, 7) : '');

/**
 * Recurring tab of the Expenses card (Bernie, 2026-10-14): fixed monthly costs (condo dues, internet, Netflix). Each active
 * template posts one expense per month on its due day; editing changes future months only; pausing stops posting.
 */
export function RecurringExpensesPanel({ editing, setEditing }: { editing: RecurringExpense | null | undefined; setEditing: (r: RecurringExpense | null | undefined) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const { data, isLoading } = useGetRecurringExpensesQuery();
  const [save] = useSaveRecurringExpenseMutation();
  const [remove, { isLoading: isDeleting }] = useDeleteRecurringExpenseMutation();
  const [deleting, setDeleting] = useState<RecurringExpense | null>(null);
  const templates = data ?? [];
  const fixed = fixedPerMonth(templates, periodOf());

  async function toggle(r: RecurringExpense) {
    try {
      await save({ ...r, active: !r.active, note: r.note ?? undefined }).unwrap();
      toast.show('success', r.active ? t('admin:recurring.pausedToast', { name: r.name }) : t('admin:recurring.resumed', { name: r.name }));
    } catch {
      toast.show('error', t('errors:UNKNOWN'));
    }
  }

  async function onDelete() {
    if (!deleting) return;
    try {
      await remove(deleting.id).unwrap();
      toast.show('success', t('admin:recurring.deleted'));
      setDeleting(null);
    } catch {
      toast.show('error', t('errors:UNKNOWN'));
    }
  }

  return (
    <>
      {templates.length > 0 && (
        <p className="type-body-s text-secondary">
          <span className="type-amount-m text-primary">{f.peso(fixed.total)}</span> {t('admin:recurring.totalLine', { count: fixed.count })}
        </p>
      )}
      {isLoading ? (
        <div className={EMPTY_FRAME}>
          <Skeleton variant="row" />
        </div>
      ) : templates.length === 0 ? (
        <div className={EMPTY_FRAME}>
          <p className="type-body-s text-secondary">{t('admin:recurring.empty')}</p>
        </div>
      ) : (
        <Table scrollLabel={t('admin:dashboard.scrollable', { name: t('admin:expenses.tabRecurring') })}>
          <caption className="sr-only">{t('admin:expenses.tabRecurring')}</caption>
          <thead>
            <tr>
              <TableHeaderCell>{t('admin:recurring.col.name')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:recurring.col.due')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:recurring.col.months')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('admin:recurring.col.amount')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:recurring.col.active')}</TableHeaderCell>
              <TableHeaderCell>
                <span className="sr-only">{t('admin:recurring.editTitle')}</span>
              </TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {templates.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'opacity-70'}>
                <TableCell>
                  <span className="type-body-s-strong text-primary">{r.name}</span>
                  <span className="block type-caption text-tertiary">{t(`admin:expenses.categories.${r.category}`)}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">{t('admin:recurring.dueDayValue', { day: f.dueDay(r.due_day) })}</TableCell>
                <TableCell variant="muted" className="whitespace-nowrap">
                  {r.ends_on ? t('admin:recurring.fromTo', { from: f.period(r.starts_on), to: f.period(r.ends_on) }) : t('admin:recurring.fromMonth', { from: f.period(r.starts_on) })}
                </TableCell>
                <TableCell variant="strong" className="text-right">
                  {f.peso(r.amount)}
                </TableCell>
                <TableCell>
                  <Switch id={`rec-active-${r.id}`} label="" aria-label={t('admin:recurring.activeLabel', { name: r.name })} checked={r.active} onChange={() => void toggle(r)} />
                </TableCell>
                <TableCell variant="actions">
                  <div className="flex justify-end gap-1">
                    <IconButton label={t('admin:recurring.edit', { name: r.name })} icon={<Pencil className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setEditing(r)} />
                    <IconButton label={t('admin:recurring.delete', { name: r.name })} icon={<Trash2 className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setDeleting(r)} />
                  </div>
                </TableCell>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ConfirmDelete item={deleting?.name ?? null} detail={t('admin:recurring.deleteDetail')} busy={isDeleting} onCancel={() => setDeleting(null)} onConfirm={() => void onDelete()} />
      {editing !== undefined && <RecurringModal key={editing?.id ?? 'new'} editing={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}

/** Add/Edit a template. Months use the native month picker; the amount can change any time (future months only). */
function RecurringModal({ editing, onClose }: { editing: RecurringExpense | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [save, { isLoading }] = useSaveRecurringExpenseMutation();
  const [form, setForm] = useState({
    name: editing?.name ?? '',
    category: editing?.category ?? '',
    amount: editing ? String(editing.amount) : '',
    due_day: editing ? String(editing.due_day) : '',
    starts_on: month(editing?.starts_on ?? periodOf()),
    ends_on: month(editing?.ends_on ?? null),
    active: editing?.active ?? true,
    note: editing?.note ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((v) => ({ ...v, [key]: value }));
  const err = (key: string) => (errors[key] ? t(errors[key]) : undefined);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    const parsed = recurringExpenseSchema.safeParse({
      ...form,
      starts_on: form.starts_on ? `${form.starts_on}-01` : '',
      ends_on: form.ends_on ? `${form.ends_on}-01` : '',
    });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await save({ id: editing?.id, ...parsed.data }).unwrap();
      toast.show('success', t('admin:recurring.saved'));
      onClose();
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      else setFormError(t('errors:UNKNOWN'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('admin:recurring.editTitle') : t('admin:recurring.addTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="recurring-form" loading={isLoading} loadingText={t('common:saving')}>
            {t('common:save')}
          </Button>
        </>
      }
    >
      <form id="recurring-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
        <TextField label={t('admin:recurring.field.name')} placeholder={t('admin:recurring.field.namePlaceholder')} maxLength={120} value={form.name} onChange={(e) => set('name', e.target.value)} error={err('name')} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('admin:expenses.category')}
            placeholder={t('admin:expenses.categoryPlaceholder')}
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`admin:expenses.categories.${c}`) }))}
            error={err('category')}
            required
          />
          <TextField
            label={t('admin:recurring.field.amount')}
            helper={editing ? t('admin:recurring.field.amountHelper') : undefined}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            error={err('amount')}
            required
          />
        </div>
        <TextField
          label={t('admin:recurring.field.dueDay')}
          helper={t('admin:recurring.field.dueDayHelper')}
          type="number"
          inputMode="numeric"
          min="1"
          max="31"
          value={form.due_day}
          onChange={(e) => set('due_day', e.target.value)}
          error={err('due_day')}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('admin:recurring.field.startsOn')} type="month" value={form.starts_on} onChange={(e) => set('starts_on', e.target.value)} error={err('starts_on')} required />
          <TextField label={t('admin:recurring.field.endsOn')} helper={t('admin:recurring.field.endsOnHelper')} type="month" min={form.starts_on || undefined} value={form.ends_on} onChange={(e) => set('ends_on', e.target.value)} error={err('ends_on')} />
        </div>
        <Switch id="recurring-active" label={t('admin:recurring.field.active')} checked={form.active} onChange={(e) => set('active', e.target.checked)} />
        <TextareaField label={t('admin:recurring.field.note')} rows={2} maxLength={500} value={form.note} onChange={(e) => set('note', e.target.value)} error={err('note')} />
      </form>
    </Modal>
  );
}
