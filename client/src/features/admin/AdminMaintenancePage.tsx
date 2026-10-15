import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useGetMaintenancePhotosQuery, useGetMaintenanceRequestsQuery, useGetRentersQuery, useUpdateMaintenanceRequestMutation } from '../../services/endpoints/admin';
import { fieldErrors, isApiError } from '../../services/errors';
import { MAINTENANCE_CATEGORIES, type MaintenanceCategory, type MaintenanceFilter, type MaintenanceRequest, type MaintenanceStatus } from '../../types/api';
import { NEXT_STATUSES } from '../../validation/maintenance';
import { useFormat } from '../../hooks/useFormat';
import { MaintenanceStatusBadge, RequestPhotos } from '../shared/maintenance';
import { ViewingCalendar } from './inquiries/ViewingCalendar';
import { ScheduleEventModal } from './inquiries/ScheduleEventModal';
import { manilaToday } from '../../lib/time';
import { Tabs } from '../../ui/Tabs';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { SelectField, TextareaField } from '../../ui/TextField';
import { Table, TableCell, TableHeaderCell } from '../../ui/Table';
import { Pagination, usePaged } from '../../ui/Pagination';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { EmptyState } from '../../ui/EmptyState';
import { useToast } from '../../ui/ToastProvider';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { AlertTriangle, Wrench } from '../../ui/icons';

const FILTERS: MaintenanceFilter[] = ['all', 'open', 'submitted', 'in_progress', 'done', 'declined'];
const ACTIONS: Record<Exclude<MaintenanceStatus, 'submitted'>, string> = { in_progress: 'start', done: 'markDone', declined: 'decline' };

/**
 * Detail (R75): renter link, bed, phone, description, photos, BR-19 actions only, Note to renter; Decline asks for a reason.
 * An open request without a fix offers "Schedule fix"; one with a fix shows its date.
 */
function RequestModal({ request, onChange, onClose, onScheduleFix }: { request: MaintenanceRequest; onChange: (r: MaintenanceRequest) => void; onClose: () => void; onScheduleFix: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const [update, { isLoading }] = useUpdateMaintenanceRequestMutation();
  const photos = useGetMaintenancePhotosQuery(request.id, { skip: request.photo_count === 0 });
  const { data: renters } = useGetRentersQuery();
  const phone = renters?.find((r) => r.id === request.renter?.id)?.phone;
  const [note, setNote] = useState(request.admin_note ?? '');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const category = t(`domain:maintenanceCategory.${request.category}`);
  const noteChanged = note.trim() !== (request.admin_note ?? '');
  const isOpen = request.status === 'submitted' || request.status === 'in_progress';
  const fix = request.scheduled_fix;

  async function save(change: { status?: MaintenanceStatus; decline_reason?: string }) {
    try {
      const saved = await update({ id: request.id, ...change, ...(noteChanged ? { admin_note: note.trim() || null } : {}) }).unwrap();
      onChange(saved);
      setDeclining(false);
      toast.show('success', change.status ? t('admin:maintenance.statusSaved', { status: t(`domain:maintenanceStatus.${change.status}`) }) : t('admin:maintenance.noteSaved'));
    } catch (err) {
      const fe = fieldErrors(err);
      if (fe.decline_reason) return setReasonError(t(fe.decline_reason));
      if (fe.admin_note) return setNoteError(t(fe.admin_note));
      if (isApiError(err) && err.code === 'INVALID_STATUS_CHANGE') {
        toast.show('error', t('admin:maintenance.staleStatus')); // the list refetches (tag invalidation)
        return onClose();
      }
      toast.show('error', t('errors:UNKNOWN'));
    }
  }

  // The reason dialog is a sibling, not a child: the panel is transformed, which would trap a fixed child inside it.
  return (
    <>
    <Modal
      open
      onClose={onClose}
      title={t('admin:maintenance.detailTitle', { category, name: request.renter?.full_name ?? '' })}
      footer={
        <>
          {isOpen && !fix && (
            <Button variant="secondary" disabled={isLoading} onClick={onScheduleFix}>
              {t('admin:maintenance.scheduleFix')}
            </Button>
          )}
          {NEXT_STATUSES[request.status].map((s) => (
            <Button key={s} variant={s === 'declined' ? 'danger' : s === 'done' ? 'primary' : 'secondary'} disabled={isLoading} onClick={() => (s === 'declined' ? setDeclining(true) : void save({ status: s }))}>
              {t(`admin:maintenance.${ACTIONS[s as keyof typeof ACTIONS]}`)}
            </Button>
          ))}
          <Button variant="secondary" disabled={isLoading || !noteChanged} onClick={() => void save({})}>
            {t('admin:maintenance.saveNote')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <MaintenanceStatusBadge status={request.status} />
          <span className="type-body-s text-secondary">{t(`domain:maintenanceUrgency.${request.urgency}`)}</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 type-body-s">
          <dt className="text-secondary">{t('admin:maintenance.renter')}</dt>
          <dd>{request.renter ? <Link to={`/admin/renters/${request.renter.id}`} className="text-brand underline">{request.renter.full_name}</Link> : '—'}</dd>
          <dt className="text-secondary">{t('admin:maintenance.bed')}</dt>
          <dd className="text-primary">{request.bed ? `${request.bed.room} – ${request.bed.label}` : '—'}</dd>
          <dt className="text-secondary">{t('admin:maintenance.phone')}</dt>
          <dd>{phone ? <a href={`tel:${phone}`} className="text-brand underline">{phone}</a> : '—'}</dd>
          <dt className="text-secondary">{t('admin:maintenance.sent')}</dt>
          <dd className="text-primary">{f.dateTime(request.created_at)}</dd>
        </dl>
        <p className="type-body-m whitespace-pre-line text-primary">{request.description}</p>
        {isOpen && fix && (
          <p className="flex flex-col type-body-s-strong text-primary">
            {t('admin:maintenance.fixScheduled', { date: fix.all_day ? f.date(fix.starts_at) : f.dateTime(fix.starts_at) })}
            <span className="type-caption font-normal text-secondary">{t('admin:maintenance.fixHelper')}</span>
          </p>
        )}
        {request.status === 'declined' && request.decline_reason && <p className="type-body-s text-secondary">{t('portal:requests.declineReason', { reason: request.decline_reason })}</p>}
        {request.photo_count > 0 && <RequestPhotos urls={photos.data?.urls} isError={photos.isError} />}
        <TextareaField
          label={t('admin:maintenance.note')}
          helper={t('admin:maintenance.noteHelper')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          error={noteError ?? undefined}
        />
      </div>
    </Modal>

      {declining && (
        <Modal
          open
          onClose={() => setDeclining(false)}
          title={t('admin:maintenance.declineTitle')}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeclining(false)}>
                {t('common:cancel')}
              </Button>
              <Button
                variant="danger"
                loading={isLoading}
                loadingText={t('common:saving')}
                onClick={() => (reason.trim() ? void save({ status: 'declined', decline_reason: reason.trim() }) : setReasonError(t('validation:reasonLength')))}
              >
                {t('admin:maintenance.decline')}
              </Button>
            </>
          }
        >
          <TextareaField label={t('admin:maintenance.reason')} helper={t('admin:maintenance.reasonHelper')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} error={reasonError ?? undefined} required />
        </Modal>
      )}
    </>
  );
}

type Tab = 'calendar' | 'requests';

/**
 * Admin / Maintenance: tabs **Calendar** (default: planned maintenance, add/edit/delete on the shared schedule calendar)
 * and **Requests (N open)** (R75, D-26: Status (default Open) and Category filters, R75 order from the server, paging,
 * R64). `?tab=requests` opens Requests (the dashboard's Needs attention link).
 */
export function AdminMaintenancePage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'requests' ? 'requests' : 'calendar');
  const openCount = useGetMaintenanceRequestsQuery({ status: 'open', category: '' }).data?.length;
  const [fixing, setFixing] = useState<MaintenanceRequest | null>(null);
  const [status, setStatus] = useState<MaintenanceFilter>('open');
  const [category, setCategory] = useState<MaintenanceCategory | ''>('');
  const { data, isLoading, error, refetch } = useGetMaintenanceRequestsQuery({ status, category });
  const showSkeleton = useDelayedFlag(isLoading);
  const paged = usePaged(data ?? [], 10, [status, category]);
  const [selected, setSelected] = useState<MaintenanceRequest | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="type-h2 text-primary">{t('admin:maintenance.title')}</h1>
      <Tabs
        label={t('admin:maintenance.sections')}
        items={[
          { value: 'calendar', label: t('admin:maintenance.tabCalendar') },
          { value: 'requests', label: openCount === undefined ? t('admin:maintenance.tabRequests') : t('admin:maintenance.tabRequestsOpen', { count: openCount }) },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div role="tabpanel" aria-label={t(tab === 'calendar' ? 'admin:maintenance.tabCalendar' : 'admin:maintenance.tabRequests')} className="flex flex-col gap-4">
      {tab === 'calendar' ? (
        <ViewingCalendar maintenance />
      ) : (
      <>
      <div className="flex flex-wrap gap-3">
        <SelectField
          label={t('admin:maintenance.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as MaintenanceFilter)}
          options={FILTERS.map((s) => ({ value: s, label: t(`admin:maintenance.filter.${s}`) }))}
          containerClassName="w-48"
        />
        <SelectField
          label={t('admin:maintenance.category')}
          value={category}
          onChange={(e) => setCategory(e.target.value as MaintenanceCategory | '')}
          options={[{ value: '', label: t('admin:maintenance.filter.all') }, ...MAINTENANCE_CATEGORIES.map((c) => ({ value: c, label: t(`domain:maintenanceCategory.${c}`) }))]}
          containerClassName="w-48"
        />
      </div>

      {error && !isLoading ? (
        <ErrorState message={t('admin:maintenance.errorLoading')} onRetry={() => void refetch()} />
      ) : isLoading ? (
        showSkeleton ? <Skeleton variant="row" /> : null
      ) : paged.total === 0 ? (
        <EmptyState icon={<Wrench className="h-icon-lg w-icon-lg text-tertiary" aria-hidden="true" />} title={t('admin:maintenance.empty')} />
      ) : (
        <>
          <Table stacked>
            <caption className="sr-only">{t('admin:maintenance.title')}</caption>
            <thead>
              <tr>
                <TableHeaderCell>{t('admin:maintenance.renter')}</TableHeaderCell>
                <TableHeaderCell>{t('admin:maintenance.category')}</TableHeaderCell>
                <TableHeaderCell>{t('admin:maintenance.urgency')}</TableHeaderCell>
                <TableHeaderCell>{t('admin:maintenance.sent')}</TableHeaderCell>
                <TableHeaderCell>{t('admin:maintenance.request')}</TableHeaderCell>
                <TableHeaderCell>{t('admin:maintenance.status')}</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">{t('admin:maintenance.open')}</span>
                </TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((r) => (
                <tr key={r.id}>
                  <TableCell>
                    <span className="flex flex-col">
                      <span className="type-body-s-strong text-primary">{r.renter?.full_name}</span>
                      {r.bed && <span className="type-caption text-secondary">{`${r.bed.room} – ${r.bed.label}`}</span>}
                    </span>
                  </TableCell>
                  <TableCell>{t(`domain:maintenanceCategory.${r.category}`)}</TableCell>
                  <TableCell>
                    {r.urgency === 'urgent' ? (
                      <span className="inline-flex items-center gap-1 type-label-xs text-danger">
                        <AlertTriangle className="h-icon-sm w-icon-sm" aria-hidden="true" />
                        {t('domain:maintenanceUrgency.urgent')}
                      </span>
                    ) : (
                      t(`domain:maintenanceUrgency.${r.urgency}`)
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{f.date(r.created_at)}</TableCell>
                  <TableCell>
                    <span className="line-clamp-2 max-w-[36ch] text-secondary">{r.description}</span>
                  </TableCell>
                  <TableCell variant="badge">
                    <MaintenanceStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell variant="actions">
                    <Button variant="secondary" aria-label={t('admin:maintenance.openLabel', { category: t(`domain:maintenanceCategory.${r.category}`), name: r.renter?.full_name ?? '' })} onClick={() => setSelected(r)}>
                      {t('admin:maintenance.open')}
                    </Button>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('admin:maintenance.title') })} />
        </>
      )}
      </>
      )}
      </div>

      {selected && (
        <RequestModal
          key={selected.id}
          request={selected}
          onChange={setSelected}
          onClose={() => setSelected(null)}
          onScheduleFix={() => {
            setFixing(selected);
            setSelected(null);
          }}
        />
      )}
      {fixing && (
        <ScheduleEventModal
          maintenance
          date={manilaToday()}
          prefill={{
            requestId: fixing.id,
            title: t('admin:maintenance.fixTitle', { category: t(`domain:maintenanceCategory.${fixing.category}`), name: fixing.renter?.full_name ?? '' }).trim(),
            note: fixing.description.slice(0, 500), // the item note caps at 500; a request can run to 1000
          }}
          onClose={() => setFixing(null)}
        />
      )}
    </div>
  );
}
