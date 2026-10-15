import { useState } from 'react';
import { ConfirmDelete } from '../../../ui/ConfirmDialog';
import { Pagination, usePaged } from '../../../ui/Pagination';
import { useTranslation } from 'react-i18next';
import { useCreateExpenseMutation, useDeleteExpenseMutation, useGetExpensesQuery, useGetRecurringExpensesQuery, useSaveRecurringExpenseMutation, useUpdateExpenseMutation } from '../../../services/endpoints/admin';
import { Switch } from '../../../ui/Checkbox';
import { recurringDueDate } from '../../../lib/recurring';
import { StatusBadge } from '../../../ui/StatusBadge';
import { Tabs } from '../../../ui/Tabs';
import { RecurringExpensesPanel } from './RecurringExpenses';
import { fieldErrors } from '../../../services/errors';
import { useFormat } from '../../../hooks/useFormat';
import { manilaToday } from '../../../lib/time';
import { expenseSchema, recurringExpenseSchema } from '../../../validation/admin';
import { toFieldErrors } from '../../../validation/common';
import { EXPENSE_CATEGORIES, type Expense, type RecurringExpense } from '../../../types/api';
import { Button } from '../../../ui/Button';
import { IconButton } from '../../../ui/IconButton';
import { InlineAlert } from '../../../ui/InlineAlert';
import { Modal } from '../../../ui/Modal';
import { Skeleton } from '../../../ui/Skeleton';
import { EMPTY_FRAME, Table, TableCell, TableHeaderCell } from '../../../ui/Table';
import { SelectField, TextareaField, TextField } from '../../../ui/TextField';
import { useToast } from '../../../ui/ToastProvider';
import { Pencil, Plus, Repeat, Trash2 } from '../../../ui/icons';
import { sumPesos } from './metrics';
import { Card } from './Card';

const EMPTY = { spent_on: '', category: '', description: '', amount: '', note: '' };

/**
 * Expenses card with two tabs (2026-10-14): "This period" (date, description with a Recurring badge for posted entries,
 * category, amount, period total, Add/Edit/Delete) and "Recurring" (the monthly templates). Tabs keep the dashboard's
 * equal-height row instead of adding another card.
 */
export function ExpensesCard({ from, to, className = '' }: { from: string; to: string; className?: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const { data, isLoading, isFetching, isError, refetch } = useGetExpensesQuery({ from, to });
  const [deleteExpense] = useDeleteExpenseMutation();
  const [tab, setTab] = useState<'period' | 'recurring'>('period');
  const [open, setOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const total = sumPesos((data ?? []).map((e) => e.amount));
  const paged = usePaged(data ?? [], 10, [from, to]);

  async function onDelete(e: Expense) {
    try {
      await deleteExpense(e.id).unwrap();
      setDeleting(null);
      toast.show('success', t('admin:expenses.deleted'));
    } catch {
      toast.show('error', t('errors:UNKNOWN'));
    }
  }

  return (
    <Card
      className={className}
      title={t('admin:expenses.title')}
      hint={t('admin:expenses.hint')}
      action={
        tab === 'period' ? (
          <Button variant="secondary" iconLeft={<Plus className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setOpen(true)}>
            {t('admin:expenses.add')}
          </Button>
        ) : (
          <Button variant="secondary" iconLeft={<Plus className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setEditingRecurring(null)}>
            {t('admin:recurring.add')}
          </Button>
        )
      }
    >
      <Tabs
        label={t('admin:expenses.tabs')}
        items={[
          { value: 'period', label: t('admin:expenses.tabPeriod') },
          { value: 'recurring', label: t('admin:expenses.tabRecurring') },
        ]}
        value={tab}
        onChange={setTab}
        className="-mt-2"
      />
      {tab === 'recurring' ? (
        <RecurringExpensesPanel editing={editingRecurring} setEditing={setEditingRecurring} />
      ) : (
      <>
      {!!data?.length && (
        <p className="type-body-s text-secondary">
          <span className="type-amount-m text-primary">{f.peso(total)}</span> {t('admin:expenses.totalLine', { count: data.length })}
        </p>
      )}
      {isLoading ? (
        <div className={EMPTY_FRAME}>
          <Skeleton variant="row" />
        </div>
      ) : isError ? (
        <InlineAlert tone="error">
          {t('admin:expenses.errorLoading')}{' '}
          <button type="button" className="underline" onClick={() => void refetch()}>
            {t('common:retry')}
          </button>
        </InlineAlert>
      ) : !data?.length ? (
        <div className={EMPTY_FRAME}>
          <p className="type-body-s text-secondary">{t('admin:expenses.empty')}</p>
        </div>
      ) : (
        <Table className={isFetching ? 'opacity-60' : ''} scrollLabel={t('admin:dashboard.scrollable', { name: t('admin:expenses.title') })}>
          <caption className="sr-only">{t('admin:expenses.title')}</caption>
          <thead>
            <tr>
              <TableHeaderCell>{t('admin:expenses.date')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:expenses.description')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:expenses.category')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('admin:expenses.amount')}</TableHeaderCell>
              <TableHeaderCell>
                <span className="sr-only">{t('admin:beds.delete')}</span>
              </TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((e) => (
              <tr key={e.id}>
                <TableCell variant="muted" className="whitespace-nowrap">
                  {f.date(e.spent_on)}
                </TableCell>
                <TableCell>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {e.description}
                    {e.recurring_id && (
                      <StatusBadge tone="info" icon={<Repeat className="h-3 w-3" aria-hidden="true" />}>
                        {t('admin:expenses.recurringBadge')}
                      </StatusBadge>
                    )}
                  </span>
                  {e.note && <span className="block type-caption text-tertiary">{e.note}</span>}
                </TableCell>
                <TableCell variant="muted">{t(`admin:expenses.categories.${e.category}`)}</TableCell>
                <TableCell variant="strong" className="text-right">
                  {f.peso(e.amount)}
                </TableCell>
                <TableCell variant="actions">
                  <div className="flex justify-end gap-1">
                    <IconButton label={t('admin:expenses.edit', { description: e.description })} icon={<Pencil className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setEditingExpense(e)} />
                    <IconButton
                      label={t('admin:expenses.delete', { description: e.description })}
                      icon={<Trash2 className="h-icon-sm w-icon-sm" aria-hidden="true" />}
                      onClick={() => setDeleting(e)}
                    />
                  </div>
                </TableCell>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('admin:expenses.title') })} />
      </>
      )}
      <ConfirmDelete item={deleting?.description ?? null} onCancel={() => setDeleting(null)} onConfirm={() => deleting && void onDelete(deleting)} />
      {open && <ExpenseModal onClose={() => setOpen(false)} onRecurringAdded={() => setTab('recurring')} />}
      {editingExpense && <ExpenseModal key={editingExpense.id} editing={editingExpense} onClose={() => setEditingExpense(null)} />}
    </Card>
  );
}

/** Add or edit an expense: date (not in the future), category, description, amount, optional note. Editing a posted
 * recurring entry changes only that entry, never its template. */
export function ExpenseModal({ onClose, editing, onRecurringAdded }: { onClose: () => void; editing?: Expense; onRecurringAdded?: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [createExpense, { isLoading: isCreating }] = useCreateExpenseMutation();
  const [updateExpense, { isLoading: isUpdating }] = useUpdateExpenseMutation();
  const [saveRecurring, { isLoading: isSavingRecurring }] = useSaveRecurringExpenseMutation();
  const isLoading = isCreating || isUpdating || isSavingRecurring;
  const f = useFormat();
  const { data: templates } = useGetRecurringExpensesQuery(undefined, { skip: !editing?.recurring_id });
  const template = templates?.find((r) => r.id === editing?.recurring_id);
  // "Recurring (monthly)": the Date's day becomes the due day and its month the start month (add mode only).
  const [recurring, setRecurring] = useState(false);
  const [endsOn, setEndsOn] = useState('');
  const [form, setForm] = useState(() =>
    editing
      ? { spent_on: editing.spent_on, category: editing.category, description: editing.description, amount: String(editing.amount), note: editing.note ?? '' }
      : { ...EMPTY, spent_on: manilaToday() },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = (key: keyof typeof EMPTY, value: string) => setForm((v) => ({ ...v, [key]: value }));
  const err = (key: string) => (errors[key] ? t(errors[key]) : undefined);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    // A recurring expense may start in the future (its first entry posts on that date), so the date check is relaxed then.
    const parsed = (recurring ? expenseSchema(() => '9999-12-31') : expenseSchema()).safeParse(form);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    if (recurring) {
      const { spent_on, description, ...rest } = parsed.data;
      const tpl = recurringExpenseSchema.safeParse({ ...rest, name: description, due_day: Number(spent_on.slice(8, 10)), starts_on: `${spent_on.slice(0, 7)}-01`, ends_on: endsOn ? `${endsOn}-01` : '', active: true });
      if (!tpl.success) {
        const fe = toFieldErrors(tpl.error);
        setErrors({ ...(fe.ends_on ? { ends_on: fe.ends_on } : {}), ...(fe.name ? { description: fe.name } : {}) });
        if (!fe.ends_on && !fe.name) setFormError(t('errors:UNKNOWN'));
        return;
      }
      setErrors({});
      setFormError(null);
      try {
        // One template; the posting job (watermark, BR-16) creates this month's entry once its date has come. No duplicates.
        await saveRecurring(tpl.data).unwrap();
        toast.show('success', t('admin:expenses.recurringAdded', { name: description, day: f.dueDay(tpl.data.due_day) }), onRecurringAdded ? { label: t('admin:expenses.viewRecurring'), onClick: onRecurringAdded } : undefined);
        onClose();
      } catch (error) {
        const fields = fieldErrors(error);
        if (Object.keys(fields).length) setErrors(fields);
        else setFormError(t('errors:UNKNOWN'));
      }
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      if (editing) await updateExpense({ id: editing.id, ...parsed.data }).unwrap();
      else await createExpense(parsed.data).unwrap();
      toast.show('success', editing ? t('admin:expenses.savedEdit') : t('admin:expenses.saved'));
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
      title={editing ? t('admin:expenses.editTitle') : t('admin:expenses.addTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="add-expense-form" loading={isLoading} loadingText={t('common:saving')}>
            {t('common:save')}
          </Button>
        </>
      }
    >
      <form id="add-expense-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
        {editing?.recurring_id && <InlineAlert tone="info">{t('admin:expenses.partOf', { name: template?.name ?? editing.description })}</InlineAlert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('admin:expenses.date')} type="date" max={recurring ? undefined : manilaToday()} value={form.spent_on} onChange={(e) => set('spent_on', e.target.value)} error={err('spent_on')} required />
          <SelectField
            label={t('admin:expenses.category')}
            placeholder={t('admin:expenses.categoryPlaceholder')}
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`admin:expenses.categories.${c}`) }))}
            error={err('category')}
            required
          />
        </div>
        <TextField
          label={t('admin:expenses.description')}
          placeholder={t('admin:expenses.descriptionPlaceholder')}
          value={form.description}
          maxLength={120}
          onChange={(e) => set('description', e.target.value)}
          error={err('description')}
          required
        />
        <TextField label={t('admin:expenses.amount')} type="number" inputMode="decimal" step="0.01" min="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} error={err('amount')} required />
        <TextareaField label={t('admin:expenses.note')} helper={t('admin:expenses.noteHelper')} rows={3} maxLength={500} value={form.note} onChange={(e) => set('note', e.target.value)} error={err('note')} />
        {!editing && (
          <div className="flex flex-col gap-3 rounded-md border p-4">
            <Switch id="expense-recurring" label={t('admin:expenses.recurringSwitch')} checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            {recurring && <RecurringHint date={form.spent_on} />}
            {recurring && (
              <TextField
                label={t('admin:recurring.field.endsOn')}
                helper={t('admin:recurring.field.endsOnHelper')}
                type="month"
                min={form.spent_on.slice(0, 7) || undefined}
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                error={err('ends_on')}
              />
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

/** Read-only summary of what the switch will do, derived from the Date (day-31 clamp noted). */
function RecurringHint({ date }: { date: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return <p className="type-body-s text-secondary">{t('admin:expenses.pickDate')}</p>;
  const day = Number(date.slice(8, 10));
  const first = recurringDueDate(day, `${date.slice(0, 7)}-01`);
  return (
    <div className="flex flex-col gap-1 type-body-s" aria-live="polite">
      <p className="type-body-s-strong text-primary">{t('admin:expenses.repeatsEvery', { day: f.dueDay(day) })}</p>
      {day > 28 && <p className="text-secondary">{t('admin:recurring.field.dueDayHelper')}</p>}
      <p className="text-secondary">{first > manilaToday() ? t('admin:expenses.firstPostsOn', { date: f.date(first) }) : t('admin:expenses.firstPostsNow', { date: f.date(first) })}</p>
    </div>
  );
}
