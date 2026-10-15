import { z } from 'zod';
import { manilaToday } from '../lib/time';
import { V, emailSchema, futureDateSchema, optionalEmailSchema, optionalText, phSchema } from './common';

/** SPEC Validation Rules → Inquiry (OQ-10 = A: name and phone required). */
export function inquirySchema(today: () => string = () => manilaToday()) {
  return z.object({
    name: z.string().trim().min(2, { error: V.nameLength }).max(100, { error: V.nameLength }),
    phone: phSchema,
    email: optionalEmailSchema,
    preferred_date: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      futureDateSchema(90, today).optional(),
    ),
    message: optionalText(1000, V.messageTooLong),
  });
}
export type InquiryForm = z.input<ReturnType<typeof inquirySchema>>;

/** Login: email valid, password required. Supabase enforces the rest. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: V.required }),
});

/** Forgot password: email valid, ≤ 254 characters. */
export const forgotPasswordSchema = z.object({ email: emailSchema });

/** BR-13: at least 8 characters, at least one letter and one digit. */
export const passwordSchema = z
  .string()
  .min(8, { error: V.passwordRule })
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), { error: V.passwordRule });

/** Set password (R49): BR-13 plus a matching confirmation. */
export const setPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string().min(1, { error: V.required }),
  })
  .refine((v) => v.password === v.confirm, { error: V.passwordMismatch, path: ['confirm'] });
