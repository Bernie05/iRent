import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { AppError, ERROR_CATALOGUE, appError } from '../../src/lib/errors.js';
import { validate, parseOrThrow, zodDetails } from '../../src/lib/validate.js';
import { mapDbError } from '../../src/lib/dbErrors.js';

describe('AppError and catalogue (B1, NFR2)', () => {
  it('serialises to the NFR2 shape', () => {
    expect(appError('NOT_FOUND').toJSON()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
    expect(appError('VALIDATION_ERROR', 'Bad', { name: 'Required' }).toJSON()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Bad', details: { name: 'Required' } },
    });
  });

  it('matches every catalogue HTTP status from backend-task.md', () => {
    const expected = {
      VALIDATION_ERROR: 400, INVALID_FILE_TYPE: 400, AMOUNT_BELOW_PAID: 400, SHARES_SUM_MISMATCH: 400,
      NO_ACTIVE_TENANCIES: 400, REFUND_EXCEEDS_CREDIT: 400, MOVE_OUT_BEFORE_MOVE_IN: 400, MOVE_OUT_IN_FUTURE: 400, NOT_REVIEWABLE: 400,
      UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, DUPLICATE_REFERENCE: 409, ITEM_ALREADY_PAID: 409,
      ALREADY_REVIEWED: 409, ALREADY_ACTIVATED: 409, EMAIL_EXISTS: 409, BED_TAKEN: 409,
      RENTER_HAS_ACTIVE_TENANCY: 409, BED_HAS_HISTORY: 409, BED_OCCUPIED: 409, CHARGE_HAS_PAYMENTS: 409,
      FILE_TOO_LARGE: 413, RATE_LIMITED: 429, INTERNAL: 500,
    };
    expect(Object.fromEntries(Object.entries(ERROR_CATALOGUE).map(([k, [s]]) => [k, s]))).toEqual(expected);
  });

  it('rejects unknown codes', () => {
    expect(() => appError('NOPE')).toThrow(/Unknown error code/);
  });
});

describe('validate / parseOrThrow (B1)', () => {
  const schema = z.object({ name: z.string().min(2), age: z.number().int().optional() }).strict();

  it('returns parsed data', () => {
    expect(parseOrThrow(schema, { name: 'Ana' })).toEqual({ name: 'Ana' });
  });

  it('throws VALIDATION_ERROR with per-field details', () => {
    try {
      parseOrThrow(schema, { name: 'A', age: 'x' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect(e.code).toBe('VALIDATION_ERROR');
      expect(e.status).toBe(400);
      expect(Object.keys(e.details).sort()).toEqual(['age', 'name']);
    }
  });

  it('reports unknown fields by name (no mass assignment)', () => {
    const r = schema.safeParse({ name: 'Ana', role: 'admin' });
    expect(zodDetails(r.error)).toEqual({ role: 'Unknown field' });
  });

  it('middleware replaces req.body with the parsed value and passes errors to next', () => {
    const mw = validate(z.object({ n: z.coerce.number() }));
    const req = { body: { n: '5' } };
    let err;
    mw(req, {}, (e) => (err = e));
    expect(err).toBeUndefined();
    expect(req.body).toEqual({ n: 5 });
    expect(req.valid.body).toEqual({ n: 5 });

    const bad = { query: { n: 'x' } };
    validate(z.object({ n: z.coerce.number() }), 'query')(bad, {}, (e) => (err = e));
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toHaveProperty('n');
  });
});

describe('mapDbError (B1)', () => {
  it('maps RPC exceptions whose message is a catalogue code', () => {
    expect(mapDbError({ code: 'P0001', message: 'ITEM_ALREADY_PAID' }).code).toBe('ITEM_ALREADY_PAID');
    expect(mapDbError({ code: 'P0001', message: 'NOT_FOUND' }).status).toBe(404);
    const refund = mapDbError({ code: 'P0001', message: 'REFUND_EXCEEDS_CREDIT', details: '400.00' });
    expect(refund.status).toBe(400);
    expect(refund.message).toContain('₱400.00');
  });

  it('maps RPC validation errors with the field from the hint', () => {
    const e = mapDbError({ code: 'P0001', message: 'VALIDATION_ERROR', details: 'Invalid amount', hint: 'amount' });
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.details).toEqual({ amount: 'Invalid amount' });
  });

  it('maps unique violations by constraint name', () => {
    const dup = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "payments_method_reference_uniq"',
    };
    expect(mapDbError(dup).code).toBe('DUPLICATE_REFERENCE');
    expect(mapDbError(dup).status).toBe(409);
    expect(mapDbError({ code: '23505', message: 'x', details: 'constraint "tenancies_one_active_per_bed"' }).code).toBe('BED_TAKEN');
    expect(mapDbError({ code: '23505', message: 'unique constraint "tenancies_one_active_per_renter"' }).code).toBe(
      'RENTER_HAS_ACTIVE_TENANCY',
    );
    expect(mapDbError({ code: '23505', message: 'unique constraint "profiles_email_uniq"' }).code).toBe('EMAIL_EXISTS');
    const label = mapDbError({ code: '23505', message: 'unique constraint "beds_label_key"' });
    expect(label.code).toBe('VALIDATION_ERROR');
    expect(label.details).toHaveProperty('label');
  });

  it('maps the reference-required check violation to 400 VALIDATION_ERROR (D-15)', () => {
    const chk = {
      code: '23514',
      message: 'new row for relation "payments" violates check constraint "payments_reference_required"',
    };
    const e = mapDbError(chk);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.status).toBe(400);
    expect(e.details).toHaveProperty('reference_no');
  });

  it('maps bad ids and no-rows to NOT_FOUND', () => {
    expect(mapDbError({ code: '22P02', message: 'invalid input syntax for type uuid' }).code).toBe('NOT_FOUND');
    expect(mapDbError({ code: 'PGRST116', message: 'no rows' }).code).toBe('NOT_FOUND');
  });

  it('turns anything else into INTERNAL, keeping the cause for the log only', () => {
    const raw = { code: '42P01', message: 'relation "secret_table" does not exist' };
    const e = mapDbError(raw);
    expect(e.code).toBe('INTERNAL');
    expect(e.message).not.toContain('secret_table');
    expect(e.cause).toBe(raw);
    expect(mapDbError(undefined).code).toBe('INTERNAL');
    const unknownUnique = mapDbError({ code: '23505', message: 'unique constraint "other"' });
    expect(unknownUnique.code).toBe('INTERNAL');
  });

  it('passes AppErrors through', () => {
    const e = appError('FORBIDDEN');
    expect(mapDbError(e)).toBe(e);
  });
});
