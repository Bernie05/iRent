import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { AuthLayout } from './AuthLayout';
import { TextField } from '../../ui/TextField';
import { Button } from '../../ui/Button';
import { InlineAlert } from '../../ui/InlineAlert';
import { getSupabase } from '../../lib/supabase';
import { setPasswordSchema } from '../../validation/public';

type LinkState = 'checking' | 'valid' | 'invalid';

/** Reads the link session (implicit flow, D-15i): the fragment carries the session or an error_code. */
function useLinkSession(): LinkState {
  const [state, setState] = useState<LinkState>('checking');

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search.replace(/^\?/, ''));
    if (params.get('error') || params.get('error_code')) {
      setState('invalid');
      return;
    }

    const { data } = getSupabase().auth.onAuthStateChange((event, session: Session | null) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        setState(session ? 'valid' : 'invalid');
        if (session) window.history.replaceState(null, '', window.location.pathname);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}

/** R49: Set password from an invite/recovery link. Never shows the form for an invalid link (SC-52). */
export function SetPasswordScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const linkState = useLinkSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = setPasswordSchema.safeParse({ password, confirm });
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
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) {
        setFormError(t('errors:INTERNAL'));
        return;
      }
      navigate('/', { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  if (linkState === 'checking') {
    return (
      <AuthLayout title={t('auth:savePassword')}>
        <p className="type-body-s text-secondary" aria-live="polite">
          {t('loading')}
        </p>
      </AuthLayout>
    );
  }

  if (linkState === 'invalid') {
    return (
      <AuthLayout title={t('auth:savePassword')}>
        <InlineAlert tone="error">{t('auth:invalidLink')}</InlineAlert>
        <Link to="/forgot-password" className="w-fit">
          <Button variant="secondary">{t('auth:requestNewLink')}</Button>
        </Link>
        <p className="type-body-s text-tertiary">{t('auth:invalidLinkHint')}</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth:savePassword')}>
      {formError && <InlineAlert tone="error">{formError}</InlineAlert>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('auth:newPassword')}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password ? t(fieldErrors.password) : undefined}
          required
        />
        <TextField
          label={t('auth:confirmPassword')}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fieldErrors.confirm ? t(fieldErrors.confirm) : undefined}
          required
        />
        <Button type="submit" loading={submitting} loadingText={t('common:saving')} disabled={submitting}>
          {t('auth:savePassword')}
        </Button>
      </form>
    </AuthLayout>
  );
}
