import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGetGreetingSettingsQuery, useGetSettingsQuery, useUpdateGreetingSettingsMutation, useUpdateSettingsMutation } from '../../services/endpoints/admin';
import type { ExternalMethod, GreetingSettings, ReminderType, Settings } from '../../types/api';
import { greetingSchema, settingsSchema } from '../../validation/admin';
import { toFieldErrors } from '../../validation/common';
import { isApiError, fieldErrors } from '../../services/errors';
import { Button } from '../../ui/Button';
import { TextareaField, TextField } from '../../ui/TextField';
import { Checkbox } from '../../ui/Checkbox';
import { FileUpload } from '../../ui/FileUpload';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { InlineAlert } from '../../ui/InlineAlert';
import { useToast } from '../../ui/ToastProvider';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { BirthdayGreeting } from '../portal/BirthdayGreeting';

const REMINDERS: ReminderType[] = ['due_minus_3', 'due_today', 'overdue_1', 'overdue_3', 'overdue_7'];

/** Object URL for a picked file, revoked when the file changes. */
function useObjectUrl(file: File | null): string | null {
  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);
  return objectUrl;
}

/** The picked file, else the saved QR. */
function QrPreview({ file, savedUrl, alt }: { file: File | null; savedUrl: string | null; alt: string }) {
  const src = useObjectUrl(file) ?? savedUrl;
  return src ? <img src={src} alt={alt} className="h-32 w-32 rounded-md border object-contain" /> : null;
}

function SettingsForm({ settings }: { settings: Settings }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [updateSettings, { isLoading: isSaving }] = useUpdateSettingsMutation();

  const [enabled, setEnabled] = useState(settings.reminders_enabled);
  const [types, setTypes] = useState<ReminderType[]>(settings.reminder_types);
  const [accounts, setAccounts] = useState(settings.payment_accounts.map(({ qr_url: _qr, ...a }) => a));
  const [qrFiles, setQrFiles] = useState<Partial<Record<ExternalMethod, File | null>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const toggleType = (type: ReminderType, on: boolean) =>
    setTypes((current) => (on ? REMINDERS.filter((r) => r === type || current.includes(r)) : current.filter((r) => r !== type)));
  const setAccount = (i: number, patch: Partial<(typeof accounts)[number]>) =>
    setAccounts((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;
    const parsed = settingsSchema.safeParse({ reminders_enabled: enabled, reminder_types: types, payment_accounts: accounts });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    const files = Object.fromEntries(Object.entries(qrFiles).filter(([, f]) => f)) as Partial<Record<ExternalMethod, File>>;
    try {
      await updateSettings({ ...parsed.data, qr_files: files }).unwrap();
      toast.show('success', t('admin:settings.saved'));
      setQrFiles({});
    } catch (err) {
      if (isApiError(err) && (err.code === 'FILE_TOO_LARGE' || err.code === 'INVALID_FILE_TYPE')) {
        setFormError(t(`errors:${err.code}`));
        return;
      }
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) {
        setErrors(fe);
        return;
      }
      setFormError(t('errors:UNKNOWN'));
    }
  }

  const errorAt = (key: string) => (errors[key] ? t(errors[key]) : undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError && <InlineAlert tone="error">{formError}</InlineAlert>}

      <section aria-labelledby="reminders-title" className="flex flex-col gap-3 rounded-lg border bg-surface p-4 shadow-elevation-1">
        <h2 id="reminders-title" className="type-h3 text-primary">
          {t('admin:settings.remindersTitle')}
        </h2>
        <p className="type-body-s text-secondary">{t('admin:settings.remindersHint')}</p>
        <Checkbox id="reminders-enabled" role="switch" label={t('admin:settings.remindersEnabled')} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <fieldset disabled={!enabled} className="flex flex-col pl-7 disabled:opacity-50">
          <legend className="type-label-s text-secondary">{t('admin:settings.reminderDays')}</legend>
          {REMINDERS.map((r) => (
            <Checkbox
              key={r}
              id={`reminder-${r}`}
              label={t(`admin:settings.reminder.${r}`)}
              checked={types.includes(r)}
              onChange={(e) => toggleType(r, e.target.checked)}
            />
          ))}
        </fieldset>
      </section>

      <section aria-labelledby="accounts-title" className="flex flex-col gap-3">
        <div>
          <h2 id="accounts-title" className="type-h3 text-primary">
            {t('admin:settings.accountsTitle')}
          </h2>
          <p className="type-body-s text-secondary">{t('admin:settings.accountsHint')}</p>
        </div>
        {accounts.map((a, i) => {
          const method = t(`domain:method.${a.method}`);
          return (
            <fieldset key={a.method} className="flex flex-col gap-3 rounded-lg border bg-surface p-4 shadow-elevation-1">
              <legend className="sr-only">{method}</legend>
              <h3 className="type-h4 text-primary" aria-hidden="true">
                {method}
              </h3>
              <Checkbox
                id={`account-${a.method}-enabled`}
                role="switch"
                label={t('admin:settings.accountEnabled', { method })}
                checked={a.enabled}
                onChange={(e) => setAccount(i, { enabled: e.target.checked })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label={t('admin:settings.accountName')}
                  value={a.account_name}
                  onChange={(e) => setAccount(i, { account_name: e.target.value })}
                  maxLength={80}
                  error={errorAt(`payment_accounts.${i}.account_name`)}
                />
                <TextField
                  label={t('admin:settings.accountNumber')}
                  value={a.account_number}
                  onChange={(e) => setAccount(i, { account_number: e.target.value })}
                  maxLength={40}
                  error={errorAt(`payment_accounts.${i}.account_number`)}
                />
              </div>
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <FileUpload
                    id={`account-${a.method}-qr`}
                    label={t('admin:settings.qr')}
                    value={qrFiles[a.method] ?? null}
                    onChange={(file) => setQrFiles((q) => ({ ...q, [a.method]: file }))}
                  />
                </div>
                <QrPreview
                  file={qrFiles[a.method] ?? null}
                  savedUrl={settings.payment_accounts.find((p) => p.method === a.method)?.qr_url ?? null}
                  alt={t('admin:settings.qrAlt', { method })}
                />
              </div>
            </fieldset>
          );
        })}
      </section>

      <Button type="submit" loading={isSaving} loadingText={t('common:saving')} disabled={isSaving} className="w-fit">
        {t('admin:settings.save')}
      </Button>
    </form>
  );
}

/**
 * Proposed (birthday greeting): one template for everyone (title, message with {name}, optional http(s) button, optional
 * image, on/off) with a live preview using a sample name. Its own form and Save, so the R42 settings stay as they are.
 */
function GreetingForm({ saved }: { saved: GreetingSettings }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [save, { isLoading: isSaving }] = useUpdateGreetingSettingsMutation();
  const [form, setForm] = useState({
    enabled: saved.enabled,
    title: saved.title,
    message: saved.message,
    link_label: saved.link_label ?? '',
    link_url: saved.link_url ?? '',
  });
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const imageUrl = useObjectUrl(image) ?? (removeImage ? null : saved.image_url);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const fill = (text: string) => text.replaceAll('{name}', t('admin:settings.greeting.previewName'));
  const errorAt = (key: string) => (errors[key] ? t(errors[key]) : undefined);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;
    const parsed = greetingSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await save({ ...parsed.data, image, remove_image: removeImage && !image }).unwrap();
      toast.show('success', t('admin:settings.greeting.saved'));
    } catch (err) {
      if (isApiError(err) && (err.code === 'FILE_TOO_LARGE' || err.code === 'INVALID_FILE_TYPE')) {
        setFormError(t(`errors:${err.code}`));
        return;
      }
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      else setFormError(t('errors:UNKNOWN'));
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby="greeting-title" className="flex flex-col gap-4 rounded-lg border bg-surface p-4 shadow-elevation-1">
      <div>
        <h2 id="greeting-title" className="type-h3 text-primary">
          {t('admin:settings.greeting.title')}
        </h2>
        <p className="type-body-s text-secondary">{t('admin:settings.greeting.hint')}</p>
      </div>
      {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
      <Checkbox id="greeting-enabled" role="switch" label={t('admin:settings.greeting.enabled')} checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <TextField label={t('admin:settings.greeting.fieldTitle')} value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} required error={errorAt('title')} />
          <TextareaField label={t('admin:settings.greeting.message')} value={form.message} onChange={(e) => set({ message: e.target.value })} maxLength={1000} required error={errorAt('message')} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={t('admin:settings.greeting.linkLabel')} value={form.link_label} onChange={(e) => set({ link_label: e.target.value })} maxLength={30} error={errorAt('link_label')} />
            <TextField
              label={t('admin:settings.greeting.linkUrl')}
              type="url"
              inputMode="url"
              placeholder="https://"
              value={form.link_url}
              onChange={(e) => set({ link_url: e.target.value })}
              maxLength={500}
              helper={t('admin:settings.greeting.linkUrlHelper')}
              error={errorAt('link_url')}
            />
          </div>
          <FileUpload id="greeting-image" label={t('admin:settings.greeting.image')} value={image} onChange={setImage} />
          {saved.image_url && !image && (
            <Checkbox id="greeting-remove-image" label={t('admin:settings.greeting.removeImage')} checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="type-h4 text-primary">{t('admin:settings.greeting.preview')}</h3>
          <p className="type-caption text-secondary">
            {form.enabled ? t('admin:settings.greeting.previewHint', { name: t('admin:settings.greeting.previewName') }) : t('admin:settings.greeting.off')}
          </p>
          <div className={form.enabled ? '' : 'opacity-60'}>
            <BirthdayGreeting
              heading="h3"
              greeting={{ title: fill(form.title), message: fill(form.message), link_label: form.link_label.trim() || null, link_url: form.link_url.trim() || null, image_url: imageUrl }}
            />
          </div>
        </div>
      </div>
      <Button type="submit" loading={isSaving} loadingText={t('common:saving')} disabled={isSaving} className="w-fit">
        {t('admin:settings.greeting.save')}
      </Button>
    </form>
  );
}

function GreetingSection() {
  const { t } = useTranslation();
  const { data, error, isLoading, refetch } = useGetGreetingSettingsQuery();
  if (error && !isLoading) return <ErrorState message={t('admin:settings.greeting.errorLoading')} onRetry={() => void refetch()} />;
  // Re-seeded from the server after each save (updated_at changes).
  return data ? <GreetingForm key={data.updated_at} saved={data} /> : null;
}

/** R42 (S15): reminder switches and the payment accounts (multipart PUT /settings). */
export function AdminSettingsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useGetSettingsQuery();
  const showSkeleton = useDelayedFlag(isLoading);

  if (error && !isLoading) {
    return <ErrorState message={t('admin:settings.errorLoading')} onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="type-h2 text-primary">{t('admin:settings.title')}</h1>
      {data ? (
        // Re-seeded from the server after each save (updated_at changes).
        <>
          <SettingsForm key={data.updated_at} settings={data} />
          <GreetingSection />
        </>
      ) : showSkeleton ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
