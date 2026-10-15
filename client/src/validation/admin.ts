import { z } from 'zod';
import { toCentavos } from '../lib/money';
import { addDays, manilaToday } from '../lib/time';
import { EXPENSE_CATEGORIES, PROMO_SECTIONS } from '../types/api';
import { V, emailSchema, isHttpUrl, isoDateSchema, moneySchema, notFutureDateSchema, optionalImageFileSchema, optionalText, phSchema } from './common';

const languageSchema = z.enum(['en', 'fil'], { error: V.choiceRequired });

/** Proposed (design pass): optional birthday, 1900-01-01 to today. Empty → null (clears it on edit). */
const birthdaySchema = (today: () => string) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    isoDateSchema.refine((d) => d >= '1900-01-01' && d <= today(), { error: V.birthdayInvalid }).nullable(),
  );

/** Bed: label 1–60 (unique on the server), room 1–40, bunk type, rate 1–100,000, status vacant/reserved. */
export const bedSchema = z.object({
  label: z.string().trim().min(1, { error: V.labelLength }).max(60, { error: V.labelLength }),
  room: z.string().trim().min(1, { error: V.roomLength }).max(40, { error: V.roomLength }),
  bunk_type: z.enum(['lower', 'upper'], { error: V.choiceRequired }),
  monthly_rate: moneySchema({ min: 1, max: 100_000, minMessage: V.rateRange, maxMessage: V.rateRange }),
  status: z.enum(['vacant', 'reserved'], { error: V.choiceRequired }),
  photo: optionalImageFileSchema,
});

/** Add renter (R31): move_in up to 60 days back or ahead; deposit 0–100,000, optional. */
export function addRenterSchema(today: () => string = () => manilaToday()) {
  return z.object({
    full_name: z.string().trim().min(2, { error: V.nameLength }).max(100, { error: V.nameLength }),
    email: emailSchema,
    phone: phSchema,
    language: languageSchema,
    bed_id: z.string().min(1, { error: V.choiceRequired }),
    move_in: isoDateSchema.refine((d) => d >= addDays(today(), -60) && d <= addDays(today(), 60), {
      error: V.moveInRange,
    }),
    deposit: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      moneySchema({ min: 0, max: 100_000, minMessage: V.depositRange, maxMessage: V.depositRange }).optional(),
    ),
    birthday: birthdaySchema(today),
  });
}

/** Assign bed (R33): same bed/move-in/deposit rules as Add renter, for a renter with no active tenancy. */
export function assignBedSchema(today: () => string = () => manilaToday()) {
  return z.object({
    bed_id: z.string().min(1, { error: V.choiceRequired }),
    move_in: isoDateSchema.refine((d) => d >= addDays(today(), -60) && d <= addDays(today(), 60), {
      error: V.moveInRange,
    }),
    deposit: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      moneySchema({ min: 0, max: 100_000, minMessage: V.depositRange, maxMessage: V.depositRange }).optional(),
    ),
  });
}

/** Move out (R34): the date can't be before move-in (MOVE_OUT_BEFORE_MOVE_IN, same copy as the server error). */
export function moveOutSchema(moveIn: string, today: string) {
  return z.object({
    move_out: isoDateSchema
      .refine((d) => d <= today, { error: 'errors:MOVE_OUT_IN_FUTURE' })
      .refine((d) => d >= moveIn, { error: 'errors:MOVE_OUT_BEFORE_MOVE_IN' }),
  });
}

/** Edit renter (R32): name, phone, language, and (proposed) birthday. */
export const editRenterSchema = z.object({
  full_name: z.string().trim().min(2, { error: V.nameLength }).max(100, { error: V.nameLength }),
  phone: phSchema,
  language: languageSchema,
  birthday: birthdaySchema(() => manilaToday()),
});

/** Proposed (design pass): an expense. Date not in the future, description 2–120, amount 0.01–1,000,000, note ≤ 500. */
export function expenseSchema(today: () => string = () => manilaToday()) {
  return z.object({
    spent_on: notFutureDateSchema(today),
    category: z.enum(EXPENSE_CATEGORIES, { error: V.choiceRequired }),
    description: z.string().trim().min(2, { error: V.descriptionLength }).max(120, { error: V.descriptionLength }),
    amount: moneySchema({ max: 1_000_000 }),
    note: optionalText(500, V.noteTooLong),
  });
}

/** Rent charge edit (R35): amount ≥ paid_total and > 0; due_date valid. */
export function rentChargeEditSchema(paidTotal: number) {
  return z.object({
    amount: moneySchema({ max: 999_999.99 }).refine((a) => toCentavos(a) >= toCentavos(paidTotal), {
      error: V.amountBelowPaid,
    }),
    due_date: isoDateSchema,
  });
}

/**
 * Bill (R39): total 0.01–1,000,000; period and due date required; when shares are given, their sum must equal
 * the total exactly (compared in centavos) and each share must be ≥ its paid_total.
 */
export const billSchema = z
  .object({
    type: z.enum(['electricity', 'water', 'internet'], { error: V.choiceRequired }),
    period: isoDateSchema.refine((d) => d.endsWith('-01'), { error: V.dateInvalid }),
    total_amount: moneySchema({ max: 1_000_000, maxMessage: V.totalRange, minMessage: V.totalRange }),
    due_date: isoDateSchema,
    shares: z
      .array(
        z.object({
          id: z.string(),
          amount: moneySchema({ min: 0, max: 1_000_000 }),
          paid_total: z.number().optional(),
        }),
      )
      .optional(),
  })
  .superRefine((bill, ctx) => {
    if (!bill.shares) return;
    const sum = bill.shares.reduce((s, share) => s + toCentavos(share.amount), 0);
    if (sum !== toCentavos(bill.total_amount)) ctx.addIssue({ code: 'custom', message: V.sharesSum, path: ['shares'] });
    bill.shares.forEach((share, i) => {
      if (share.paid_total !== undefined && toCentavos(share.amount) < toCentavos(share.paid_total)) {
        ctx.addIssue({ code: 'custom', message: V.shareBelowPaid, path: ['shares', i, 'amount'] });
      }
    });
  });

/** Announcement (R41): title 1–120, body 1–5,000, image ≤ 5 MB jpeg/png/webp, priority normal/urgent. */
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
const ISO_WITH_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:\d{2}|Z)$/;
const DAY_MS = 86_400_000;

/**
 * Announcement (R41) plus D-25: maintenance notices (R72: From/To required, To ≥ From, at most 31 days, To not in the
 * past on create; daily times both or neither, end after start; general ones have none of these) and Publish at (R73:
 * ISO with offset, in the future and ≤ 90 days ahead; checked on create and while scheduled only).
 */
export function announcementSchema({
  creating = true,
  checkPublishAt = true,
  now = () => Date.now(),
  today = () => manilaToday(),
}: { creating?: boolean; checkPublishAt?: boolean; now?: () => number; today?: () => string } = {}) {
  return z
    .object({
      title: z.string().trim().min(1, { error: V.titleLength }).max(120, { error: V.titleLength }),
      body: z.string().trim().min(1, { error: V.bodyLength }).max(5000, { error: V.bodyLength }),
      priority: z.enum(['normal', 'urgent'], { error: V.choiceRequired }),
      pinned: z.boolean(),
      send_email: z.boolean(),
      image: optionalImageFileSchema,
      kind: z.enum(['general', 'maintenance'], { error: V.choiceRequired }).default('general'),
      starts_on: z.preprocess(blankToUndefined, isoDateSchema.optional()),
      ends_on: z.preprocess(blankToUndefined, isoDateSchema.optional()),
      start_time: z.preprocess(blankToUndefined, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: V.timeInvalid }).optional()),
      end_time: z.preprocess(blankToUndefined, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: V.timeInvalid }).optional()),
      publish_at: z.preprocess(blankToUndefined, z.string().refine((v) => ISO_WITH_OFFSET_RE.test(v) && !Number.isNaN(Date.parse(v)), { error: V.dateInvalid }).optional()),
    })
    .superRefine((a, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
      if (a.kind === 'maintenance') {
        if (!a.starts_on) issue('starts_on', V.required);
        if (!a.ends_on) issue('ends_on', V.required);
        else if (a.starts_on && a.ends_on < a.starts_on) issue('ends_on', V.endBeforeStart);
        else if (a.starts_on && (Date.parse(a.ends_on) - Date.parse(a.starts_on)) / DAY_MS > 30) issue('ends_on', V.maintenanceSpan);
        else if (creating && a.ends_on < today()) issue('ends_on', V.dateInPast);
        if (Boolean(a.start_time) !== Boolean(a.end_time)) issue(a.start_time ? 'end_time' : 'start_time', V.timePair);
        else if (a.start_time && a.end_time && a.end_time <= a.start_time) issue('end_time', V.endTimeBeforeStart);
      } else if (a.starts_on || a.ends_on || a.start_time || a.end_time) issue('kind', V.choiceRequired);
      if (a.publish_at && checkPublishAt) {
        const at = Date.parse(a.publish_at);
        if (at <= now()) issue('publish_at', V.publishInPast);
        else if (at > now() + 90 * DAY_MS) issue('publish_at', V.dateTooFar);
      }
    });
}

/** Settings (R42): account_name ≤ 80, account_number ≤ 40, QR ≤ 5 MB. */
export const settingsSchema = z.object({
  reminders_enabled: z.boolean(),
  reminder_types: z.array(z.enum(['due_minus_3', 'due_today', 'overdue_1', 'overdue_3', 'overdue_7'])),
  payment_accounts: z.array(
    z.object({
      method: z.enum(['gcash', 'maya', 'bpi']),
      enabled: z.boolean(),
      account_name: z.string().trim().max(80, { error: V.accountNameTooLong }),
      account_number: z.string().trim().max(40, { error: V.accountNumberTooLong }),
    }),
  ),
});

/** Inquiry status change (R40). */
export const inquiryStatusSchema = z.enum(['new', 'contacted', 'scheduled', 'closed']);

/**
 * Proposed (promotions): title 1–120, description ≤ 240, badge ≤ 30; a button needs a label (≤ 30) and, to go to a
 * section, one of the public-page section ids (no URLs at all); the end date can't be before the start date.
 */
export const promotionSchema = z
  .object({
    title: z.string().trim().min(1, { error: V.titleLength }).max(120, { error: V.titleLength }),
    description: optionalText(240, V.promoDescriptionTooLong),
    badge: optionalText(30, V.badgeTooLong),
    cta_action: z.enum(['none', 'viewing', 'section'], { error: V.choiceRequired }),
    cta_label: optionalText(30, V.badgeTooLong),
    cta_section: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.enum(PROMO_SECTIONS, { error: V.choiceRequired }).optional()),
    starts_on: z.preprocess((v) => (v === '' ? undefined : v), isoDateSchema.optional()),
    ends_on: z.preprocess((v) => (v === '' ? undefined : v), isoDateSchema.optional()),
    visible: z.boolean(),
  })
  .superRefine((p, ctx) => {
    if (p.cta_action !== 'none' && !p.cta_label) ctx.addIssue({ code: 'custom', path: ['cta_label'], message: V.required });
    if (p.cta_action === 'section' && !p.cta_section) ctx.addIssue({ code: 'custom', path: ['cta_section'], message: V.choiceRequired });
    if (p.starts_on && p.ends_on && p.ends_on < p.starts_on) ctx.addIssue({ code: 'custom', path: ['ends_on'], message: V.endBeforeStart });
  });

/**
 * Proposed (recurring expenses): name 2–120, category, amount 0.01–1,000,000, due day 1–31, start month, optional end
 * month (not before the start), active, optional note ≤ 500. Months are `YYYY-MM-01`.
 */
const periodSchema = isoDateSchema.refine((d) => d.endsWith('-01'), { error: V.dateInvalid });
export const recurringExpenseSchema = z
  .object({
    name: z.string().trim().min(2, { error: V.descriptionLength }).max(120, { error: V.descriptionLength }),
    category: z.enum(EXPENSE_CATEGORIES, { error: V.choiceRequired }),
    amount: moneySchema({ max: 1_000_000 }),
    due_day: z.coerce.number({ error: V.dueDayRange }).int({ error: V.dueDayRange }).min(1, { error: V.dueDayRange }).max(31, { error: V.dueDayRange }),
    starts_on: periodSchema,
    ends_on: z.preprocess((x) => (x === '' || x === undefined ? null : x), periodSchema.nullable()),
    active: z.boolean(),
    note: optionalText(500, V.noteTooLong),
  })
  .refine((r) => !r.ends_on || r.ends_on >= r.starts_on, { path: ['ends_on'], error: V.endBeforeStart });

/** Proposed (viewings): 30-minute slots from 08:00 to 19:00 (Manila). */
export const VIEWING_SLOTS = Array.from({ length: 23 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/** Schedule a viewing: a date today or later, one of the slots, optional note ≤ 500. */
export function scheduleViewingSchema(today: () => string = () => manilaToday()) {
  return z.object({
    date: isoDateSchema.refine((d) => d >= today(), { error: V.dateInPast }),
    time: z.string().refine((t) => VIEWING_SLOTS.includes(t), { error: V.choiceRequired }),
    note: optionalText(500, V.noteTooLong),
  });
}

/**
 * Proposed (birthday greeting): title 1–120, message 1–1,000 (plain text; `{name}` = the renter's first name), optional
 * button: label ≤ 30 and an http(s) URL ≤ 500, both or neither.
 */
export const greetingSchema = z
  .object({
    enabled: z.boolean(),
    title: z.string().trim().min(1, { error: V.titleLength }).max(120, { error: V.titleLength }),
    message: z.string().trim().min(1, { error: V.required }).max(1000, { error: V.messageTooLong }),
    link_label: optionalText(30, V.badgeTooLong),
    link_url: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().trim().max(500, { error: V.urlInvalid }).refine(isHttpUrl, { error: V.urlInvalid }).optional(),
    ),
  })
  .superRefine((g, ctx) => {
    if (g.link_label && !g.link_url) ctx.addIssue({ code: 'custom', path: ['link_url'], message: V.required });
    if (g.link_url && !g.link_label) ctx.addIssue({ code: 'custom', path: ['link_label'], message: V.required });
  });
