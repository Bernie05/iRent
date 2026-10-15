import { useState } from 'react';
import { ConfirmDelete } from '../../ui/ConfirmDialog';
import { Pagination, usePaged } from '../../ui/Pagination';
import { useTranslation } from 'react-i18next';
import {
  useCreateAnnouncementMutation,
  useDeleteAnnouncementMutation,
  useGetAnnouncementsQuery,
  useReorderAnnouncementsMutation,
  useUpdateAnnouncementMutation,
} from '../../services/endpoints/admin';
import type { Announcement, AnnouncementKind, Priority } from '../../types/api';
import { announcementSchema } from '../../validation/admin';
import { toFieldErrors } from '../../validation/common';
import { isApiError, fieldErrors } from '../../services/errors';
import { formatDateTime, maintenanceWindow } from '../../lib/format';
import { addDays, isIsoDate } from '../../lib/time';
import { manilaParts } from './inquiries/calendar';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../ui/uiSlice';
import { Table, TableCell, TableHeaderCell } from '../../ui/Table';
import { IconButton } from '../../ui/IconButton';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { TextField, TextareaField } from '../../ui/TextField';
import { Checkbox } from '../../ui/Checkbox';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { FileUpload } from '../../ui/FileUpload';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { InlineAlert } from '../../ui/InlineAlert';
import { AlertTriangle, ChevronDown, ChevronUp, Clock, Megaphone, Pin, Plus, Pencil, Trash2 } from '../../ui/icons';
import { useToast } from '../../ui/ToastProvider';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';

/** ISO instant → the `datetime-local` value in Manila time ("2026-10-20T08:00"). */
const toLocalInput = (iso: string) => {
  const { date, time } = manilaParts(iso);
  return `${date}T${time}`;
};

const STATUS_TONE = { scheduled: 'text-status-info-fg', published: 'text-success', ended: 'text-tertiary' } as const;

/**
 * Create (no `editing`) or Edit. "Also send by email" starts unticked (R41), except on a scheduled one whose email is
 * still pending (D-25: unticking it cancels that email, E66). Publish at is editable until it publishes (R73).
 */
function AnnouncementModal({ editing, onClose }: { editing: Announcement | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [createAnnouncement, { isLoading: isCreating }] = useCreateAnnouncementMutation();
  const [updateAnnouncement, { isLoading: isUpdating }] = useUpdateAnnouncementMutation();
  const isSaving = isCreating || isUpdating;

  const scheduledEdit = editing?.status === 'scheduled';
  const publishedEdit = Boolean(editing) && !scheduledEdit;
  const [form, setForm] = useState({
    title: editing?.title ?? '',
    body: editing?.body ?? '',
    priority: (editing?.priority ?? 'normal') as Priority,
    pinned: editing?.pinned ?? false,
    send_email: editing?.email_pending ?? false,
    image: null as File | null,
    kind: (editing?.kind ?? 'general') as AnnouncementKind,
    starts_on: editing?.starts_on ?? '',
    ends_on: editing?.ends_on ?? '',
    start_time: editing?.start_time ?? '',
    end_time: editing?.end_time ?? '',
    publish_at: scheduledEdit && editing?.publish_at ? toLocalInput(editing.publish_at) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const willSchedule = !publishedEdit && Boolean(form.publish_at) && Date.parse(`${form.publish_at}:00+08:00`) > Date.now();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;
    const only = (v: string) => (form.kind === 'maintenance' ? v : undefined);
    const values = {
      ...form,
      starts_on: only(form.starts_on),
      ends_on: only(form.ends_on),
      start_time: only(form.start_time),
      end_time: only(form.end_time),
      // Manila wall time → ISO +08:00. "" on a scheduled one publishes it now; a published one never sends it (read-only).
      publish_at: publishedEdit ? undefined : form.publish_at ? `${form.publish_at}:00+08:00` : scheduledEdit ? '' : undefined,
    };
    const parsed = announcementSchema({ creating: !editing, checkPublishAt: !publishedEdit }).safeParse(values);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    const input = { ...parsed.data, publish_at: values.publish_at, image: form.image };
    try {
      const saved = editing ? await updateAnnouncement({ id: editing.id, ...input }).unwrap() : await createAnnouncement(input).unwrap();
      toast.show(
        'success',
        saved.status === 'scheduled' ? t('admin:announcements.savedScheduled') : input.send_email ? t('admin:announcements.savedEmailed') : t('admin:announcements.saved'),
      );
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) {
        setErrors(fe);
        return;
      }
      if (isApiError(err) && (err.code === 'FILE_TOO_LARGE' || err.code === 'INVALID_FILE_TYPE')) {
        setErrors({ image: `errors:${err.code}` });
        return;
      }
      setFormError(t('errors:UNKNOWN'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('admin:announcements.editTitle') : t('admin:announcements.createTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="announcement-form" loading={isSaving} loadingText={t('common:saving')} disabled={isSaving}>
            {t('common:save')}
          </Button>
        </>
      }
    >
      <form id="announcement-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
        {editing?.schedule_event_id && <InlineAlert tone="info">{t('admin:announcements.linkedHint')}</InlineAlert>}
        <SegmentedControl
          label={t('admin:announcements.type')}
          options={[
            { value: 'general', label: t('admin:announcements.typeGeneral') },
            { value: 'maintenance', label: t('admin:announcements.typeMaintenance') },
          ]}
          value={form.kind}
          onChange={(v) => set('kind', v)}
          className="self-start"
        />
        <TextField
          label={t('admin:announcements.fieldTitle')}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={120}
          error={errors.title ? t(errors.title) : undefined}
          required
        />
        <TextareaField
          label={t('admin:announcements.body')}
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
          maxLength={5000}
          rows={6}
          error={errors.body ? t(errors.body) : undefined}
          required
        />
        {form.kind === 'maintenance' && (
          <fieldset className="flex flex-col gap-3 rounded-md border p-3">
            <legend className="px-1 type-label-s text-primary">{t('admin:announcements.window')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField type="date" label={t('admin:announcements.from')} value={form.starts_on} onChange={(e) => set('starts_on', e.target.value)} error={errors.starts_on ? t(errors.starts_on) : undefined} required />
              <TextField type="date" label={t('admin:announcements.to')} value={form.ends_on} onChange={(e) => set('ends_on', e.target.value)} error={errors.ends_on ? t(errors.ends_on) : undefined} required />
            </div>
            <Button variant="secondary" type="button" className="self-start" disabled={!isIsoDate(form.starts_on)} onClick={() => set('ends_on', addDays(form.starts_on, 6))}>
              {t('admin:announcements.wholeWeek')}
            </Button>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField type="time" label={t('admin:announcements.startTime')} value={form.start_time} onChange={(e) => set('start_time', e.target.value)} error={errors.start_time ? t(errors.start_time) : undefined} />
              <TextField type="time" label={t('admin:announcements.endTime')} value={form.end_time} onChange={(e) => set('end_time', e.target.value)} error={errors.end_time ? t(errors.end_time) : undefined} />
            </div>
          </fieldset>
        )}
        <SegmentedControl
          label={t('admin:announcements.priority')}
          options={[
            { value: 'normal', label: t('admin:announcements.normal') },
            { value: 'urgent', label: t('admin:announcements.urgent') },
          ]}
          value={form.priority}
          onChange={(v) => set('priority', v)}
        />
        <FileUpload label={t('admin:announcements.image')} value={form.image} onChange={(file) => set('image', file)} error={errors.image ? t(errors.image) : undefined} />
        <Checkbox id="announcement-pinned" label={t('admin:announcements.pinned')} checked={form.pinned} onChange={(e) => set('pinned', e.target.checked)} />
        <TextField
          type="datetime-local"
          label={t('admin:announcements.publishAt')}
          helper={publishedEdit ? t('admin:announcements.publishAtLocked') : t('admin:announcements.publishAtHelper')}
          value={publishedEdit && editing?.publish_at ? toLocalInput(editing.publish_at) : form.publish_at}
          onChange={(e) => set('publish_at', e.target.value)}
          disabled={publishedEdit}
          error={errors.publish_at ? t(errors.publish_at) : undefined}
        />
        <div className="flex flex-col">
          <Checkbox
            id="announcement-email"
            label={willSchedule ? t('admin:announcements.sendEmailScheduled') : t('admin:announcements.sendEmail')}
            checked={form.send_email}
            onChange={(e) => set('send_email', e.target.checked)}
            aria-describedby="announcement-email-hint"
          />
          <p id="announcement-email-hint" className="type-body-s text-tertiary">
            {willSchedule ? t('admin:announcements.sendEmailScheduledHint') : t('admin:announcements.sendEmailHint')}
          </p>
        </div>
      </form>
    </Modal>
  );
}

type SortView = 'custom' | 'newest' | 'priority';

const newestFirst = (a: Announcement, b: Announcement) => (b.publish_at ?? b.created_at).localeCompare(a.publish_at ?? a.created_at);

/** D-30 admin-only views; "custom" is the server order (pinned first, then position), the one renters see. */
function sortFor(view: SortView, rows: Announcement[]): Announcement[] {
  if (view === 'newest') return [...rows].sort(newestFirst);
  if (view === 'priority')
    return [...rows].sort((a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || Number(b.pinned) - Number(a.pinned) || newestFirst(a, b));
  return rows;
}

/**
 * R41 (S14) as a stacked table (D-31): title, type, status, publish date, pinned, order, actions; Create/Edit modal,
 * Delete with confirm. D-30: sort switch (Custom order / Newest / Priority); in Custom order, Move up / Move down within
 * the pinned or unpinned group (across pages) and native drag and drop within the page, saved at once (optimistic).
 */
export function AdminAnnouncementsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const language = useAppSelector(selectLanguage);
  const { data, isLoading, error, refetch } = useGetAnnouncementsQuery();
  const showSkeleton = useDelayedFlag(isLoading);
  const [deleteAnnouncement, { isLoading: isDeleting }] = useDeleteAnnouncementMutation();
  const [reorder] = useReorderAnnouncementsMutation();

  // `undefined` = closed, `null` = creating, an Announcement = editing it.
  const [editing, setEditing] = useState<Announcement | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [view, setView] = useState<SortView>('custom');
  const [moved, setMoved] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  async function onDelete() {
    if (!deleting || isDeleting) return;
    try {
      await deleteAnnouncement(deleting.id).unwrap();
      toast.show('success', t('admin:announcements.deleted'));
      setDeleting(null);
    } catch {
      toast.show('error', t('errors:UNKNOWN'));
    }
  }

  const all = data ?? [];
  const rows = sortFor(view, all);
  const paged = usePaged(rows, 10, view);
  const custom = view === 'custom';
  const sameGroup = (i: number, j: number) => i >= 0 && j >= 0 && j < all.length && all[i].pinned === all[j].pinned;

  /** Saves the order with `id` placed at `to` (global index), keeps it on screen and focused, and announces it. */
  async function moveTo(id: string, to: number, focus?: 'up' | 'down') {
    const ids = all.map((a) => a.id).filter((x) => x !== id);
    ids.splice(to, 0, id);
    const title = all.find((a) => a.id === id)!.title;
    paged.setPage(Math.floor(to / paged.pageSize) + 1);
    setMoved(t('admin:announcements.movedTo', { title, position: to + 1, total: ids.length }));
    if (focus) {
      // The row may have moved to another page or to a group end (button now disabled): refocus after the render.
      requestAnimationFrame(() => {
        const button = document.getElementById(`move-${focus}-${id}`) as HTMLButtonElement | null;
        (button && !button.disabled ? button : document.getElementById(`move-${focus === 'up' ? 'down' : 'up'}-${id}`))?.focus();
      });
    }
    try {
      await reorder(ids).unwrap();
    } catch (err) {
      setMoved('');
      toast.show('error', isApiError(err) && err.code === 'VALIDATION_ERROR' ? t('admin:announcements.orderStale') : t('errors:UNKNOWN'));
    }
  }

  function onDrop(target: Announcement) {
    const from = all.findIndex((a) => a.id === dragId);
    const to = all.indexOf(target);
    setDragId(null);
    if (from < 0 || from === to || !sameGroup(from, to)) return;
    void moveTo(all[from].id, to);
  }

  if (error && !isLoading) {
    return <ErrorState message={t('admin:announcements.errorLoading')} onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="type-h2 text-primary">{t('admin:announcements.title')}</h1>
        <Button iconLeft={<Plus className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setEditing(null)}>
          {t('admin:announcements.create')}
        </Button>
      </div>
      <SegmentedControl
        label={t('admin:announcements.sortLabel')}
        options={[
          { value: 'custom', label: t('admin:announcements.sort.custom') },
          { value: 'newest', label: t('admin:announcements.sort.newest') },
          { value: 'priority', label: t('admin:announcements.sort.priority') },
        ]}
        value={view}
        onChange={setView}
        className="self-start"
      />
      <p className="sr-only" aria-live="polite">
        {moved}
      </p>

      {isLoading ? (
        showSkeleton ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="row" />
            ))}
          </div>
        ) : null
      ) : all.length === 0 ? (
        <EmptyState icon={<Megaphone className="h-icon-lg w-icon-lg text-tertiary" aria-hidden="true" />} title={t('admin:announcements.empty')} />
      ) : (
        <Table stacked>
          <caption className="sr-only">{t('admin:announcements.title')}</caption>
          <thead>
            <tr>
              <TableHeaderCell>{t('admin:announcements.col.title')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:announcements.col.type')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:announcements.col.status')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:announcements.col.publishDate')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:announcements.col.pinned')}</TableHeaderCell>
              {custom && <TableHeaderCell>{t('admin:announcements.col.order')}</TableHeaderCell>}
              <TableHeaderCell>
                <span className="sr-only">{t('admin:announcements.col.actions')}</span>
              </TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((a) => {
              const index = all.indexOf(a);
              const windowLabel = maintenanceWindow(a, { language });
              const canDrop = dragId !== null && dragId !== a.id && sameGroup(all.findIndex((x) => x.id === dragId), index);
              return (
                <tr
                  key={a.id}
                  draggable={custom}
                  onDragStart={(e) => {
                    // Firefox only starts a drag with data set.
                    e.dataTransfer?.setData('text/plain', a.id);
                    setDragId(a.id);
                  }}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    if (canDrop) e.preventDefault();
                  }}
                  onDrop={() => onDrop(a)}
                  className={`${custom ? 'md:cursor-grab' : ''} ${dragId === a.id ? 'opacity-50' : ''}`}
                >
                  <TableCell>
                    <span className="flex min-w-0 flex-col gap-0.5 text-right md:text-left">
                      <span className="type-body-s-strong text-primary">{a.title}</span>
                      {a.priority === 'urgent' && (
                        <span className="inline-flex items-center gap-1 self-end type-label-xs text-danger md:self-start">
                          <AlertTriangle className="h-icon-sm w-icon-sm" aria-hidden="true" />
                          {t('ui:announcement.urgent')}
                        </span>
                      )}
                      <span className="line-clamp-2 max-w-[40ch] type-caption text-secondary">{a.body}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col">
                      <span>{a.kind === 'maintenance' ? t('admin:announcements.typeMaintenance') : t('admin:announcements.typeGeneral')}</span>
                      {windowLabel && <span className="type-caption text-secondary">{windowLabel}</span>}
                      {a.schedule_event_id && <span className="type-caption text-tertiary">{t('admin:announcements.linked')}</span>}
                    </span>
                  </TableCell>
                  <TableCell variant="badge">
                    {a.status && (
                      <span className="flex flex-col items-end gap-0.5 md:items-start">
                        <span className={`inline-flex items-center gap-1 type-label-s ${STATUS_TONE[a.status]}`}>
                          {a.status === 'scheduled' && <Clock className="h-icon-sm w-icon-sm" aria-hidden="true" />}
                          {t(`admin:announcements.status.${a.status}`)}
                        </span>
                        {a.email_pending && <span className="type-caption text-tertiary">{t('admin:announcements.emailPending')}</span>}
                        {a.emailed_at && <span className="type-caption text-tertiary">{t('admin:announcements.emailed', { date: formatDateTime(a.emailed_at, { language }) })}</span>}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {a.publish_at &&
                      (a.status === 'scheduled'
                        ? t('admin:announcements.publishes', { date: formatDateTime(a.publish_at, { language }) })
                        : formatDateTime(a.publish_at, { language }))}
                  </TableCell>
                  <TableCell>
                    {a.pinned ? (
                      <span className="inline-flex items-center gap-1 type-label-xs text-brand">
                        <Pin className="h-icon-sm w-icon-sm" aria-hidden="true" />
                        {t('ui:announcement.pinned')}
                      </span>
                    ) : (
                      <span className="text-tertiary">{t('admin:announcements.notPinned')}</span>
                    )}
                  </TableCell>
                  {custom && (
                    <TableCell>
                      <span className="flex items-center gap-1">
                        <IconButton
                          id={`move-up-${a.id}`}
                          label={t('admin:announcements.moveUp', { title: a.title })}
                          icon={<ChevronUp className="h-icon-sm w-icon-sm" aria-hidden="true" />}
                          disabled={!sameGroup(index, index - 1)}
                          onClick={() => void moveTo(a.id, index - 1, 'up')}
                        />
                        <IconButton
                          id={`move-down-${a.id}`}
                          label={t('admin:announcements.moveDown', { title: a.title })}
                          icon={<ChevronDown className="h-icon-sm w-icon-sm" aria-hidden="true" />}
                          disabled={!sameGroup(index, index + 1)}
                          onClick={() => void moveTo(a.id, index + 1, 'down')}
                        />
                      </span>
                    </TableCell>
                  )}
                  <TableCell variant="actions">
                    <span className="flex justify-end gap-1">
                      <IconButton label={t('admin:announcements.editLabel', { title: a.title })} icon={<Pencil className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setEditing(a)} />
                      <IconButton label={t('admin:announcements.deleteLabel', { title: a.title })} icon={<Trash2 className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setDeleting(a)} />
                    </span>
                  </TableCell>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('admin:announcements.title') })} />

      {editing !== undefined && <AnnouncementModal key={editing?.id ?? 'new'} editing={editing} onClose={() => setEditing(undefined)} />}

      <ConfirmDelete
        item={deleting?.title ?? null}
        detail={t(deleting?.schedule_event_id ? 'admin:announcements.deleteDetailLinked' : 'admin:announcements.deleteDetail')}
        busy={isDeleting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}
