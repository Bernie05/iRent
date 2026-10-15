import { AppError, ERROR_CATALOGUE, appError } from './errors.js';

/**
 * Unique-constraint name → catalogue code (and optional field for VALIDATION_ERROR).
 * Constraint names are defined in supabase/migrations.
 */
const UNIQUE_CONSTRAINTS = {
  payments_method_reference_uniq: { code: 'DUPLICATE_REFERENCE' },
  tenancies_one_active_per_renter: { code: 'RENTER_HAS_ACTIVE_TENANCY' },
  tenancies_one_active_per_bed: { code: 'BED_TAKEN' },
  profiles_email_uniq: { code: 'EMAIL_EXISTS' },
  profiles_pkey: { code: 'EMAIL_EXISTS' },
  beds_label_key: { code: 'VALIDATION_ERROR', field: 'label', message: 'This label is already used.' },
};

/**
 * CHECK-constraint name → catalogue code (and optional field for VALIDATION_ERROR).
 * These are defense-in-depth: the RPCs and zod already validate first (D-15).
 */
const CHECK_CONSTRAINTS = {
  payments_reference_required: {
    code: 'VALIDATION_ERROR',
    field: 'reference_no',
    message: 'Reference number is required',
  },
};

/** Codes an RPC may raise as its exception message (`raise exception 'CODE'`). */
const RPC_CODES = new Set(Object.keys(ERROR_CATALOGUE));

function constraintFrom(err) {
  const text = `${err.message ?? ''} ${err.details ?? ''}`;
  const m = text.match(/constraint "([^"]+)"/);
  return m ? m[1] : undefined;
}

/**
 * Turn a Postgres / PostgREST / supabase-js error into an AppError from the catalogue.
 * RPCs raise `raise exception 'CODE' using detail = '...'`; the detail (if any) becomes
 * part of the message for codes that carry a value (e.g. REFUND_EXCEEDS_CREDIT).
 * Anything unrecognised becomes INTERNAL (the original is kept on `cause` for logging).
 */
export function mapDbError(err) {
  if (!err) return appError('INTERNAL');
  if (err instanceof AppError) return err;

  const pgCode = err.code;
  const message = typeof err.message === 'string' ? err.message.trim() : '';

  // Custom RPC exceptions: message is exactly a catalogue code.
  if (RPC_CODES.has(message)) {
    let text;
    if (message === 'REFUND_EXCEEDS_CREDIT' && err.details) {
      text = `Refund can't be more than the credit balance ₱${err.details}.`;
    } else if (message === 'VALIDATION_ERROR' && err.details) {
      text = String(err.details);
    }
    const mapped = appError(message, text);
    if (message === 'VALIDATION_ERROR' && err.hint) mapped.details = { [err.hint]: text ?? 'Invalid' };
    return mapped;
  }

  if (pgCode === '23505') {
    const rule = UNIQUE_CONSTRAINTS[constraintFrom(err)];
    if (rule) {
      if (rule.field) return appError(rule.code, rule.message, { [rule.field]: rule.message });
      return appError(rule.code);
    }
  }

  // check_violation (e.g. the reference-required constraint, D-15): map known constraints,
  // defense-in-depth for the RPCs' own validation.
  if (pgCode === '23514') {
    const rule = CHECK_CONSTRAINTS[constraintFrom(err)];
    if (rule) {
      if (rule.field) return appError(rule.code, rule.message, { [rule.field]: rule.message });
      return appError(rule.code);
    }
  }

  // invalid_text_representation (bad uuid) and no_data_found → treat as not found.
  if (pgCode === '22P02' || pgCode === 'P0002' || pgCode === 'PGRST116') return appError('NOT_FOUND');

  const internal = appError('INTERNAL');
  internal.cause = err;
  return internal;
}
