import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from './hooks';
import { selectAuthStatus, selectProfile, profileLoaded } from '../features/auth/authSlice';
import { useGetMeQuery } from '../services/endpoints/public';
import { isApiError } from '../services/errors';
import { logout } from './logout';

/**
 * Loads `/me` once a Supabase session exists (F5). Two edge cases from D-15(c):
 * - 403 FORBIDDEN (profiles.is_active = false): sign out and show the disabled-account message.
 * - 401 UNAUTHENTICATED (auth user, no profile row): the normal R14 refresh-once flow already handles it.
 * Renders nothing until the initial session read resolves, so guards never see a false "logged out".
 */
export function AppBootstrap({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);
  const profile = useAppSelector(selectProfile);
  const meQuery = useGetMeQuery(undefined, { skip: status !== 'authenticated' });
  // logout() resets auth status and the API cache, so meQuery.error/status can't be relied on to keep
  // showing this message after the sign-out dispatch fires. Latch it locally instead.
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (meQuery.data) dispatch(profileLoaded(meQuery.data));
  }, [meQuery.data, dispatch]);

  useEffect(() => {
    if (meQuery.error && isApiError(meQuery.error) && meQuery.error.code === 'FORBIDDEN') {
      setDisabled(true);
      void logout(dispatch);
    }
  }, [meQuery.error, dispatch]);

  if (disabled) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <p role="alert" className="type-body-m text-danger">
          {t('auth:accountDisabled')}
        </p>
      </div>
    );
  }
  if (status === 'unknown') return null;
  if (status === 'authenticated' && !profile && !meQuery.error) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="type-body-m text-secondary" aria-live="polite">
          {t('loading')}
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
