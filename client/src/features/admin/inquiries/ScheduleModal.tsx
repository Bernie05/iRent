import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCancelViewingMutation, useScheduleViewingMutation } from '../../../services/endpoints/admin';
import { fieldErrors } from '../../../services/errors';
import { useFormat } from '../../../hooks/useFormat';
import { manilaToday } from '../../../lib/time';
import type { Inquiry, ViewingResult } from '../../../types/api';
import { scheduleViewingSchema, VIEWING_SLOTS } from '../../../validation/admin';
import { toFieldErrors } from '../../../validation/common';
import { Button } from '../../../ui/Button';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { InlineAlert } from '../../../ui/InlineAlert';
import { Modal } from '../../../ui/Modal';
import { SelectField, TextareaField, TextField } from '../../../ui/TextField';
import { useToast } from '../../../ui/ToastProvider';
import { clashesWith, manilaParts } from './calendar';
import { slotLabel } from '../../../lib/format';

// Lives in lib/format (also used by the maintenance window label, R72); re-exported for the calendar files.
export { slotLabel };

/** Toast line saying who was emailed (mock outbox; the real email service per the proposal). */
function useEmailLine() {
  const { t } = useTranslation();
  return (r: ViewingResult, kind: 'confirmation' | 'cancellation') =>
    r.notified.visitor
      ? t('admin:viewings.emailsBoth', { kind: t(`admin:viewings.kind.${kind}`) })
      : r.notified.visitor_skipped === 'cap'
        ? t('admin:viewings.emailsCap', { kind: t(`admin:viewings.kind.${kind}`) })
        : t('admin:viewings.emailsAdminOnly', { kind: t(`admin:viewings.kind.${kind}`) });
}

/**
 * Schedule or reschedule a viewing: date (default the visitor's preferred date), a 30-minute slot from 8 AM to 7 PM
 * (Manila) and a note. A clash with another viewing at the same time is a warning, not a block. Without a visitor email
 * the admin is told to call or text to confirm.
 */
export function ScheduleModal({ inquiry, all, onClose }: { inquiry: Inquiry; all: Inquiry[]; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const emailLine = useEmailLine();
  const [schedule, { isLoading }] = useScheduleViewingMutation();
  const today = manilaToday();
  const current = inquiry.scheduled_at ? manilaParts(inquiry.scheduled_at) : null;
  const [form, setForm] = useState({
    date: current?.date ?? (inquiry.preferred_date && inquiry.preferred_date >= today ? inquiry.preferred_date : today),
    time: current?.time ?? '10:00',
    note: inquiry.schedule_note ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const scheduledAt = `${form.date}T${form.time}:00+08:00`;
  const clashes = /^\d{4}-\d{2}-\d{2}$/.test(form.date) ? clashesWith(all, scheduledAt, inquiry.id) : [];
  const err = (k: string) => (errors[k] ? t(errors[k]) : undefined);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    const parsed = scheduleViewingSchema().safeParse(form);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      const r = await schedule({ id: inquiry.id, scheduled_at: scheduledAt, note: parsed.data.note }).unwrap();
      toast.show('success', `${current ? t('admin:viewings.rescheduled') : t('admin:viewings.scheduled')} ${emailLine(r, 'confirmation')}`);
      onClose();
    } catch (error) {
      const fields = fieldErrors(error);
      if (fields.scheduled_at) setErrors({ date: fields.scheduled_at });
      else setFormError(t('errors:UNKNOWN'));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={current ? t('admin:viewings.rescheduleTitle', { name: inquiry.name }) : t('admin:viewings.scheduleTitle', { name: inquiry.name })}
      description={inquiry.preferred_date ? t('admin:inquiries.preferredDate', { date: f.date(inquiry.preferred_date) }) : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" form="schedule-form" loading={isLoading} loadingText={t('common:saving')}>
            {current ? t('admin:viewings.saveReschedule') : t('admin:viewings.saveSchedule')}
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
        {!inquiry.email && (
          <InlineAlert tone="info">
            {t('admin:viewings.noEmail')}{' '}
            <a href={`tel:${inquiry.phone.replace(/\s/g, '')}`} className="font-semibold underline">
              {inquiry.phone}
            </a>{' '}
            {t('admin:viewings.toConfirm')}
          </InlineAlert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('admin:viewings.date')} type="date" min={today} value={form.date} onChange={(e) => setForm((v) => ({ ...v, date: e.target.value }))} error={err('date')} required />
          <SelectField
            label={t('admin:viewings.time')}
            value={form.time}
            onChange={(e) => setForm((v) => ({ ...v, time: e.target.value }))}
            options={VIEWING_SLOTS.map((s) => ({ value: s, label: slotLabel(s) }))}
            error={err('time')}
            required
          />
        </div>
        {clashes.length > 0 && <InlineAlert tone="warning">{t('admin:viewings.clash', { names: clashes.map((c) => c.name).join(', ') })}</InlineAlert>}
        <TextareaField label={t('admin:viewings.note')} helper={t('admin:viewings.noteHelper')} rows={2} maxLength={500} value={form.note} onChange={(e) => setForm((v) => ({ ...v, note: e.target.value }))} error={err('note')} />
      </form>
    </Modal>
  );
}

/** Cancel a viewing (shared confirmation): back to Contacted, and both sides are emailed. */
export function CancelViewingDialog({ inquiry, onClose }: { inquiry: Inquiry | null; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const emailLine = useEmailLine();
  const [cancel, { isLoading }] = useCancelViewingMutation();

  async function onConfirm() {
    if (!inquiry) return;
    try {
      const r = await cancel(inquiry.id).unwrap();
      toast.show('success', `${t('admin:viewings.cancelled')} ${emailLine(r, 'cancellation')}`);
      onClose();
    } catch {
      toast.show('error', t('errors:UNKNOWN'));
    }
  }

  return (
    <ConfirmDialog
      open={inquiry !== null}
      title={t('admin:viewings.cancelTitle')}
      body={inquiry?.scheduled_at ? t('admin:viewings.cancelBody', { name: inquiry.name, when: f.dateTime(inquiry.scheduled_at) }) : undefined}
      confirmLabel={t('admin:viewings.cancelConfirm')}
      dismissLabel={t('admin:viewings.keep')}
      busy={isLoading}
      onCancel={onClose}
      onConfirm={() => void onConfirm()}
    />
  );
}
