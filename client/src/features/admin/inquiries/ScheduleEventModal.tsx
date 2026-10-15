import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGetRentersQuery, useSaveScheduleEventMutation, useScheduleViewingMutation } from '../../../services/endpoints/admin';
import { fieldErrors } from '../../../services/errors';
import { isIsoDate } from '../../../lib/time';
import type { Inquiry, RenterRow, ScheduleEvent } from '../../../types/api';
import { VIEWING_SLOTS } from '../../../validation/admin';
import { V } from '../../../validation/common';
import { Button } from '../../../ui/Button';
import { Checkbox, Switch } from '../../../ui/Checkbox';
import { InlineAlert } from '../../../ui/InlineAlert';
import { Modal } from '../../../ui/Modal';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { SelectField, TextareaField, TextField } from '../../../ui/TextField';
import { useToast } from '../../../ui/ToastProvider';
import { RenterPicker } from '../../shared/AssignBedModal';
import { manilaParts } from './calendar';
import { slotLabel } from './ScheduleModal';

type Kind = 'viewing' | 'renter' | 'other';
const PURPOSES = ['move_in', 'contract', 'payment', 'inspection', 'other'] as const;
type Purpose = (typeof PURPOSES)[number];

/** "Schedule fix" from a renter request: the item starts with these and links the request on create. */
export interface FixPrefill {
  requestId: string;
  title: string;
  note: string;
}

/**
 * Add or edit a schedule item from a calendar (2026-10-15). Inquiries: Viewing (an open inquiry; the existing viewing
 * flow) or Renter (renter combobox, a purpose that drafts the title, optional "Email the renter"). Maintenance page
 * (`maintenance`): the "other" type only, shown as Maintenance, with "Post to renters" on by default (a linked maintenance
 * notice kept in sync by the server, emailed once if asked); off by default for a "Schedule fix", whose note is the
 * renter's own request text. Date, 30-minute slot or All day, optional end, note.
 */
export function ScheduleEventModal({
  date,
  editing,
  inquiries = [],
  maintenance = false,
  prefill,
  onClose,
}: { date: string; editing?: ScheduleEvent; inquiries?: Inquiry[]; maintenance?: boolean; prefill?: FixPrefill; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: renters } = useGetRentersQuery();
  const [saveEvent, { isLoading: isSaving }] = useSaveScheduleEventMutation();
  const [scheduleViewing, { isLoading: isScheduling }] = useScheduleViewingMutation();
  const start = editing ? manilaParts(editing.starts_at) : null;
  const kinds: Kind[] = maintenance ? ['other'] : editing ? ['renter'] : ['viewing', 'renter'];
  const [kind, setKind] = useState<Kind>(editing?.type ?? kinds[kinds.length - 1]);
  const [inquiryId, setInquiryId] = useState('');
  const [picked, setPicked] = useState<RenterRow | null>(null);
  const [purpose, setPurpose] = useState<Purpose>('move_in');
  const [title, setTitle] = useState(editing?.title ?? prefill?.title ?? '');
  const [titleEdited, setTitleEdited] = useState(Boolean(editing || prefill));
  const [form, setForm] = useState({
    date: start?.date ?? date,
    allDay: editing?.all_day ?? false,
    time: editing && !editing.all_day ? start!.time : '10:00',
    endTime: editing?.ends_at ? manilaParts(editing.ends_at).time : '',
    note: editing?.note ?? prefill?.note ?? '',
    notify: editing?.notify_renter ?? false,
    post: editing ? Boolean(editing.announcement_id) : maintenance && !prefill,
    emailRenters: false,
  });
  // Already posted: edits update the notice, never re-email (renters were emailed once, if at all).
  const linked = Boolean(editing?.announcement_id);
  const posting = kind === 'other' && form.post;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const isLoading = isSaving || isScheduling;
  const open = inquiries.filter((i) => i.status === 'new' || i.status === 'contacted');
  // The picked renter, or (when editing) the event's renter once the renters list has loaded.
  const renter = picked ?? (editing?.renter ? (renters?.find((r) => r.id === editing.renter!.id) ?? null) : null);
  const draftTitle = kind === 'renter' && renter ? `${t(`admin:schedule.purpose.${purpose}`)}: ${renter.full_name}` : '';
  const shownTitle = titleEdited ? title : draftTitle;
  const err = (k: string) => (errors[k] ? t(errors[k]) : undefined);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((s) => ({ ...s, [k]: v }));

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!isIsoDate(form.date)) e.date = V.dateInvalid;
    if (kind === 'viewing') {
      if (!inquiryId) e.inquiry = V.choiceRequired;
      return e;
    }
    if (shownTitle.trim().length < 2 || shownTitle.trim().length > 120) e.title = V.titleLength;
    if (kind === 'renter' && !renter) e.renter = 'admin:schedule.pickRenter';
    if (!form.allDay && form.endTime && form.endTime <= form.time) e.endTime = V.endBeforeStart;
    // The renter notice takes the note as its message and the item's time as its window.
    if (posting && !form.note.trim()) e.note = 'admin:schedule.postNeedsNote';
    if (posting && !form.allDay && !form.endTime) e.endTime = 'admin:schedule.postNeedsEnd';
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (isLoading) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setFormError(null);
    try {
      if (kind === 'viewing') {
        await scheduleViewing({ id: inquiryId, scheduled_at: `${form.date}T${form.time}:00+08:00`, note: form.note.trim() || undefined }).unwrap();
        toast.show('success', t('admin:viewings.scheduled'));
      } else {
        const r = await saveEvent({
          id: editing?.id,
          type: kind,
          title: shownTitle.trim(),
          starts_at: `${form.date}T${form.allDay ? '00:00' : form.time}:00+08:00`,
          ends_at: !form.allDay && form.endTime ? `${form.date}T${form.endTime}:00+08:00` : null,
          all_day: form.allDay,
          renter_id: kind === 'renter' ? renter!.id : null,
          note: form.note.trim() || undefined,
          notify_renter: kind === 'renter' && form.notify,
          post_to_renters: posting,
          email_renters: posting && !linked && form.emailRenters,
          ...(prefill && !editing ? { maintenance_request_id: prefill.requestId } : {}),
        }).unwrap();
        const extra = r.notified.renter ? 'renterEmailed' : r.notified.renters ? 'postedEmailed' : r.event?.announcement_id ? 'posted' : null;
        toast.show('success', `${editing ? t('admin:schedule.savedEdit') : t('admin:schedule.saved')}${extra ? ` ${t(`admin:schedule.${extra}`)}` : ''}`);
      }
      onClose();
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setFormError(Object.values(fields).join(' '));
      else setFormError(t('errors:UNKNOWN'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t(maintenance ? (editing ? 'admin:maintenance.editTitle' : 'admin:maintenance.addTitle') : editing ? 'admin:schedule.editTitle' : 'admin:schedule.addTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="schedule-event-form" loading={isLoading} loadingText={t('common:saving')}>
            {t('common:save')}
          </Button>
        </>
      }
    >
      <form id="schedule-event-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
        {kinds.length > 1 && (
          <SegmentedControl<Kind> label={t('admin:schedule.type')} value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: t(`admin:schedule.kind.${k}`) }))} />
        )}

        {kind === 'viewing' && (
          <SelectField
            label={t('admin:schedule.inquiry')}
            placeholder={open.length ? t('admin:schedule.inquiryPlaceholder') : t('admin:viewings.noOpen')}
            value={inquiryId}
            onChange={(e) => setInquiryId(e.target.value)}
            options={open.map((i) => ({ value: i.id, label: `${i.name} · ${i.phone}` }))}
            error={err('inquiry')}
            required
          />
        )}

        {kind === 'renter' && (
          <>
            <RenterPicker
              key={renter?.id ?? 'none'}
              value={renter}
              onChange={setPicked}
              error={err('renter')}
              filter={(r) => r.status === 'active'}
              text={{
                hint: (count) => t('admin:schedule.renterHint', { count }),
                empty: t('admin:schedule.noRenters'),
                listLabel: t('admin:schedule.renterList'),
                placeholder: t('admin:schedule.renterPlaceholder'),
              }}
            />
            <SelectField
              label={t('admin:schedule.purposeLabel')}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as Purpose)}
              options={PURPOSES.map((p) => ({ value: p, label: t(`admin:schedule.purpose.${p}`) }))}
            />
          </>
        )}

        {kind !== 'viewing' && (
          <TextField
            label={t('admin:schedule.titleLabel')}
            placeholder={kind === 'other' ? t('admin:schedule.titlePlaceholder') : undefined}
            maxLength={120}
            value={shownTitle}
            onChange={(e) => {
              setTitleEdited(true);
              setTitle(e.target.value);
            }}
            error={err('title')}
            required
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('admin:viewings.date')} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} error={err('date')} required />
          {!form.allDay && (
            <SelectField label={t('admin:viewings.time')} value={form.time} onChange={(e) => set('time', e.target.value)} options={VIEWING_SLOTS.map((s) => ({ value: s, label: slotLabel(s) }))} required />
          )}
        </div>
        {kind !== 'viewing' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Switch id="schedule-all-day" label={t('admin:schedule.allDay')} checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} />
            {!form.allDay && (
              <SelectField
                label={t('admin:schedule.endTime')}
                value={form.endTime}
                onChange={(e) => set('endTime', e.target.value)}
                options={[{ value: '', label: t('admin:schedule.noEnd') }, ...VIEWING_SLOTS.filter((s) => s > form.time).map((s) => ({ value: s, label: slotLabel(s) }))]}
                error={err('endTime')}
              />
            )}
          </div>
        )}
        <TextareaField label={t('admin:viewings.note')} rows={2} maxLength={500} value={form.note} onChange={(e) => set('note', e.target.value)} error={err('note')} />
        {kind === 'renter' && (
          <div className="flex flex-col gap-1">
            <Checkbox id="schedule-notify" label={t('admin:schedule.notify')} checked={form.notify} onChange={(e) => set('notify', e.target.checked)} />
            <p className="type-caption text-secondary">{t('admin:schedule.notifyHelper')}</p>
          </div>
        )}
        {kind === 'other' && (
          <div className="flex flex-col gap-2">
            <Switch id="schedule-post" label={t('admin:schedule.post')} checked={form.post} onChange={(e) => set('post', e.target.checked)} />
            <p className="type-caption text-secondary">
              {form.post ? t('admin:schedule.postHelper') : linked ? t('admin:schedule.postOffRemoves') : t('admin:schedule.otherHelper')}
            </p>
            {form.post &&
              (linked ? (
                <p className="type-caption text-secondary">{t('admin:schedule.postNoReEmail')}</p>
              ) : (
                <div className="flex flex-col gap-1">
                  <Checkbox id="schedule-email-renters" label={t('admin:schedule.emailRenters')} checked={form.emailRenters} onChange={(e) => set('emailRenters', e.target.checked)} />
                  <p className="type-caption text-secondary">{t('admin:announcements.sendEmailHint')}</p>
                </div>
              ))}
          </div>
        )}
      </form>
    </Modal>
  );
}
