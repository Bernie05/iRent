import en from '../locales/en.json';
import { ERROR_CODES } from '../types/api';
import { errorToMessage, fieldErrors, normaliseFetchError } from './errors';

const errorKeys = en.errors as Record<string, string>;

describe('errorToMessage', () => {
  it.each(ERROR_CODES)('maps %s to an existing i18n key', (code) => {
    const key = errorToMessage({ status: 400, code, message: 'x' });
    expect(key).toBe(`errors:${code}`);
    expect(errorKeys[code]).toBeTruthy();
  });

  it('uses the SPEC copy for the codes the screens show verbatim', () => {
    expect(errorKeys.DUPLICATE_REFERENCE).toBe('This reference number was already used. Check the number in your GCash/Maya/BPI receipt.');
    expect(errorKeys.ITEM_ALREADY_PAID).toBe('This item is already paid.');
    expect(errorKeys.ALREADY_REVIEWED).toBe('This payment was already reviewed.');
    expect(errorKeys.ALREADY_ACTIVATED).toBe('This renter has already set a password.');
    expect(errorKeys.EMAIL_EXISTS).toBe('An account with this email already exists.');
    expect(errorKeys.BED_TAKEN).toBe('This bed was just taken. Choose another bed.');
    expect(errorKeys.NO_ACTIVE_TENANCIES).toBe('No active renters to split this bill with.');
    expect(errorKeys.UNAUTHENTICATED).toBe('Your session has expired. Please log in again.');
  });

  it('maps client-side failures and unknown input', () => {
    expect(errorToMessage({ status: 0, code: 'NETWORK_ERROR', message: 'x' })).toBe('errors:NETWORK_ERROR');
    expect(errorToMessage({ status: 0, code: 'TIMEOUT', message: 'x' })).toBe('errors:TIMEOUT');
    expect(errorToMessage(new Error('boom'))).toBe('errors:UNKNOWN');
    expect(errorToMessage(undefined)).toBe('errors:UNKNOWN');
    expect(errorKeys.NETWORK_ERROR).toBeTruthy();
    expect(errorKeys.UNKNOWN).toBeTruthy();
  });

  it('accepts raw RTK Query errors too', () => {
    expect(errorToMessage({ status: 409, data: { error: { code: 'BED_TAKEN', message: 'x' } } })).toBe('errors:BED_TAKEN');
    expect(errorToMessage({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' })).toBe('errors:NETWORK_ERROR');
  });
});

describe('normaliseFetchError', () => {
  it('falls back to a code per HTTP status when the body is not the NFR2 shape', () => {
    expect(normaliseFetchError({ status: 413, data: 'Payload Too Large' })).toMatchObject({ status: 413, code: 'FILE_TOO_LARGE' });
    expect(normaliseFetchError({ status: 429, data: null })).toMatchObject({ code: 'RATE_LIMITED' });
    expect(normaliseFetchError({ status: 503, data: null })).toMatchObject({ code: 'INTERNAL' });
    expect(normaliseFetchError({ status: 'PARSING_ERROR', originalStatus: 404, data: '<html>', error: 'SyntaxError' })).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(normaliseFetchError({ status: 'TIMEOUT_ERROR', error: 'timeout' })).toMatchObject({ status: 0, code: 'TIMEOUT' });
  });

  it('ignores codes that are not in the catalogue', () => {
    expect(normaliseFetchError({ status: 409, data: { error: { code: 'SOMETHING_NEW', message: 'm' } } })).toMatchObject({ code: 'UNKNOWN', message: 'm' });
  });
});

describe('fieldErrors', () => {
  it('returns the per-field details of a VALIDATION_ERROR only', () => {
    expect(fieldErrors({ status: 400, code: 'VALIDATION_ERROR', message: 'x', details: { phone: 'Invalid' } })).toEqual({ phone: 'Invalid' });
    expect(fieldErrors({ status: 409, code: 'BED_TAKEN', message: 'x' })).toEqual({});
  });
});
