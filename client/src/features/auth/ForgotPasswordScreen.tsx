import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { TextField } from '../../ui/TextField';
import { Button } from '../../ui/Button';
import { InlineAlert } from '../../ui/InlineAlert';
import { useForgotPasswordMutation } from '../../services/endpoints/public';
import { forgotPasswordSchema } from '../../validation/public';
import { isApiError } from '../../services/errors';

/** R50: always shows the same message regardless of whether the account exists. */
export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? null);
      return;
    }
    setFieldError(null);
    setFormError(null);
    try {
      await forgotPassword({ email }).unwrap();
      setSent(true);
    } catch (error) {
      setFormError(isApiError(error) && error.code === 'RATE_LIMITED' ? t('auth:tooManyAttempts') : t('errors:INTERNAL'));
    }
  }

  if (sent) {
    return (
      <AuthLayout title={t('auth:forgotPassword')}>
        <InlineAlert tone="success">{t('auth:resetLinkSent')}</InlineAlert>
        <Link to="/login" className="inline-flex min-h-touch items-center w-fit type-label-s text-brand underline">
          {t('auth:backToLogin')}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth:forgotPassword')}>
      {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('auth:email')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError ? t(fieldError) : undefined}
          required
        />
        <Button type="submit" loading={isLoading} loadingText={t('common:sending')} disabled={isLoading}>
          {t('auth:sendResetLink')}
        </Button>
        <Link to="/login" className="inline-flex min-h-touch items-center w-fit type-label-s text-brand underline">
          {t('auth:backToLogin')}
        </Link>
      </form>
    </AuthLayout>
  );
}
