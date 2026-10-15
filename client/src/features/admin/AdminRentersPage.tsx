import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Avatar } from '../../ui/Avatar';
import { IconButton } from '../../ui/IconButton';
import { RenterDetails } from './RenterDetails';
import { AssignBedModal } from '../shared/AssignBedModal';
import { Pagination, usePaged } from '../../ui/Pagination';
import { useTranslation } from 'react-i18next';
import {
  useCreateRenterMutation,
  useGetBedsQuery,
  useGetMoveOutPreviewQuery,
  useGetRenterCreditQuery,
  useGetRentersQuery,
  useMoveOutMutation,
  useRecordRefundMutation,
  useResendInviteMutation,
  useUpdateRenterMutation,
} from '../../services/endpoints/admin';
import type { AdminMethod, Language, RenterRow } from '../../types/api';
import { editRenterSchema, addRenterSchema, moveOutSchema } from '../../validation/admin';
import { refundSchema } from '../../validation/payments';
import { toFieldErrors } from '../../validation/common';
import { isApiError, fieldErrors } from '../../services/errors';
import { formatPeso, formatDueDay } from '../../lib/format';
import { manilaToday } from '../../lib/time';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../../features/ui/uiSlice';
import { CreditLedgerList } from '../shared/CreditLedgerList';
import { Button } from '../../ui/Button';
import { StatusBadge } from '../../ui/StatusBadge';
import { Modal } from '../../ui/Modal';
import { TextField, SelectField } from '../../ui/TextField';
import { Table, TableHeaderCell, TableCell } from '../../ui/Table';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { InlineAlert } from '../../ui/InlineAlert';
import { Users, Plus, Pencil } from '../../ui/icons';
import { useToast } from '../../ui/ToastProvider';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const REFUND_METHODS: AdminMethod[] = ['cash', 'gcash', 'maya', 'bpi'];
const STATUS_FILTERS = ['all', 'active', 'invite_pending', 'moved_out'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

interface AddFormState {
  full_name: string;
  email: string;
  phone: string;
  language: Language;
  bed_id: string;
  move_in: string;
  deposit: string;
  birthday: string;
}

const EMPTY_ADD: AddFormState = { full_name: '', email: '', phone: '', language: 'en', bed_id: '', move_in: '', deposit: '', birthday: '' };

interface EditFormState {
  full_name: string;
  phone: string;
  language: Language;
  birthday: string;
}

function renterToEditForm(renter: RenterRow): EditFormState {
  return { full_name: renter.full_name, phone: renter.phone, language: renter.language, birthday: renter.birthday ?? '' };
}

/**
 * R30–R32, R51: renters (redesigned 2026-10-14: summary strip, search + status/room filters, avatar table) with the
 * Add/Edit, invite, assign, move-out, credit and refund modals. /admin/renters/:id shows RenterDetails with the same modals.
 */
export function AdminRentersPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const language = useAppSelector(selectLanguage);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: renters, isLoading, error, refetch } = useGetRentersQuery(debouncedSearch ? { search: debouncedSearch } : undefined); // no search = same cache entry as `everyone` (one request)
  const { data: beds } = useGetBedsQuery();
  const { data: everyone } = useGetRentersQuery();
  const { id: detailId } = useParams();
  const [params, setParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [createRenter, { isLoading: isCreating }] = useCreateRenterMutation();
  const [updateRenter, { isLoading: isUpdating }] = useUpdateRenterMutation();
  const [resendInvite, { isLoading: isResending }] = useResendInviteMutation();
  const showSkeleton = useDelayedFlag(isLoading);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(EMPTY_ADD);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [addFormError, setAddFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<RenterRow | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ full_name: '', phone: '', language: 'en', birthday: '' });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editFormError, setEditFormError] = useState<string | null>(null);

  const availableBeds = useMemo(() => (beds ?? []).filter((b) => b.status === 'vacant' || b.status === 'reserved'), [beds]);
  const selectedBed = availableBeds.find((b) => b.id === addForm.bed_id);
  const dueDay = addForm.move_in && /^\d{4}-\d{2}-\d{2}$/.test(addForm.move_in) ? Number(addForm.move_in.slice(8, 10)) : null;

  function openAdd() {
    setAddForm(EMPTY_ADD);
    setAddErrors({});
    setAddFormError(null);
    setAddOpen(true);
  }

  function setAdd<K extends keyof AddFormState>(key: K, value: AddFormState[K]) {
    setAddForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (isCreating) return;
    const parsed = addRenterSchema().safeParse(addForm);
    if (!parsed.success) {
      setAddErrors(toFieldErrors(parsed.error));
      return;
    }
    setAddErrors({});
    setAddFormError(null);
    try {
      const result = await createRenter(parsed.data).unwrap();
      toast.show('success', result.invite_sent ? t('admin:renters.savedAdd') : t('admin:renters.savedAddInviteFailed'));
      setAddOpen(false);
    } catch (err) {
      if (isApiError(err) && err.code === 'VALIDATION_ERROR') {
        setAddErrors(fieldErrors(err));
        return;
      }
      if (isApiError(err) && err.code === 'EMAIL_EXISTS') {
        setAddFormError(t('errors:EMAIL_EXISTS'));
        return;
      }
      if (isApiError(err) && err.code === 'BED_TAKEN') {
        setAddFormError(t('errors:BED_TAKEN'));
        return;
      }
      setAddFormError(t('errors:UNKNOWN'));
    }
  }

  function openEdit(renter: RenterRow) {
    setEditing(renter);
    setEditForm(renterToEditForm(renter));
    setEditErrors({});
    setEditFormError(null);
  }

  function setEdit<K extends keyof EditFormState>(key: K, value: EditFormState[K]) {
    setEditForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (isUpdating || !editing) return;
    const parsed = editRenterSchema.safeParse(editForm);
    if (!parsed.success) {
      setEditErrors(toFieldErrors(parsed.error));
      return;
    }
    setEditErrors({});
    setEditFormError(null);
    try {
      await updateRenter({ id: editing.id, ...parsed.data }).unwrap();
      toast.show('success', t('admin:renters.savedEdit'));
      setEditing(null);
    } catch (err) {
      if (isApiError(err) && err.code === 'VALIDATION_ERROR') {
        setEditErrors(fieldErrors(err));
        return;
      }
      setEditFormError(t('errors:UNKNOWN'));
    }
  }

  // ----- Assign bed (F15, R33) -----
  const [assigning, setAssigning] = useState<RenterRow | null>(null);
  function openAssign(renter: RenterRow) {
    setAssigning(renter);
  }

  // ----- Move out (F15, R34) -----
  const [movingOut, setMovingOut] = useState<RenterRow | null>(null);
  const [moveOutDate, setMoveOutDate] = useState('');
  const [moveOutError, setMoveOutError] = useState<string | null>(null);
  const [moveOutFormError, setMoveOutFormError] = useState<string | null>(null);
  const tenancyId = movingOut?.tenancy?.id;
  const preview = useGetMoveOutPreviewQuery(tenancyId ?? '', { skip: !tenancyId });
  const [moveOut, { isLoading: isMovingOut }] = useMoveOutMutation();

  function openMoveOut(renter: RenterRow) {
    setMovingOut(renter);
    setMoveOutDate(manilaToday());
    setMoveOutError(null);
    setMoveOutFormError(null);
  }

  async function onSubmitMoveOut(e: React.FormEvent) {
    e.preventDefault();
    if (isMovingOut || !movingOut?.tenancy) return;
    const parsed = moveOutSchema(movingOut.tenancy.move_in, manilaToday()).safeParse({ move_out: moveOutDate });
    if (!parsed.success) {
      setMoveOutError(t(parsed.error.issues[0].message));
      return;
    }
    setMoveOutError(null);
    setMoveOutFormError(null);
    try {
      await moveOut({ tenancyId: movingOut.tenancy.id, move_out: parsed.data.move_out }).unwrap();
      toast.show('success', t('admin:moveOut.saved', { name: movingOut.full_name }));
      setMovingOut(null);
    } catch (err) {
      if (isApiError(err) && (err.code === 'MOVE_OUT_BEFORE_MOVE_IN' || err.code === 'MOVE_OUT_IN_FUTURE')) {
        setMoveOutError(t(`errors:${err.code}`));
        return;
      }
      setMoveOutFormError(t('errors:UNKNOWN'));
    }
  }

  // ----- Credit ledger panel + refund (F15, R55, R57) -----
  const [viewingCredit, setViewingCredit] = useState<RenterRow | null>(null);
  const credit = useGetRenterCreditQuery(viewingCredit?.id ?? '', { skip: !viewingCredit });

  const [refunding, setRefunding] = useState(false);
  const [refundForm, setRefundForm] = useState({ amount: '', method: 'cash' as AdminMethod, reference_no: '', refunded_at: '', note: '' });
  const [refundErrors, setRefundErrors] = useState<Record<string, string>>({});
  const [refundFormError, setRefundFormError] = useState<string | null>(null);
  const [recordRefund, { isLoading: isRefunding }] = useRecordRefundMutation();

  function openCredit(renter: RenterRow) {
    setViewingCredit(renter);
  }

  function openRefund() {
    setRefundForm({ amount: '', method: 'cash', reference_no: '', refunded_at: manilaToday(), note: '' });
    setRefundErrors({});
    setRefundFormError(null);
    setRefunding(true);
  }

  async function onSubmitRefund(e: React.FormEvent) {
    e.preventDefault();
    if (isRefunding || !viewingCredit) return;
    const balance = credit.data?.balance ?? 0;
    const parsed = refundSchema(balance).safeParse(refundForm);
    if (!parsed.success) {
      setRefundErrors(toFieldErrors(parsed.error));
      return;
    }
    setRefundErrors({});
    setRefundFormError(null);
    try {
      await recordRefund({ renterId: viewingCredit.id, ...parsed.data }).unwrap();
      toast.show('success', t('admin:refund.saved'));
      setRefunding(false);
    } catch (err) {
      if (isApiError(err) && err.code === 'VALIDATION_ERROR') {
        setRefundErrors(fieldErrors(err));
        return;
      }
      if (isApiError(err) && err.code === 'REFUND_EXCEEDS_CREDIT') {
        setRefundFormError(err.message);
        return;
      }
      setRefundFormError(t('errors:UNKNOWN'));
    }
  }

  async function onResend(renter: RenterRow) {
    try {
      await resendInvite(renter.id).unwrap();
      toast.show('success', t('admin:renters.inviteSent', { email: renter.email }));
    } catch (err) {
      toast.show('error', isApiError(err) && err.code === 'ALREADY_ACTIVATED' ? t('errors:ALREADY_ACTIVATED') : t('errors:UNKNOWN'));
    }
  }

  const filtered = (renters ?? []).filter(
    (r) =>
      (statusFilter === 'all' || (statusFilter === 'invite_pending' ? r.invite_pending : r.status === statusFilter)) &&
      (roomFilter === 'all' || r.tenancy?.bed.room === roomFilter),
  );
  const paged = usePaged(filtered, 10, [debouncedSearch, statusFilter, roomFilter]);
  const rooms = [...new Set((beds ?? []).map((b) => b.room))].sort();
  const all = everyone ?? [];
  const summary = {
    active: all.filter((r) => r.status === 'active').length,
    pending: all.filter((r) => r.invite_pending).length,
    movedOut: all.filter((r) => r.status === 'moved_out').length,
    outstanding: all.reduce((sum, r) => sum + Math.round(r.outstanding * 100), 0) / 100,
  };
  const detail = detailId ? all.find((r) => r.id === detailId) : undefined;

  // Beds page "Assign": /admin/renters?add=1&bed=<id> opens Add renter with that bed chosen.
  const addBed = params.get('add') === '1' ? (params.get('bed') ?? '') : null;
  useEffect(() => {
    if (addBed === null) return;
    setAddForm({ ...EMPTY_ADD, bed_id: addBed });
    setAddErrors({});
    setAddFormError(null);
    setAddOpen(true);
    setParams({}, { replace: true });
  }, [addBed, setParams]);

  if (error && !isLoading) {
    return <ErrorState message={t('admin:renters.errorLoading')} onRetry={() => void refetch()} />;
  }


  return (
    <div className="flex flex-col gap-4">
      {detailId ? (
        detail ? (
          <RenterDetails
            renter={detail}
            actions={{
              onEdit: () => openEdit(detail),
              onResend: () => void onResend(detail),
              onAssign: () => openAssign(detail),
              onMoveOut: () => openMoveOut(detail),
              onCredit: () => openCredit(detail),
              resending: isResending,
            }}
          />
        ) : everyone ? (
          <EmptyState icon={<Users className="h-icon-lg w-icon-lg text-tertiary" aria-hidden="true" />} title={t('admin:renterDetails.notFound')} action={<Link to="/admin/renters" className="type-label-s text-primary underline">{t('admin:renters.backToList')}</Link>} />
        ) : (
          <Skeleton variant="card" />
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="type-h2 text-primary">{t('admin:renters.title')}</h1>
            <Button iconLeft={<Plus className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={openAdd}>
              {t('admin:renters.add')}
            </Button>
          </div>

          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [t('admin:renters.summary.active'), String(summary.active)],
              [t('admin:renters.summary.pending'), String(summary.pending)],
              [t('admin:renters.summary.movedOut'), String(summary.movedOut)],
              [t('admin:renters.summary.outstanding'), formatPeso(summary.outstanding, { language })],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col-reverse gap-1 rounded-lg border bg-surface p-4 shadow-elevation-1">
                <dt className="type-label-s text-secondary">{label}</dt>
                <dd className="type-amount-m text-primary">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-end gap-3">
            <TextField
              label={t('admin:renters.searchLabel')}
              placeholder={t('admin:renters.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              containerClassName="w-full sm:max-w-xs"
            />
            <SelectField
              label={t('admin:renters.filterStatus')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              options={STATUS_FILTERS.map((v) => ({ value: v, label: t(`admin:renters.status.${v}`) }))}
              containerClassName="w-[calc(50%-0.375rem)] sm:w-44"
            />
            <SelectField
              label={t('admin:renters.filterRoom')}
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              options={[{ value: 'all', label: t('admin:renters.allRooms') }, ...rooms.map((r) => ({ value: r, label: r }))]}
              containerClassName="w-[calc(50%-0.375rem)] sm:w-40"
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
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="h-icon-lg w-icon-lg text-tertiary" aria-hidden="true" />}
              title={search || statusFilter !== 'all' || roomFilter !== 'all' ? t('admin:renters.emptySearch') : t('admin:renters.empty')}
            />
          ) : (
            <Table>
              <caption className="sr-only">{t('admin:renters.title')}</caption>
              <thead>
                <tr>
                  <TableHeaderCell>{t('admin:renters.columnName')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin:renters.columnBed')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin:renters.columnPhone')}</TableHeaderCell>
                  <TableHeaderCell className="text-right">{t('admin:renters.columnOutstanding')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin:renters.columnCredit')}</TableHeaderCell>
                  <TableHeaderCell>{t('admin:renters.columnStatus')}</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">{t('admin:renters.actions')}</span>
                  </TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((renter) => (
                  <tr key={renter.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span aria-hidden="true">
                          <Avatar name={renter.full_name} size="sm" />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <Link
                            to={`/admin/renters/${renter.id}`}
                            className="w-fit rounded-sm type-body-s-strong text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                          >
                            {renter.full_name}
                          </Link>
                          <span className="type-caption text-tertiary">{renter.email}</span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {renter.tenancy ? (
                        <>
                          {renter.tenancy.bed.room}
                          <span className="block whitespace-nowrap type-caption text-tertiary">{renter.tenancy.bed.label.replace(`${renter.tenancy.bed.room} – `, '')}</span>
                        </>
                      ) : (
                        <span className="text-tertiary">{t('admin:renters.noBed')}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{renter.phone}</TableCell>
                    <TableCell variant="strong" className="text-right">
                      {formatPeso(renter.outstanding, { language })}
                      {renter.unpaid_months > 0 && <span className="block type-caption font-normal text-danger">{t('admin:renters.monthsUnpaid', { count: renter.unpaid_months })}</span>}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => openCredit(renter)}
                        className={`inline-flex min-h-touch items-center min-w-touch justify-center underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${renter.credit_balance < 0 ? 'text-danger' : 'text-brand'}`}
                      >
                        {renter.credit_balance === 0 ? '—' : renter.credit_balance < 0 ? t('domain:owesLine', { amount: formatPeso(-renter.credit_balance, { language }) }) : formatPeso(renter.credit_balance, { language })}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge tone={renter.status === 'active' ? 'success' : 'neutral'}>
                          {renter.status === 'active' ? t('admin:renters.active') : t('admin:renters.movedOut')}
                        </StatusBadge>
                        {renter.invite_pending && <StatusBadge tone="warning">{t('admin:renters.invitePending')}</StatusBadge>}
                        {renter.status === 'moved_out' && renter.refund_due > 0 && (
                          <StatusBadge tone="info">{t('admin:renters.refundDue', { amount: formatPeso(renter.refund_due, { language }) })}</StatusBadge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell variant="actions">
                      <div className="flex items-center justify-end gap-1">
                        {renter.invite_pending && (
                          <Button variant="ghost" loading={isResending} onClick={() => onResend(renter)}>
                            {t('admin:renters.resendInvite')}
                          </Button>
                        )}
                        {renter.tenancy ? (
                          <Button variant="ghost" onClick={() => openMoveOut(renter)}>
                            {t('admin:renters.moveOut')}
                          </Button>
                        ) : (
                          <Button variant="ghost" onClick={() => openAssign(renter)}>
                            {t('admin:renters.assignBed')}
                          </Button>
                        )}
                        <IconButton label={t('admin:renters.edit')} title={t('admin:renters.editLabel', { name: renter.full_name })} icon={<Pencil className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => openEdit(renter)} />
                      </div>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('admin:renters.title') })} />
        </>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t('admin:renters.addTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" form="add-renter-form" loading={isCreating} loadingText={t('common:saving')} disabled={isCreating}>
              {t('common:save')}
            </Button>
          </>
        }
      >
        <form id="add-renter-form" onSubmit={onSubmitAdd} noValidate className="flex flex-col gap-4">
          {addFormError && <InlineAlert tone="error">{addFormError}</InlineAlert>}
          <TextField
            label={t('admin:renters.fullName')}
            value={addForm.full_name}
            onChange={(e) => setAdd('full_name', e.target.value)}
            error={addErrors.full_name ? t(addErrors.full_name) : undefined}
            required
          />
          <TextField
            label={t('admin:renters.email')}
            type="email"
            value={addForm.email}
            onChange={(e) => setAdd('email', e.target.value)}
            error={addErrors.email ? t(addErrors.email) : undefined}
            required
          />
          <TextField
            label={t('admin:renters.phone')}
            value={addForm.phone}
            onChange={(e) => setAdd('phone', e.target.value)}
            error={addErrors.phone ? t(addErrors.phone) : undefined}
            required
          />
          <SelectField
            label={t('admin:renters.language')}
            value={addForm.language}
            onChange={(e) => setAdd('language', e.target.value as Language)}
            options={[
              { value: 'en', label: t('common:language.enName') },
              { value: 'fil', label: t('common:language.filName') },
            ]}
            error={addErrors.language ? t(addErrors.language) : undefined}
            required
          />
          <SelectField
            label={t('admin:renters.bed')}
            placeholder={t('admin:renters.bedPlaceholder')}
            value={addForm.bed_id}
            onChange={(e) => setAdd('bed_id', e.target.value)}
            options={availableBeds.map((b) => ({ value: b.id, label: `${b.label} — ${formatPeso(b.monthly_rate, { language, whole: true })}` }))}
            error={addErrors.bed_id ? t(addErrors.bed_id) : undefined}
            required
          />
          <TextField
            label={t('admin:renters.moveIn')}
            type="date"
            value={addForm.move_in}
            onChange={(e) => setAdd('move_in', e.target.value)}
            error={addErrors.move_in ? t(addErrors.move_in) : undefined}
            helper={dueDay !== null ? t('admin:renters.dueDayHelper', { day: formatDueDay(dueDay, { language }) }) : undefined}
            required
          />
          <TextField
            label={t('admin:renters.deposit')}
            type="number"
            step="0.01"
            min="0"
            value={addForm.deposit}
            onChange={(e) => setAdd('deposit', e.target.value)}
            error={addErrors.deposit ? t(addErrors.deposit) : undefined}
          />
          <TextField
            label={t('admin:renters.birthday')}
            type="date"
            value={addForm.birthday}
            max={manilaToday()}
            onChange={(e) => setAdd('birthday', e.target.value)}
            error={addErrors.birthday ? t(addErrors.birthday) : undefined}
            helper={t('admin:renters.birthdayHelper')}
          />
          {selectedBed?.current_renter && <InlineAlert tone="warning">{t('errors:BED_TAKEN')}</InlineAlert>}
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={t('admin:renters.editTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" form="edit-renter-form" loading={isUpdating} loadingText={t('common:saving')} disabled={isUpdating}>
              {t('common:save')}
            </Button>
          </>
        }
      >
        <form id="edit-renter-form" onSubmit={onSubmitEdit} noValidate className="flex flex-col gap-4">
          {editFormError && <InlineAlert tone="error">{editFormError}</InlineAlert>}
          <TextField
            label={t('admin:renters.fullName')}
            value={editForm.full_name}
            onChange={(e) => setEdit('full_name', e.target.value)}
            error={editErrors.full_name ? t(editErrors.full_name) : undefined}
            required
          />
          <TextField
            label={t('admin:renters.phone')}
            value={editForm.phone}
            onChange={(e) => setEdit('phone', e.target.value)}
            error={editErrors.phone ? t(editErrors.phone) : undefined}
            required
          />
          <SelectField
            label={t('admin:renters.language')}
            value={editForm.language}
            onChange={(e) => setEdit('language', e.target.value as Language)}
            options={[
              { value: 'en', label: t('common:language.enName') },
              { value: 'fil', label: t('common:language.filName') },
            ]}
            error={editErrors.language ? t(editErrors.language) : undefined}
            required
          />
          <TextField
            label={t('admin:renters.birthday')}
            type="date"
            value={editForm.birthday}
            max={manilaToday()}
            onChange={(e) => setEdit('birthday', e.target.value)}
            error={editErrors.birthday ? t(editErrors.birthday) : undefined}
            helper={t('admin:renters.birthdayHelper')}
          />
        </form>
      </Modal>

      {assigning && <AssignBedModal renter={assigning} onClose={() => setAssigning(null)} />}

      <Modal
        open={movingOut !== null}
        onClose={() => setMovingOut(null)}
        title={movingOut ? t('admin:moveOut.title', { name: movingOut.full_name }) : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMovingOut(null)}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" form="move-out-form" loading={isMovingOut} loadingText={t('common:saving')} disabled={isMovingOut}>
              {t('admin:moveOut.confirm')}
            </Button>
          </>
        }
      >
        <form id="move-out-form" onSubmit={onSubmitMoveOut} noValidate className="flex flex-col gap-4">
          {moveOutFormError && <InlineAlert tone="error">{moveOutFormError}</InlineAlert>}
          <TextField
            label={t('admin:moveOut.date')}
            type="date"
            value={moveOutDate}
            max={manilaToday()}
            onChange={(e) => setMoveOutDate(e.target.value)}
            error={moveOutError ?? undefined}
            required
          />
          {preview.data && (
            <InlineAlert tone="info">
              {t('admin:moveOut.previewApply', { credit: formatPeso(preview.data.credit_balance, { language }), apply: formatPeso(preview.data.would_apply, { language }) })}
              {preview.data.refund_due > 0 && ` ${t('admin:moveOut.previewRefund', { refund: formatPeso(preview.data.refund_due, { language }) })}`}
            </InlineAlert>
          )}
        </form>
      </Modal>

      <Modal
        open={viewingCredit !== null}
        onClose={() => setViewingCredit(null)}
        title={viewingCredit ? t('admin:credit.title', { name: viewingCredit.full_name }) : ''}
        footer={
          <Button variant="secondary" onClick={openRefund}>
            {t('admin:credit.recordRefund')}
          </Button>
        }
      >
        {credit.isLoading ? (
          <Skeleton variant="row" />
        ) : credit.data ? (
          <CreditLedgerList ledger={credit.data} />
        ) : null}
      </Modal>

      <Modal
        open={refunding}
        onClose={() => setRefunding(false)}
        title={t('admin:refund.title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefunding(false)}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" form="refund-form" loading={isRefunding} loadingText={t('common:saving')} disabled={isRefunding}>
              {t('admin:refund.save')}
            </Button>
          </>
        }
      >
        <form id="refund-form" onSubmit={onSubmitRefund} noValidate className="flex flex-col gap-4">
          {refundFormError && <InlineAlert tone="error">{refundFormError}</InlineAlert>}
          <TextField
            label={t('admin:refund.amount')}
            type="number"
            step="0.01"
            min="0"
            value={refundForm.amount}
            onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))}
            error={refundErrors.amount ? t(refundErrors.amount, { balance: formatPeso(credit.data?.balance ?? 0, { language }) }) : undefined}
            required
          />
          <SelectField
            label={t('admin:refund.method')}
            value={refundForm.method}
            onChange={(e) => setRefundForm((f) => ({ ...f, method: e.target.value as AdminMethod }))}
            options={REFUND_METHODS.map((m) => ({ value: m, label: t(`domain:method.${m}`) }))}
            error={refundErrors.method ? t(refundErrors.method) : undefined}
            required
          />
          <TextField
            label={t('admin:refund.reference')}
            value={refundForm.reference_no}
            onChange={(e) => setRefundForm((f) => ({ ...f, reference_no: e.target.value }))}
            error={refundErrors.reference_no ? t(refundErrors.reference_no) : undefined}
          />
          <TextField
            label={t('admin:refund.date')}
            type="date"
            value={refundForm.refunded_at}
            onChange={(e) => setRefundForm((f) => ({ ...f, refunded_at: e.target.value }))}
            error={refundErrors.refunded_at ? t(refundErrors.refunded_at) : undefined}
            required
          />
          <TextField
            label={t('admin:refund.note')}
            value={refundForm.note}
            onChange={(e) => setRefundForm((f) => ({ ...f, note: e.target.value }))}
            error={refundErrors.note ? t(refundErrors.note) : undefined}
          />
        </form>
      </Modal>
    </div>
  );
}
