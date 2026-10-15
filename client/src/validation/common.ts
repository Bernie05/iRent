import { z } from 'zod';
import { hasAtMostTwoDecimals } from '../lib/money';
import { addDays, isIsoDate, manilaToday } from '../lib/time';

/**
 * Client mirrors of SPEC.md → Validation Rules (NFR3). The server's zod schemas stay authoritative;
 * these give inline errors before a request is sent.
 *
 * Every message is an i18n key in the `validation` namespace (see locales/en.json), so it can be shown
 * with `t(message)`. Keys that need a value (e.g. the refund balance) get it from the screen.
 */
export const V = {
  required: 'validation:required',
  nameLength: 'validation:nameLength',
  phoneInvalid: 'validation:phoneInvalid',
  emailInvalid: 'validation:emailInvalid',
  emailTooLong: 'validation:emailTooLong',
  dateInvalid: 'validation:dateInvalid',
  dateInPast: 'validation:dateInPast',
  dateTooFar: 'validation:dateTooFar',
  dateInFuture: 'validation:dateInFuture',
  moveInRange: 'validation:moveInRange',
  messageTooLong: 'validation:messageTooLong',
  passwordRule: 'validation:passwordRule',
  passwordMismatch: 'validation:passwordMismatch',
  amountInvalid: 'validation:amountInvalid',
  amountPositive: 'validation:amountPositive',
  amountTooLarge: 'validation:amountTooLarge',
  amountDecimals: 'validation:amountDecimals',
  referenceRequired: 'validation:referenceRequired',
  referenceFormat: 'validation:referenceFormat',
  referenceTooLong: 'validation:referenceTooLong',
  fileRequired: 'validation:fileRequired',
  fileInvalid: 'validation:fileInvalid',
  screenshotInvalid: 'validation:screenshotInvalid',
  choiceRequired: 'validation:choiceRequired',
  labelLength: 'validation:labelLength',
  roomLength: 'validation:roomLength',
  rateRange: 'validation:rateRange',
  depositRange: 'validation:depositRange',
  refundExceeds: 'validation:refundExceeds',
  noteTooLong: 'validation:noteTooLong',
  reasonLength: 'validation:reasonLength',
  titleLength: 'validation:titleLength',
  bodyLength: 'validation:bodyLength',
  totalRange: 'validation:totalRange',
  sharesSum: 'validation:sharesSum',
  shareBelowPaid: 'validation:shareBelowPaid',
  amountBelowPaid: 'validation:amountBelowPaid',
  accountNameTooLong: 'validation:accountNameTooLong',
  accountNumberTooLong: 'validation:accountNumberTooLong',
  birthdayInvalid: 'validation:birthdayInvalid',
  descriptionLength: 'validation:descriptionLength',
  badgeTooLong: 'validation:badgeTooLong',
  promoDescriptionTooLong: 'validation:promoDescriptionTooLong',
  endBeforeStart: 'validation:endBeforeStart',
  dueDayRange: 'validation:dueDayRange',
  urlInvalid: 'validation:urlInvalid',
  timeInvalid: 'validation:timeInvalid',
  timePair: 'validation:timePair',
  endTimeBeforeStart: 'validation:endTimeBeforeStart',
  maintenanceSpan: 'validation:maintenanceSpan',
  publishInPast: 'validation:publishInPast',
  requestDescriptionLength: 'validation:requestDescriptionLength',
  tooManyPhotos: 'validation:tooManyPhotos',
  photoInvalid: 'validation:photoInvalid',
} as const;

/** True for an absolute http:// or https:// URL (no javascript:, data:, relative paths). */
export function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PH_MOBILE_RE = /^(\+63|0)9\d{9}$/;

/** Removes spaces and dashes, as the server does before checking the phone (B12). */
export function normalisePhone(value: string): string {
  return value.replace(/[\s-]/g, '');
}

const trimmed = () => z.string().trim();

/** Optional text: empty strings become `undefined`. */
export const optionalText = (max: number, message: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    trimmed().max(max, { error: message }).optional(),
  );

export const phSchema = trimmed()
  .min(1, { error: V.required })
  .transform(normalisePhone)
  .refine((v) => PH_MOBILE_RE.test(v), { error: V.phoneInvalid });

export const emailSchema = trimmed()
  .min(1, { error: V.required })
  .max(254, { error: V.emailTooLong })
  .pipe(z.email({ error: V.emailInvalid }));

export const optionalEmailSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  emailSchema.optional(),
);

export const isoDateSchema = trimmed()
  .min(1, { error: V.required })
  .refine(isIsoDate, { error: V.dateInvalid });

/** Money typed by a user or sent by the API: > 0 (or ≥ min), ≤ max, at most 2 decimals. */
export function moneySchema(options: { min?: number; max: number; minMessage?: string; maxMessage?: string }) {
  const { min = 0.01, max, minMessage = V.amountPositive, maxMessage = V.amountTooLarge } = options;
  return z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const text = typeof v === 'number' ? String(v) : v.trim();
      if (text === '') {
        ctx.addIssue({ code: 'custom', message: V.required });
        return z.NEVER;
      }
      const n = Number(text);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: 'custom', message: V.amountInvalid });
        return z.NEVER;
      }
      if (!hasAtMostTwoDecimals(text)) {
        ctx.addIssue({ code: 'custom', message: V.amountDecimals });
        return z.NEVER;
      }
      return n;
    })
    .pipe(z.number().min(min, { error: minMessage }).max(max, { error: maxMessage }));
}

/** An image the API accepts: jpeg/png/webp, ≤ 5 MB (checked again by magic bytes on the server). */
export function isAcceptedImage(file: File): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type) && file.size <= MAX_UPLOAD_BYTES;
}

const fileSchema = (invalid: string) =>
  z.custom<File>((v) => typeof File !== 'undefined' && v instanceof File, { error: V.fileRequired }).refine(isAcceptedImage, { error: invalid });

export const imageFileSchema = fileSchema(V.fileInvalid);
/** The payment screenshot a renter uploads (its own wording). */
export const screenshotFileSchema = fileSchema(V.screenshotInvalid);

export const optionalImageFileSchema = z.preprocess((v) => (v == null ? undefined : v), imageFileSchema.optional());

/** A date that is today or later (Manila) and at most `maxDaysAhead` days ahead. */
export function futureDateSchema(maxDaysAhead: number, today: () => string = () => manilaToday()) {
  return isoDateSchema
    .refine((d) => d >= today(), { error: V.dateInPast })
    .refine((d) => d <= addDays(today(), maxDaysAhead), { error: V.dateTooFar });
}

/** A date that is not after today (Manila). */
export function notFutureDateSchema(today: () => string = () => manilaToday()) {
  return isoDateSchema.refine((d) => d <= today(), { error: V.dateInFuture });
}

/** Flattens a zod error into `{ field: messageKey }` (first message per field), for inline errors. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
