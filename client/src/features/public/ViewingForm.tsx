import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextField, TextareaField, SelectField } from '../../ui/TextField';
import { Button } from '../../ui/Button';
import { InlineAlert } from '../../ui/InlineAlert';
import { useToast } from '../../ui/ToastProvider';
import { useCreateInquiryMutation, useGetAvailableBedsQuery } from '../../services/endpoints/public';
import { inquirySchema } from '../../validation/public';
import { toFieldErrors } from '../../validation/common';
import { isApiError, fieldErrors } from '../../services/errors';
import { formatPeso } from '../../lib/format';
import type { BunkType } from '../../types/api';

interface FormState {
  name: string;
  phone: string;
  email: string;
  preferred_date: string;
  message: string;
  bunk: BunkType | '';
  move_in: string;
  stay: string;
}

const EMPTY_FORM: FormState = { name: '', phone: '', email: '', preferred_date: '', message: '', bunk: '', move_in: '', stay: '' };
const BUNKS: BunkType[] = ['lower', 'upper'];
const STAYS = ['m1', 'm3', 'm6', 'm12'] as const;

interface ViewingFormProps {
  /** Also ask for bed type (with the live rate), move-in date and stay length (the hero/navbar modal). */
  withStayDetails?: boolean;
  /** Called after a successful submit (the modal closes itself). */
  onSuccess?: () => void;
}

/**
 * R8, R9, E1: the viewing request form, shared by the on-page section and the "Schedule a Viewing" modal.
 * POST /inquiries has no bed/move-in/stay fields, so those are folded into the message client-side (no API change);
 * the combined message is what gets validated (max 1000) and sent.
 */
export function ViewingForm({ withStayDetails = false, onSuccess }: ViewingFormProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [createInquiry, { isLoading }] = useCreateInquiryMutation();
  const { data: rates } = useGetAvailableBedsQuery(undefined, { skip: !withStayDetails });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function bunkLabel(bunk: BunkType) {
    const rate = rates?.find((r) => r.bunk_type === bunk)?.monthly_rate;
    const name = t(`domain:bunkType.${bunk}`);
    return rate === undefined ? name : t('public:viewingForm.bunkOption', { bed: name, rate: formatPeso(rate, { whole: true }) });
  }

  function message() {
    const details = [
      form.bunk && t('public:viewingForm.detailBed', { bed: t(`domain:bunkType.${form.bunk}`) }),
      form.move_in && t('public:viewingForm.detailMoveIn', { date: form.move_in }),
      form.stay && t('public:viewingForm.detailStay', { stay: t(`public:viewingForm.stays.${form.stay}`) }),
    ].filter(Boolean);
    return [details.join(' '), form.message.trim()].filter(Boolean).join('\n\n');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return; // E1: block a second submit from a double click
    const { name, phone, email, preferred_date } = form;
    const parsed = inquirySchema().safeParse({ name, phone, email, preferred_date, message: message() });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await createInquiry(parsed.data).unwrap();
      setForm(EMPTY_FORM);
      toast.show('success', t('public:viewingForm.success'));
      onSuccess?.();
    } catch (error) {
      if (isApiError(error) && error.code === 'VALIDATION_ERROR') {
        setErrors(fieldErrors(error));
        return;
      }
      setFormError(isApiError(error) && error.code === 'RATE_LIMITED' ? t('public:viewingForm.rateLimited') : t('errors:UNKNOWN'));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
      <form onSubmit={onSubmit} noValidate className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={t('public:viewingForm.name')}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name ? t(errors.name) : undefined}
          required
        />
        <TextField
          label={t('public:viewingForm.phone')}
          type="tel"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          error={errors.phone ? t(errors.phone) : undefined}
          required
        />
        <TextField
          label={t('public:viewingForm.email')}
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors.email ? t(errors.email) : undefined}
        />
        <TextField
          label={t('public:viewingForm.preferredDate')}
          type="date"
          value={form.preferred_date}
          onChange={(e) => set('preferred_date', e.target.value)}
          error={errors.preferred_date ? t(errors.preferred_date) : undefined}
        />
        {withStayDetails && (
          <>
            <SelectField
              containerClassName="sm:col-span-2"
              label={t('public:viewingForm.bunk')}
              value={form.bunk}
              onChange={(e) => set('bunk', e.target.value as FormState['bunk'])}
              options={[{ value: '', label: t('public:viewingForm.bunkAny') }, ...BUNKS.map((b) => ({ value: b, label: bunkLabel(b) }))]}
            />
            <TextField label={t('public:viewingForm.moveIn')} type="date" value={form.move_in} onChange={(e) => set('move_in', e.target.value)} />
            <SelectField
              label={t('public:viewingForm.stay')}
              value={form.stay}
              onChange={(e) => set('stay', e.target.value)}
              options={[{ value: '', label: t('public:viewingForm.stayAny') }, ...STAYS.map((s) => ({ value: s, label: t(`public:viewingForm.stays.${s}`) }))]}
            />
          </>
        )}
        <TextareaField
          containerClassName="sm:col-span-2"
          label={t('public:viewingForm.message')}
          value={form.message}
          onChange={(e) => set('message', e.target.value)}
          error={errors.message ? t(errors.message) : undefined}
        />
        <Button type="submit" loading={isLoading} loadingText={t('common:sending')} disabled={isLoading} className="w-full !rounded-none sm:col-span-2 sm:w-fit sm:px-8">
          {t('public:viewingForm.submit')}
        </Button>
      </form>
    </div>
  );
}
