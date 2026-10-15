import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { SerializedError } from '@reduxjs/toolkit';
import { ERROR_CODES, type ErrorCode } from '../types/api';

/** Client-only codes, for failures that never reached the API or returned no catalogue body. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'UNKNOWN';

/**
 * The single normalised error shape every RTK Query endpoint rejects with.
 * Network failures and 5xx become `{ code, message }` too (F1 error handling).
 */
export interface ApiError {
  /** HTTP status, or 0 when the request never got a response. */
  status: number;
  code: ErrorCode | ClientErrorCode;
  message: string;
  /** Per-field messages for 400 VALIDATION_ERROR. */
  details?: Record<string, string>;
}

const KNOWN_CODES = new Set<string>(ERROR_CODES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function codeForStatus(status: number): ErrorCode | ClientErrorCode {
  if (status === 400) return 'VALIDATION_ERROR';
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 413) return 'FILE_TOO_LARGE';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'INTERNAL';
  return 'UNKNOWN';
}

/** Reads the NFR2 body `{ error: { code, message, details? } }` from any response payload. */
function readErrorBody(data: unknown): Partial<Pick<ApiError, 'code' | 'message' | 'details'>> {
  if (!isRecord(data) || !isRecord(data.error)) return {};
  const { code, message, details } = data.error;
  return {
    code: typeof code === 'string' && KNOWN_CODES.has(code) ? (code as ErrorCode) : undefined,
    message: typeof message === 'string' ? message : undefined,
    details: isRecord(details) ? (details as Record<string, string>) : undefined,
  };
}

/** Converts a fetchBaseQuery error into the normalised ApiError. */
export function normaliseFetchError(error: FetchBaseQueryError): ApiError {
  if (typeof error.status === 'number') {
    const body = readErrorBody(error.data);
    // 5xx never shows a server message to the user (NFR1: no leaks), but the code is kept.
    const status = error.status;
    return {
      status,
      code: status >= 500 ? (body.code ?? 'INTERNAL') : (body.code ?? codeForStatus(status)),
      message: body.message ?? `HTTP ${status}`,
      ...(body.details ? { details: body.details } : {}),
    };
  }
  switch (error.status) {
    case 'FETCH_ERROR':
      return { status: 0, code: 'NETWORK_ERROR', message: error.error };
    case 'TIMEOUT_ERROR':
      return { status: 0, code: 'TIMEOUT', message: error.error };
    case 'PARSING_ERROR': {
      const status = error.originalStatus;
      return { status, code: codeForStatus(status), message: error.error };
    }
    default:
      return { status: 0, code: 'UNKNOWN', message: 'error' in error ? String(error.error) : 'Unknown error' };
  }
}

export function isApiError(value: unknown): value is ApiError {
  return isRecord(value) && typeof value.code === 'string' && typeof value.status === 'number';
}

/**
 * Maps any error (ApiError, a raw RTK error, a thrown Error) to an i18n key in the `errors` namespace.
 * Screens that need context-specific copy (e.g. the viewing form's 429) check `code` first and
 * fall back to this.
 */
export function errorToMessage(error: ApiError | FetchBaseQueryError | SerializedError | unknown): string {
  let code: string | undefined;
  if (isApiError(error)) code = error.code;
  else if (isRecord(error) && 'status' in error) code = normaliseFetchError(error as FetchBaseQueryError).code;
  if (!code) return 'errors:UNKNOWN';
  return KNOWN_CODES.has(code) || code === 'NETWORK_ERROR' || code === 'TIMEOUT' ? `errors:${code}` : 'errors:UNKNOWN';
}

/** Field errors from a 400 VALIDATION_ERROR, keyed by field name (empty object otherwise). */
export function fieldErrors(error: unknown): Record<string, string> {
  return isApiError(error) && error.code === 'VALIDATION_ERROR' && error.details ? error.details : {};
}
