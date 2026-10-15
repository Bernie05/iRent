import { z } from 'zod';
import { manilaToday } from '../lib/time';
import { V, screenshotFileSchema, moneySchema, notFutureDateSchema, optionalImageFileSchema, optionalText } from './common';

export const REFERENCE_RE = /^[A-Za-z0-9 -]{4,40}$/;

const itemTypeSchema = z.enum(['charge', 'bill_share'], { error: V.choiceRequired });
const itemIdSchema = z.string().min(1, { error: V.choiceRequired });

/** Reference: 4–40 characters, letters, digits, spaces and dashes (trimmed, as on the server). */
export const referenceSchema = z
  .string()
  .trim()
  .min(1, { error: V.referenceRequired })
  .refine((v) => REFERENCE_RE.test(v), { error: V.referenceFormat });

/** SPEC Validation Rules → Payment upload (renter, R20). The amount may exceed the remaining balance (BR-9). */
export const paymentUploadSchema = z.object({
  item_type: itemTypeSchema,
  item_id: itemIdSchema,
  method: z.enum(['gcash', 'maya', 'bpi'], { error: V.choiceRequired }),
  amount: moneySchema({ max: 999_999.99 }),
  reference_no: referenceSchema,
  proof: screenshotFileSchema,
});

/** Admin record payment (R37): as above, plus cash (reference optional only for cash) and paid_at ≤ today. */
export function adminPaymentSchema(today: () => string = () => manilaToday()) {
  return z
    .object({
      item_type: itemTypeSchema,
      item_id: itemIdSchema,
      method: z.enum(['cash', 'gcash', 'maya', 'bpi'], { error: V.choiceRequired }),
      amount: moneySchema({ max: 999_999.99 }),
      paid_at: notFutureDateSchema(today),
      reference_no: z.string().trim().optional(),
      notes: optionalText(500, V.noteTooLong),
      receipt: optionalImageFileSchema,
    })
    .superRefine((v, ctx) => {
      const ref = v.reference_no ?? '';
      if (v.method === 'cash' && ref === '') return;
      if (ref === '') ctx.addIssue({ code: 'custom', message: V.referenceRequired, path: ['reference_no'] });
      else if (!REFERENCE_RE.test(ref)) ctx.addIssue({ code: 'custom', message: V.referenceFormat, path: ['reference_no'] });
    });
}

/** Reject reason (R38): 1–500 characters, required. */
export const rejectReasonSchema = z.object({
  reason: z.string().trim().min(1, { error: V.reasonLength }).max(500, { error: V.reasonLength }),
});

/**
 * Refund (R57): amount 0.01 up to the credit balance; method cash/gcash/maya/bpi; reference ≤ 40, optional;
 * date ≤ today; note ≤ 500. The screen shows `validation:refundExceeds` with the formatted balance.
 */
export function refundSchema(creditBalance: number, today: () => string = () => manilaToday()) {
  return z.object({
    amount: moneySchema({ max: Math.max(creditBalance, 0), maxMessage: V.refundExceeds }),
    method: z.enum(['cash', 'gcash', 'maya', 'bpi'], { error: V.choiceRequired }),
    reference_no: optionalText(40, V.referenceTooLong),
    refunded_at: notFutureDateSchema(today),
    note: optionalText(500, V.noteTooLong),
  });
}
