import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../app/hooks';
import { selectProfile } from '../auth/authSlice';
import { selectLanguage } from '../ui/uiSlice';
import { useCreateMaintenanceRequestMutation, useGetMyMaintenancePhotosQuery, useGetMyMaintenanceRequestsQuery } from '../../services/endpoints/renter';
import { isApiError, fieldErrors } from '../../services/errors';
import { MAINTENANCE_CATEGORIES, MAINTENANCE_URGENCIES, type MaintenanceCategory, type MaintenanceRequest, type MaintenanceUrgency } from '../../types/api';
import { maintenanceRequestSchema, photosError, MAX_MAINTENANCE_PHOTOS } from '../../validation/maintenance';
import { toFieldErrors } from '../../validation/common';
import { formatDate, formatDateTime } from '../../lib/format';
import { Card } from '../admin/dashboard/Card';
import { MaintenanceStatusBadge, RequestPhotos } from '../shared/maintenance';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { InlineAlert } from '../../ui/InlineAlert';
import { Modal } from '../../ui/Modal';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { SelectField, TextareaField } from '../../ui/TextField';
import { Table, TableCell, TableHeaderCell } from '../../ui/Table';
import { Pagination, usePaged } from '../../ui/Pagination';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { EmptyState } from '../../ui/EmptyState';
import { useToast } from '../../ui/ToastProvider';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { Close, ImageIcon } from '../../ui/icons';

interface Photo {
  file: File;
  url: string;
}

/** R74 New request form. Keeps its data on error; photos checked on the client too (≤ 3, JPG/PNG/WebP, ≤ 5 MB). */
function NewRequestForm() {
  const { t } = useTranslation();
  const toast = useToast();
  const [create, { isLoading }] = useCreateMaintenanceRequestMutation();
  const [category, setCategory] = useState<MaintenanceCategory | ''>('');
  const [urgency, setUrgency] = useState<MaintenanceUrgency>('normal');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Preview URLs are revoked when a photo goes away and on unmount.
  const latest = useRef(photos);
  latest.current = photos;
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  function addPhotos(list: FileList | null) {
    const next = [...photos, ...Array.from(list ?? []).map((file) => ({ file, url: URL.createObjectURL(file) }))];
    const problem = photosError(next.map((p) => p.file));
    if (problem) {
      next.slice(photos.length).forEach((p) => URL.revokeObjectURL(p.url));
      setErrors((e) => ({ ...e, photos: problem }));
    } else {
      setPhotos(next);
      setErrors(({ photos: _p, ...rest }) => rest);
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  function removePhoto(photo: Photo) {
    URL.revokeObjectURL(photo.url);
    setPhotos((list) => list.filter((p) => p !== photo));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    const parsed = maintenanceRequestSchema.safeParse({ category: category || undefined, urgency, description });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await create({ ...parsed.data, photos: photos.map((p) => p.file) }).unwrap();
      toast.show('success', t('portal:requests.sent'));
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
      setCategory('');
      setUrgency('normal');
      setDescription('');
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) return setErrors(fe);
      if (isApiError(err) && (err.code === 'FILE_TOO_LARGE' || err.code === 'INVALID_FILE_TYPE')) return setErrors({ photos: 'validation:photoInvalid' });
      setFormError(
        isApiError(err) && err.code === 'RATE_LIMITED'
          ? t('portal:requests.rateLimited')
          : isApiError(err) && err.code === 'NO_ACTIVE_TENANCY'
            ? t('portal:requests.movedOut')
            : t('errors:UNKNOWN'),
      );
    }
  }

  return (
    <Card title={t('portal:requests.newTitle')} className="max-sm:p-4">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
        <SelectField
          label={t('portal:requests.category')}
          value={category}
          onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}
          placeholder={t('portal:requests.categoryPlaceholder')}
          options={MAINTENANCE_CATEGORIES.map((c) => ({ value: c, label: t(`domain:maintenanceCategory.${c}`) }))}
          error={errors.category ? t(errors.category) : undefined}
          required
        />
        <div className="flex flex-col gap-1">
          <span className="type-label-s text-primary" id="urgency-label">
            {t('portal:requests.urgency')}
          </span>
          <SegmentedControl
            label={t('portal:requests.urgency')}
            options={MAINTENANCE_URGENCIES.map((u) => ({ value: u, label: t(`domain:maintenanceUrgency.${u}`) }))}
            value={urgency}
            onChange={setUrgency}
            className="self-start"
          />
          <p className="type-body-s text-tertiary">{t('portal:requests.urgentHint')}</p>
        </div>
        <TextareaField
          label={t('portal:requests.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={4}
          helper={t('portal:requests.counter', { n: description.length })}
          error={errors.description ? t(errors.description) : undefined}
          required
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="request-photos" className="type-label-s text-primary">
            {t('portal:requests.photos')}
          </label>
          <p id="request-photos-hint" className="type-body-s text-tertiary">
            {t('portal:requests.photosHint', { max: MAX_MAINTENANCE_PHOTOS })}
          </p>
          <input
            ref={fileInput}
            id="request-photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={photos.length >= MAX_MAINTENANCE_PHOTOS}
            aria-describedby={errors.photos ? 'request-photos-error' : 'request-photos-hint'}
            aria-invalid={Boolean(errors.photos) || undefined}
            onChange={(e) => addPhotos(e.target.files)}
            className="type-body-s text-secondary file:mr-3 file:min-h-touch file:rounded-full file:border file:border-strong file:bg-surface file:px-4 file:type-label-s file:text-primary"
          />
          {errors.photos && (
            <p id="request-photos-error" role="alert" className="type-body-s text-danger">
              {t(errors.photos)}
            </p>
          )}
          {photos.length > 0 && (
            <ul className="flex flex-wrap gap-3">
              {photos.map((p, i) => (
                <li key={p.url} className="relative">
                  <img src={p.url} alt={t('ui:maintenance.photoAlt', { n: i + 1, total: photos.length })} className="h-20 w-20 rounded-md border object-cover" />
                  <IconButton
                    label={t('portal:requests.removePhoto', { name: p.file.name })}
                    icon={<Close className="h-icon-sm w-icon-sm" aria-hidden="true" />}
                    onClick={() => removePhoto(p)}
                    variant="secondary"
                    className="absolute -right-3 -top-3"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button type="submit" loading={isLoading} loadingText={t('common:sending')} disabled={isLoading} className="max-sm:w-full sm:self-start">
          {t('portal:requests.send')}
        </Button>
      </form>
    </Card>
  );
}

/** Full request with photos (signed URLs, fetched when opened). */
function RequestDetail({ request, onClose }: { request: MaintenanceRequest; onClose: () => void }) {
  const { t } = useTranslation();
  const photos = useGetMyMaintenancePhotosQuery(request.id, { skip: request.photo_count === 0 });
  return (
    <Modal open onClose={onClose} title={t(`domain:maintenanceCategory.${request.category}`)}>
      <div className="flex flex-col gap-3">
        <MaintenanceStatusBadge status={request.status} />
        <p className="type-body-m whitespace-pre-line text-primary">{request.description}</p>
        <RequestNotes request={request} />
        {request.photo_count > 0 && <RequestPhotos urls={photos.data?.urls} isError={photos.isError} />}
      </div>
    </Modal>
  );
}

function RequestNotes({ request }: { request: MaintenanceRequest }) {
  const { t } = useTranslation();
  const language = useAppSelector(selectLanguage);
  // Shown while the request is open; a closed one keeps its link but the date is history.
  const fix = request.status === 'submitted' || request.status === 'in_progress' ? request.scheduled_fix : null;
  return (
    <>
      {fix && (
        <p className="type-body-s-strong text-primary">
          {t('portal:requests.fixScheduled', { date: fix.all_day ? formatDate(fix.starts_at, { language }) : formatDateTime(fix.starts_at, { language }) })}
        </p>
      )}
      {request.admin_note && <p className="type-body-s text-secondary">{t('portal:requests.ownerNote', { note: request.admin_note })}</p>}
      {request.status === 'declined' && request.decline_reason && (
        <p className="type-body-s text-secondary">{t('portal:requests.declineReason', { reason: request.decline_reason })}</p>
      )}
    </>
  );
}

/** R74 (D-26): Portal / Requests. New request form (active tenancy only, OQ-32) and My requests (paged, R64). */
export function PortalRequestsPage() {
  const { t } = useTranslation();
  const language = useAppSelector(selectLanguage);
  const profile = useAppSelector(selectProfile);
  const list = useGetMyMaintenanceRequestsQuery();
  const showSkeleton = useDelayedFlag(list.isLoading);
  const paged = usePaged(list.data ?? [], 10);
  const [open, setOpen] = useState<MaintenanceRequest | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-h1 text-primary max-sm:type-h2">{t('portal:requests.title')}</h1>
      {profile?.tenancy ? <NewRequestForm /> : <p className="type-body-m text-secondary">{t('portal:requests.movedOut')}</p>}

      <section aria-labelledby="my-requests-title" className="flex flex-col gap-3">
        <h2 id="my-requests-title" className="type-h3 text-primary">
          {t('portal:requests.listTitle')}
        </h2>
        {list.error && !list.isLoading ? (
          <ErrorState message={t('portal:requests.errorLoading')} onRetry={() => void list.refetch()} />
        ) : list.isLoading ? (
          showSkeleton ? <Skeleton variant="row" /> : null
        ) : paged.total === 0 ? (
          <EmptyState title={t('portal:requests.empty')} />
        ) : (
          <>
            <Table stacked>
              <caption className="sr-only">{t('portal:requests.listTitle')}</caption>
              <thead>
                <tr>
                  <TableHeaderCell>{t('portal:requests.col.request')}</TableHeaderCell>
                  <TableHeaderCell>{t('portal:requests.urgency')}</TableHeaderCell>
                  <TableHeaderCell>{t('portal:requests.col.sent')}</TableHeaderCell>
                  <TableHeaderCell>{t('portal:requests.col.status')}</TableHeaderCell>
                  <TableHeaderCell>
                    <span className="sr-only">{t('portal:requests.view')}</span>
                  </TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((r) => {
                  const category = t(`domain:maintenanceCategory.${r.category}`);
                  return (
                    <tr key={r.id}>
                      <TableCell>
                        <span className="flex min-w-0 flex-col gap-0.5 text-right md:text-left">
                          <span className="type-body-s-strong text-primary">{category}</span>
                          <span className="line-clamp-2 max-w-[40ch] type-caption text-secondary">{r.description}</span>
                          <RequestNotes request={r} />
                        </span>
                      </TableCell>
                      <TableCell>{t(`domain:maintenanceUrgency.${r.urgency}`)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(r.created_at, { language })}</TableCell>
                      <TableCell variant="badge">
                        <span className="flex flex-col items-end gap-1 md:items-start">
                          <MaintenanceStatusBadge status={r.status} />
                          <span className="type-caption text-tertiary">{t('portal:requests.updated', { date: formatDate(r.status_changed_at, { language }) })}</span>
                        </span>
                      </TableCell>
                      <TableCell variant="actions">
                        <Button
                          variant="secondary"
                          iconLeft={r.photo_count > 0 ? <ImageIcon className="h-icon-sm w-icon-sm" aria-hidden="true" /> : undefined}
                          aria-label={t('portal:requests.viewLabel', { category, date: formatDate(r.created_at, { language }) })}
                          onClick={() => setOpen(r)}
                        >
                          {t('portal:requests.view')}
                        </Button>
                      </TableCell>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('portal:requests.listTitle') })} />
          </>
        )}
      </section>

      {open && <RequestDetail request={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
