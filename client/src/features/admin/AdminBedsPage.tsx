import { useState } from 'react';
import { ConfirmDelete } from '../../ui/ConfirmDialog';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { AssignBedModal } from '../shared/AssignBedModal';
import { Avatar } from '../../ui/Avatar';
import { useCreateBedMutation, useDeleteBedMutation, useGetBedsQuery, useUpdateBedMutation, type BedInput } from '../../services/endpoints/admin';
import type { Bed, BedStatus, BunkType } from '../../types/api';
import { bedSchema } from '../../validation/admin';
import { toFieldErrors } from '../../validation/common';
import { isApiError, fieldErrors } from '../../services/errors';
import { formatPeso } from '../../lib/format';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../../features/ui/uiSlice';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { StatusBadge } from '../../ui/StatusBadge';
import { Modal } from '../../ui/Modal';
import { TextField, SelectField } from '../../ui/TextField';
import { FileUpload } from '../../ui/FileUpload';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { InlineAlert } from '../../ui/InlineAlert';
import { Bed as BedIcon, Plus, Pencil, Trash2 } from '../../ui/icons';
import { useToast } from '../../ui/ToastProvider';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { placeholderImage } from '../../lib/placeholderImage';

const STATUS_TONE: Record<BedStatus, 'success' | 'neutral' | 'warning'> = { vacant: 'success', occupied: 'neutral', reserved: 'warning' };

interface FormState {
  label: string;
  room: string;
  bunk_type: BunkType | '';
  monthly_rate: string;
  status: Exclude<BedStatus, 'occupied'> | '';
  photo: File | null;
}

const EMPTY_FORM: FormState = { label: '', room: '', bunk_type: '', monthly_rate: '', status: 'vacant', photo: null };

function bedToForm(bed: Bed): FormState {
  return { label: bed.label, room: bed.room, bunk_type: bed.bunk_type, monthly_rate: String(bed.monthly_rate), status: bed.status === 'occupied' ? 'vacant' : bed.status, photo: null };
}

/**
 * R29: occupancy board grouped by room ("Room A · 5 of 6 occupied"), with an Add/Edit bed modal. A bed card links its
 * tenant to the renter details page, or offers Assign when vacant. Delete is disabled with a tooltip when the bed has
 * history (E12), and otherwise asks for confirmation.
 */
export function AdminBedsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const language = useAppSelector(selectLanguage);
  const { data: beds, isLoading, error, refetch } = useGetBedsQuery();
  const [createBed, { isLoading: isCreating }] = useCreateBedMutation();
  const [updateBed, { isLoading: isUpdating }] = useUpdateBedMutation();
  const [deleteBed] = useDeleteBedMutation();
  const showSkeleton = useDelayedFlag(isLoading);

  const [editing, setEditing] = useState<Bed | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const isSaving = isCreating || isUpdating;

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(bed: Bed) {
    setEditing(bed);
    setForm(bedToForm(bed));
    setErrors({});
    setFormError(null);
    setModalOpen(true);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;
    const parsed = bedSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    const input: BedInput = parsed.data;
    try {
      if (editing) {
        await updateBed({ id: editing.id, ...input }).unwrap();
        toast.show('success', t('admin:beds.savedEdit'));
      } else {
        await createBed(input).unwrap();
        toast.show('success', t('admin:beds.savedAdd'));
      }
      setModalOpen(false);
    } catch (err) {
      if (isApiError(err) && err.code === 'VALIDATION_ERROR') {
        setErrors(fieldErrors(err));
        return;
      }
      setFormError(t('errors:UNKNOWN'));
    }
  }

  const [deleting, setDeleting] = useState<Bed | null>(null);
  const [assigningBed, setAssigningBed] = useState<Bed | null>(null);
  const navigate = useNavigate();
  async function onDelete(bed: Bed) {
    try {
      await deleteBed(bed.id).unwrap();
      setDeleting(null);
      toast.show('success', t('admin:beds.deleted'));
    } catch (err) {
      toast.show('error', isApiError(err) && err.code === 'BED_HAS_HISTORY' ? t('errors:BED_HAS_HISTORY') : t('errors:UNKNOWN'));
    }
  }

  if (error && !isLoading) {
    return <ErrorState message={t('admin:beds.errorLoading')} onRetry={() => void refetch()} />;
  }

  if (isLoading) {
    return showSkeleton ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="card" />
        ))}
      </div>
    ) : null;
  }

  const rows = beds ?? [];
  // Grouped by the existing `room` field (no contract change), rooms A–Z, beds in API order (bunk pairs).
  const byRoom = new Map<string, Bed[]>();
  for (const b of rows) byRoom.set(b.room, [...(byRoom.get(b.room) ?? []), b]);
  const rooms = [...byRoom].sort(([x], [y]) => x.localeCompare(y, undefined, { numeric: true }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="type-h2 text-primary">{t('nav:beds')}</h1>
        <Button iconLeft={<Plus className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={openAdd}>
          {t('admin:beds.add')}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<BedIcon className="h-icon-lg w-icon-lg text-tertiary" aria-hidden="true" />}
          title={t('admin:beds.empty')}
          action={
            <Button variant="secondary" onClick={openAdd}>
              {t('admin:beds.add')}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {rooms.map(([room, list]) => {
            const occupied = list.filter((b) => b.status === 'occupied').length;
            const id = `room-${room.replace(/\W+/g, '-')}`;
            return (
              <section key={room} aria-labelledby={id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h2 id={id} className="type-h3 text-primary">
                    {room}
                  </h2>
                  <div className="flex min-w-[12rem] flex-col gap-1">
                    <p className="text-right type-label-s text-secondary">{t('admin:beds.roomOccupancy', { occupied, total: list.length })}</p>
                    <div className="h-1.5 w-full rounded-full" style={{ background: 'var(--color-chart-track)' }} aria-hidden="true">
                      <div className="h-full rounded-full" style={{ width: `${(occupied / list.length) * 100}%`, background: 'var(--color-chart-1)' }} />
                    </div>
                  </div>
                </div>
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((bed) => (
                    <li key={bed.id} className="flex flex-col overflow-hidden rounded-lg border bg-surface">
                      {/* Decorative: the label beside it names the bed. Placeholder when the bed has no photo yet. */}
                      <img src={bed.photo_url ?? placeholderImage(bed.label, 600, 400)} alt="" width={600} height={400} loading="lazy" className="aspect-[16/9] w-full bg-muted object-cover" />
                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="type-body-m-strong text-primary">{bed.label}</h3>
                          <StatusBadge tone={STATUS_TONE[bed.status]}>{t(`domain:bedStatus.${bed.status}`)}</StatusBadge>
                        </div>
                        <p className="type-body-s text-secondary">
                          {t(`domain:bunkType.${bed.bunk_type}`)} · <span className="type-body-s-strong text-primary">{formatPeso(bed.monthly_rate, { language, whole: true })}</span>
                          {t('admin:beds.perMonth')}
                        </p>
                        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                          {bed.current_renter ? (
                            <Link
                              to={`/admin/renters/${bed.current_renter.id}`}
                              className="inline-flex min-h-touch items-center gap-2 rounded-md type-body-s-strong text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                            >
                              <span aria-hidden="true">
                                <Avatar name={bed.current_renter.full_name} size="sm" />
                              </span>
                              {bed.current_renter.full_name}
                            </Link>
                          ) : bed.status === 'vacant' ? (
                            <Button variant="secondary" aria-label={t('admin:beds.assignLabel', { bed: bed.label })} onClick={() => setAssigningBed(bed)}>
                              {t('admin:beds.assign')}
                            </Button>
                          ) : (
                            <span className="type-body-s text-tertiary">{t('domain:bedStatus.reserved')}</span>
                          )}
                          <div className="flex gap-1">
                            <IconButton label={t('admin:beds.editLabel', { bed: bed.label })} icon={<Pencil className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => openEdit(bed)} />
                            <IconButton
                              label={bed.has_history ? t('admin:beds.deleteDisabledTooltip') : t('admin:beds.deleteLabel', { bed: bed.label })}
                              icon={<Trash2 className="h-icon-sm w-icon-sm" aria-hidden="true" />}
                              aria-disabled={bed.has_history || undefined}
                              onClick={() => {
                                if (!bed.has_history) setDeleting(bed);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {assigningBed && (
        <AssignBedModal bed={assigningBed} onClose={() => setAssigningBed(null)} onAddNew={() => navigate(`/admin/renters?add=1&bed=${assigningBed.id}`)} />
      )}
      <ConfirmDelete item={deleting?.label ?? null} onCancel={() => setDeleting(null)} onConfirm={() => deleting && void onDelete(deleting)} />
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('admin:beds.editTitle') : t('admin:beds.addTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" form="bed-form" loading={isSaving} loadingText={t('common:saving')} disabled={isSaving}>
              {t('common:save')}
            </Button>
          </>
        }
      >
        <form id="bed-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
          <TextField
            label={t('admin:beds.label')}
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            error={errors.label ? t(errors.label) : undefined}
            required
          />
          <TextField
            label={t('admin:beds.room')}
            value={form.room}
            onChange={(e) => set('room', e.target.value)}
            error={errors.room ? t(errors.room) : undefined}
            required
          />
          <SelectField
            label={t('admin:beds.bunkType')}
            placeholder={t('admin:beds.bunkTypePlaceholder')}
            value={form.bunk_type}
            onChange={(e) => set('bunk_type', e.target.value as BunkType)}
            options={[
              { value: 'lower', label: t('domain:bunkType.lower') },
              { value: 'upper', label: t('domain:bunkType.upper') },
            ]}
            error={errors.bunk_type ? t(errors.bunk_type) : undefined}
            required
          />
          <TextField
            label={t('admin:beds.rate')}
            type="number"
            step="0.01"
            min="1"
            value={form.monthly_rate}
            onChange={(e) => set('monthly_rate', e.target.value)}
            error={errors.monthly_rate ? t(errors.monthly_rate) : undefined}
            required
          />
          <SelectField
            label={t('admin:beds.status')}
            value={form.status}
            onChange={(e) => set('status', e.target.value as Exclude<BedStatus, 'occupied'>)}
            options={[
              { value: 'vacant', label: t('domain:bedStatus.vacant') },
              { value: 'reserved', label: t('domain:bedStatus.reserved') },
            ]}
            disabled={editing?.status === 'occupied'}
            error={errors.status ? t(errors.status) : undefined}
            required
          />
          <FileUpload label={t('admin:beds.photo')} value={form.photo} onChange={(file) => set('photo', file)} error={errors.photo ? t(errors.photo) : undefined} />
        </form>
      </Modal>
    </div>
  );
}
