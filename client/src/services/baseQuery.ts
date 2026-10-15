import {
  fetchBaseQuery,
  type BaseQueryApi,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { normaliseFetchError, type ApiError } from './errors';

/** What the base query needs from the auth provider (Supabase in the app, a fake in tests). */
export interface AuthBridge {
  /** The current access token, or null when signed out. */
  getAccessToken(): Promise<string | null>;
  /** Tries one refresh. Resolves to the new access token, or null when the refresh failed. */
  refreshSession(): Promise<string | null>;
}

export interface ReauthOptions {
  baseUrl: string;
  auth: AuthBridge;
  /** Called once when a 401 cannot be recovered: log out, clear the cache, go to /login (R14). */
  onSessionExpired: (api: BaseQueryApi) => void;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export type AppBaseQuery = BaseQueryFn<string | FetchArgs, unknown, ApiError>;

function withAuthHeader(args: string | FetchArgs, token: string | null): FetchArgs {
  const request: FetchArgs = typeof args === 'string' ? { url: args } : { ...args };
  const headers = new Headers(request.headers as HeadersInit | undefined);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  else headers.delete('Authorization');
  request.headers = headers;
  return request;
}

/**
 * RTK Query base query with the R14 refresh-once flow:
 * 1. attach `Authorization: Bearer <token>`;
 * 2. on a 401 for a request that carried a token, run ONE refresh (shared by concurrent requests) and retry once;
 * 3. if the refresh fails, or the retry is still 401, call `onSessionExpired`.
 * Every failure is normalised to `ApiError` (`{ status, code, message, details? }`).
 */
export function createBaseQueryWithReauth(options: ReauthOptions): AppBaseQuery {
  const rawBaseQuery = fetchBaseQuery({
    baseUrl: options.baseUrl,
    timeout: options.timeoutMs ?? 30_000,
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
  });

  let refreshInFlight: Promise<string | null> | null = null;
  const refreshOnce = (): Promise<string | null> => {
    if (!refreshInFlight) {
      refreshInFlight = options.auth
        .refreshSession()
        .catch(() => null)
        .finally(() => {
          refreshInFlight = null;
        });
    }
    return refreshInFlight;
  };

  let expiredNotified = false;
  const expire = (api: BaseQueryApi) => {
    // Many parallel requests can fail at once; redirect only once per expiry.
    if (expiredNotified) return;
    expiredNotified = true;
    options.onSessionExpired(api);
    queueMicrotask(() => {
      expiredNotified = false;
    });
  };

  return async (args, api, extraOptions) => {
    const token = await options.auth.getAccessToken();
    let result = await rawBaseQuery(withAuthHeader(args, token), api, extraOptions);

    if (result.error?.status === 401 && token) {
      const freshToken = await refreshOnce();
      if (!freshToken) {
        expire(api);
      } else {
        result = await rawBaseQuery(withAuthHeader(args, freshToken), api, extraOptions);
        if (result.error?.status === 401) expire(api);
      }
    }

    if (result.error) {
      return { error: normaliseFetchError(result.error as FetchBaseQueryError), meta: result.meta };
    }
    return { data: result.data, meta: result.meta };
  };
}
