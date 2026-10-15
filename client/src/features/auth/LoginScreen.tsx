import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { TextField } from '../../ui/TextField';
import { Button } from '../../ui/Button';
import { InlineAlert } from '../../ui/InlineAlert';
import { getSupabase } from '../../lib/supabase';
import { loginSchema } from '../../validation/public';

const RATE_LIMIT_STATUS = 429;

/** R11, R12, R14: email/password sign-in, then role routing happens via AppBootstrap + ProtectedRoute. */
export function LoginScreen() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const expired = params.get('reason') === 'session_expired';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] = issue.message;
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) {
        setFormError(
          (error as { status?: number }).status === RATE_LIMIT_STATUS ? t('auth:tooManyAttempts') : t('auth:wrongCredentials'),
        );
      }
      // On success, stay put: once /me loads, RedirectIfAuthenticated sends the user to `next` or their dashboard.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title={t('common:login')}>
      {expired && (
        <InlineAlert tone="warning" className="mb-1">
          {t('auth:sessionExpired')}
        </InlineAlert>
      )}
      {formError && (
        <InlineAlert tone="error" className="mb-1">
          {formError}
        </InlineAlert>
      )}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('auth:email')}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email ? t(fieldErrors.email) : undefined}
          required
        />
        <TextField
          label={t('auth:password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password ? t(fieldErrors.password) : undefined}
          required
        />
        <Link to="/forgot-password" className="inline-flex min-h-touch items-center w-fit type-label-s text-brand underline">
          {t('auth:forgotPassword')}
        </Link>
        <Button type="submit" loading={submitting} loadingText={t('common:sending')} disabled={submitting}>
          {t('common:login')}
        </Button>
      </form>
    </AuthLayout>
  );
}
