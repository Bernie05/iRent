import { useState } from 'react';
import { Button } from '../../ui/Button';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { CancelViewingDialog, ScheduleModal } from './inquiries/ScheduleModal';
import { ViewingCalendar } from './inquiries/ViewingCalendar';
import { Pagination, usePaged } from '../../ui/Pagination';
import { useTranslation } from 'react-i18next';
import { useGetInquiriesQuery, useUpdateInquiryMutation } from '../../services/endpoints/admin';
import type { Inquiry, InquiryStatus } from '../../types/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../ui/uiSlice';
import { SelectField } from '../../ui/TextField';
import { FilterChip } from '../../ui/Tabs';
import { StatusBadge } from '../../ui/StatusBadge';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { Megaphone } from '../../ui/icons';
import { useToast } from '../../ui/ToastProvider';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';

const STATUSES: InquiryStatus[] = ['new', 'contacted', 'scheduled', 'closed'];
const STATUS_TONE = { new: 'info', contacted: 'warning', scheduled: 'success', closed: 'neutral' } as const;

interface ViewingActions {
  onSchedule: (i: Inquiry) => void;
  onCancel: (i: Inquiry) => void;
}

function InquiryCard({ inquiry, onSchedule, onCancel }: { inquiry: Inquiry } & ViewingActions) {
  const { t } = useTranslation();
  const toast = useToast();
  const language = useAppSelector(selectLanguage);
  const [updateInquiry] = useUpdateInquiryMutation();

  async function onStatus(status: InquiryStatus) {
    try {
      await updateInquiry({ id: inquiry.id, status }).unwrap();
      toast.show('success', t('admin:inquiries.saved'));
    } catch {
      toast.show('error', t('errors:UNKNOWN'));
    }
  }

  return (
    <article aria-label={inquiry.name} className="flex flex-col gap-3 rounded-lg border bg-surface p-4 shadow-elevation-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="type-h3 text-primary">{inquiry.name}</h2>
            <StatusBadge tone={STATUS_TONE[inquiry.status]}>{t(`domain:inquiryStatus.${inquiry.status}`)}</StatusBadge>
          </div>
          <p className="type-body-s flex flex-wrap gap-x-3 text-secondary">
            <a href={`tel:${inquiry.phone.replace(/\s/g, '')}`} className="inline-flex min-h-touch items-center text-brand underline hover:no-underline">
              {inquiry.phone}
            </a>
            {inquiry.email && (
              <a href={`mailto:${inquiry.email}`} className="inline-flex min-h-touch items-center break-all text-brand underline hover:no-underline">
                {inquiry.email}
              </a>
            )}
          </p>
          {inquiry.preferred_date && (
            <p className="type-body-s text-secondary">{t('admin:inquiries.preferredDate', { date: formatDate(inquiry.preferred_date, { language }) })}</p>
          )}
          <p className="type-caption text-tertiary">{t('admin:inquiries.received', { date: formatDateTime(inquiry.created_at, { language }) })}</p>
        </div>
        <SelectField
          label={t('admin:inquiries.status')}
          options={STATUSES.map((s) => ({ value: s, label: t(`domain:inquiryStatus.${s}`) }))}
          value={inquiry.status}
          onChange={(e) => void onStatus(e.target.value as InquiryStatus)}
          containerClassName="w-40"
        />
      </div>
      {inquiry.status === 'scheduled' && inquiry.scheduled_at ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-status-success-bg px-3 py-2">
          <p className="type-body-s-strong text-status-success-fg">
            {t('admin:viewings.on', { when: formatDateTime(inquiry.scheduled_at, { language }) })}
            {inquiry.schedule_note && <span className="block type-caption font-normal">{inquiry.schedule_note}</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" aria-label={t('admin:viewings.rescheduleFor', { name: inquiry.name })} onClick={() => onSchedule(inquiry)}>
              {t('admin:viewings.reschedule')}
            </Button>
            <Button variant="ghost" aria-label={t('admin:viewings.cancelFor', { name: inquiry.name })} onClick={() => onCancel(inquiry)}>
              {t('admin:viewings.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        inquiry.status !== 'closed' && (
          <Button variant="secondary" className="w-fit" aria-label={t('admin:viewings.scheduleFor', { name: inquiry.name })} onClick={() => onSchedule(inquiry)}>
            {t('admin:viewings.schedule')}
          </Button>
        )
      )}
      {/* E19: long messages wrap instead of overflowing the card. */}
      {inquiry.message && <p className="type-body-m whitespace-pre-line break-words text-primary [overflow-wrap:anywhere]">{inquiry.message}</p>}
    </article>
  );
}

/**
 * R40 (S13): the inquiry inbox, newest first, with status chips and an optimistic status select; plus (2026-10-15) a
 * List / Calendar toggle and viewing scheduling (schedule, reschedule, cancel) with mock emails.
 */
export function AdminInquiriesPage() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useGetInquiriesQuery();
  const showSkeleton = useDelayedFlag(isLoading);
  const [filter, setFilter] = useState<InquiryStatus | 'all'>('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [scheduling, setScheduling] = useState<Inquiry | null>(null);
  const [cancelling, setCancelling] = useState<Inquiry | null>(null);

  const paged = usePaged(filter === 'all' ? (data ?? []) : (data ?? []).filter((i) => i.status === filter), 10, filter);

  if (error && !isLoading) {
    return <ErrorState message={t('admin:inquiries.errorLoading')} onRetry={() => void refetch()} />;
  }

  const all = data ?? [];
  const rows = filter === 'all' ? all : all.filter((i) => i.status === filter);
  const countOf = (s: InquiryStatus) => all.filter((i) => i.status === s).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-h2 text-primary">{t('admin:inquiries.title')}</h1>
        <SegmentedControl
          label={t('admin:viewings.viewLabel')}
          options={[
            { value: 'list', label: t('admin:viewings.list') },
            { value: 'calendar', label: t('admin:viewings.calendar') },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {view === 'calendar' ? (
        <ViewingCalendar inquiries={all} onSchedule={setScheduling} onCancel={setCancelling} />
      ) : (
      <>
      <div role="group" aria-label={t('admin:inquiries.filterLabel')} className="flex flex-wrap gap-2">
        <FilterChip label={t('admin:inquiries.all')} active={filter === 'all'} onClick={() => setFilter('all')} />
        {STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={t('admin:inquiries.chip', { label: t(`domain:inquiryStatus.${s}`), count: countOf(s) })}
            active={filter === s}
            onClick={() => setFilter(s)}
          />
        ))}
      </div>

      {isLoading ? (
        showSkeleton ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="row" />
            ))}
          </div>
        ) : null
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-icon-lg w-icon-lg text-tertiary" aria-hidden="true" />}
          title={
            filter === 'all'
              ? t('admin:inquiries.empty')
              : t('admin:inquiries.emptyFilter', { status: t(`domain:inquiryStatus.${filter}`).toLowerCase() })
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {paged.rows.map((i) => (
            <InquiryCard key={i.id} inquiry={i} onSchedule={setScheduling} onCancel={setCancelling} />
          ))}
        </div>
      )}
      <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('admin:inquiries.title') })} />
      </>
      )}
      {scheduling && <ScheduleModal key={scheduling.id} inquiry={scheduling} all={all} onClose={() => setScheduling(null)} />}
      <CancelViewingDialog inquiry={cancelling} onClose={() => setCancelling(null)} />
    </div>
  );
}
