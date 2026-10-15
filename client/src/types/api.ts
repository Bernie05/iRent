/**
 * Types for the frozen API contract (backend-task.md → API Contract; SPEC.md → API / Interfaces).
 * One definition, used by the RTK Query endpoints, the MSW handlers and the fixtures.
 *
 * Conventions: money is a number in pesos (≤ 2 decimals, convert with lib/money before arithmetic);
 * business dates are `YYYY-MM-DD` (Asia/Manila); a period is `YYYY-MM-01`; timestamps are ISO 8601.
 */

export type Money = number;
export type IsoDate = string;
export type Period = string;
export type Timestamp = string;
export type Uuid = string;

export type Role = 'admin' | 'renter';
export type Language = 'en' | 'fil';
export type BunkType = 'lower' | 'upper';
export type BedStatus = 'vacant' | 'occupied' | 'reserved';
export type ItemType = 'charge' | 'bill_share';
export type BillType = 'electricity' | 'water' | 'internet';
export type ItemStatus = 'unpaid' | 'partial' | 'paid';
export type ExternalMethod = 'gcash' | 'maya' | 'bpi';
export type AdminMethod = ExternalMethod | 'cash';
export type PaymentMethod = AdminMethod | 'credit';
export type Verification = 'auto_verified' | 'confirmed' | 'rejected';
export type LedgerEntryType = 'overpayment' | 'application' | 'reversal' | 'application_reversal' | 'refund';
export type InquiryStatus = 'new' | 'contacted' | 'scheduled' | 'closed';
export type Priority = 'normal' | 'urgent';
/** D-25 (R72, BR-17): announcement type and the admin's derived status. */
export type AnnouncementKind = 'general' | 'maintenance';
export type AnnouncementStatus = 'scheduled' | 'published' | 'ended';
export type ReminderType = 'due_minus_3' | 'due_today' | 'overdue_1' | 'overdue_3' | 'overdue_7';
export type BalanceStatus = 'due' | 'overdue' | 'paid';
export type RentStatusFilter = 'all' | 'unpaid' | 'partial' | 'overdue';

// ---------- Errors (NFR2) ----------
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_FILE_TYPE',
  'AMOUNT_BELOW_PAID',
  'SHARES_SUM_MISMATCH',
  'NO_ACTIVE_TENANCIES',
  'REFUND_EXCEEDS_CREDIT',
  'MOVE_OUT_BEFORE_MOVE_IN',
  'MOVE_OUT_IN_FUTURE',
  'NOT_REVIEWABLE',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'DUPLICATE_REFERENCE',
  'ITEM_ALREADY_PAID',
  'ALREADY_REVIEWED',
  'ALREADY_ACTIVATED',
  'EMAIL_EXISTS',
  'BED_TAKEN',
  'RENTER_HAS_ACTIVE_TENANCY',
  'BED_HAS_HISTORY',
  'BED_OCCUPIED',
  'CHARGE_HAS_PAYMENTS',
  'FILE_TOO_LARGE',
  'RATE_LIMITED',
  'NOT_SCHEDULED',
  'NO_ACTIVE_TENANCY',
  'INVALID_STATUS_CHANGE',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: Record<string, string> };
}

// ---------- Shared shapes ----------
export interface Item {
  type: ItemType;
  id: Uuid;
  period: Period;
  bill_type?: BillType;
}

export interface PersonRef {
  id: Uuid;
  full_name: string;
}

export interface BedRef {
  id: Uuid;
  label: string;
  room: string;
}

export interface ChargeRow {
  id: Uuid;
  item: Item;
  tenancy_id: Uuid;
  amount: Money;
  paid_total: Money;
  paid_from_credit: Money;
  remaining: Money;
  due_date: IsoDate;
  status: ItemStatus;
  is_overdue: boolean;
  /** Admin only. */
  renter?: PersonRef;
  /** Admin only. */
  bed?: BedRef;
}

export interface ShareRow extends ChargeRow {
  bill_id: Uuid;
}

export interface Payment {
  id: Uuid;
  item: Item;
  method: PaymentMethod;
  amount: Money;
  applied_amount: Money;
  credit_amount: Money;
  reference_no: string | null;
  has_proof: boolean;
  paid_at: Timestamp;
  notes: string | null;
  verification: Verification;
  rejection_reason: string | null;
  reviewed_at: Timestamp | null;
  /** Renter rows only (D-27, R77): who submitted it, derived from submitted_by. */
  source?: 'renter' | 'admin';
  /** Admin only. */
  renter?: PersonRef;
  /** Admin only. */
  credit_already_used?: Money;
}

export interface LedgerEntry {
  id: Uuid;
  created_at: Timestamp;
  entry_type: LedgerEntryType;
  /** Signed: overpayment and application_reversal > 0; application, reversal and refund < 0. */
  amount: Money;
  item?: Item;
  payment_id?: Uuid;
  refund_method?: AdminMethod;
  reference_no?: string;
  note?: string;
}

export interface CreditLedger {
  balance: Money;
  entries: LedgerEntry[];
}

export interface RenterTenancy {
  id: Uuid;
  bed: BedRef;
  move_in: IsoDate;
  due_day: number;
}

export interface RenterRow {
  id: Uuid;
  full_name: string;
  email: string;
  phone: string;
  language: Language;
  status: 'active' | 'moved_out';
  invite_pending: boolean;
  tenancy: RenterTenancy | null;
  last_tenancy_id: Uuid | null;
  outstanding: Money;
  credit_balance: Money;
  refund_due: Money;
  /** Proposed (design pass, not in the server yet): `profiles.birthday`, admin-only. */
  birthday: IsoDate | null;
  /** Proposed (design pass): distinct billing months with an open item (rent and that month's bill count once). */
  unpaid_months: number;
  /** Proposed (derived): move-out date of the latest ended tenancy, null if none (Assign picker: "Moved out Sep 2026"). */
  last_move_out: IsoDate | null;
}

export interface Bed {
  id: Uuid;
  label: string;
  room: string;
  bunk_type: BunkType;
  monthly_rate: Money;
  status: BedStatus;
  photo_url: string | null;
  current_renter: PersonRef | null;
  has_history: boolean;
}

export interface Bill {
  id: Uuid;
  type: BillType;
  period: Period;
  total_amount: Money;
  due_date: IsoDate;
  shares: ShareRow[];
}

export interface Announcement {
  id: Uuid;
  title: string;
  body: string;
  image_url: string | null;
  priority: Priority;
  pinned: boolean;
  emailed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  /** D-25 (R72): maintenance notices have From/To dates and an optional daily window (HH:MM, Manila). */
  kind: AnnouncementKind;
  starts_on: IsoDate | null;
  ends_on: IsoDate | null;
  start_time: string | null;
  end_time: string | null;
  /** Admin only (D-25, R73, BR-17, BR-18). */
  publish_at?: Timestamp;
  status?: AnnouncementStatus;
  email_pending?: boolean;
  /** Admin only (D-30): custom order, lower = higher (pinned ones first). */
  position?: number;
  /** Admin only (proposed, "Post to renters"): the schedule item this notice mirrors, or null. */
  schedule_event_id?: Uuid | null;
  /** Renter feed only. */
  is_read?: boolean;
}

export interface PaymentAccount {
  method: ExternalMethod;
  enabled: boolean;
  account_name: string;
  account_number: string;
  qr_url: string | null;
}

export interface Settings {
  reminders_enabled: boolean;
  reminder_types: ReminderType[];
  payment_accounts: PaymentAccount[];
  updated_at: Timestamp;
}

/** Proposed (birthday greeting): what a renter sees on their birthday. `{name}` is already replaced with their first name. */
export interface Greeting {
  title: string;
  message: string;
  link_label: string | null;
  /** http(s) only (validated on save). */
  link_url: string | null;
  image_url: string | null;
}

/** Proposed (birthday greeting): the admin's single template (GET/PUT /settings/birthday-greeting). */
export interface GreetingSettings extends Greeting {
  enabled: boolean;
  updated_at: Timestamp;
}

export interface CreditApplication {
  item: Item;
  amount: Money;
}

export interface PayResult {
  payment: Payment;
  item_status: ItemStatus;
  remaining: Money;
  credit_added: Money;
  credit_applied: CreditApplication[];
  credit_balance: Money;
}

export interface RejectResult {
  payment: Payment;
  credit_reversed: Money;
  items_reopened: { item: Item; remaining: Money }[];
  credit_balance: Money;
}

// ---------- Endpoint-specific shapes ----------
export interface Health {
  ok: true;
}

export interface AvailableRate {
  bunk_type: BunkType;
  monthly_rate: Money;
  vacant_count: number;
}

export interface InquiryInput {
  name: string;
  phone: string;
  email?: string;
  preferred_date?: IsoDate;
  message?: string;
}

export interface Inquiry {
  id: Uuid;
  name: string;
  phone: string;
  email: string | null;
  preferred_date: IsoDate | null;
  message: string | null;
  status: InquiryStatus;
  /** Proposed (viewings, 2026-10-15): the scheduled viewing, or null. */
  scheduled_at: Timestamp | null;
  schedule_note: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MeTenancy {
  id: Uuid;
  bed: { label: string; room: string; bunk_type: BunkType; monthly_rate: Money };
  move_in: IsoDate;
}

export interface Me {
  id: Uuid;
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  language: Language;
  /** `null` for a moved-out renter (OQ-6 = A, OQ-22) and for the admin. */
  tenancy?: MeTenancy | null;
}

export interface Balance {
  outstanding: Money;
  next_due_date: IsoDate | null;
  status: BalanceStatus;
  credit_balance: Money;
}

export interface SignedUrl {
  url: string;
}

export interface MyAnnouncements {
  items: Announcement[];
  unread_count: number;
}

export interface Dashboard {
  beds: { occupied: number; total: number };
  month: { collected: Money; outstanding: Money };
  new_inquiries: number;
  payments_to_review: number;
  /** D-26: maintenance requests with status `submitted`. */
  new_maintenance: number;
}

// ---------- Maintenance requests (D-26, R74, R75, BR-19) ----------
export const MAINTENANCE_CATEGORIES = ['plumbing', 'electrical', 'aircon', 'wifi', 'other'] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];
export const MAINTENANCE_URGENCIES = ['low', 'normal', 'urgent'] as const;
export type MaintenanceUrgency = (typeof MAINTENANCE_URGENCIES)[number];
export type MaintenanceStatus = 'submitted' | 'in_progress' | 'done' | 'declined';
/** Admin list filter: `open` = submitted + in_progress (the default). */
export type MaintenanceFilter = 'all' | 'open' | MaintenanceStatus;

export interface MaintenanceRequest {
  id: Uuid;
  category: MaintenanceCategory;
  urgency: MaintenanceUrgency;
  description: string;
  status: MaintenanceStatus;
  /** "Note from the owner", shown to the renter (OQ-31). */
  admin_note: string | null;
  decline_reason: string | null;
  photo_count: number;
  created_at: Timestamp;
  status_changed_at: Timestamp;
  updated_at: Timestamp;
  /** Admin only. */
  renter?: PersonRef;
  /** Admin only. */
  bed?: BedRef | null;
  /** Proposed (2026-10-15): when the linked maintenance item ("Schedule fix") is, or null. Renters see it too. */
  scheduled_fix: { starts_at: Timestamp; all_day: boolean } | null;
}

export interface PhotoUrls {
  urls: string[];
}

export interface CreateRenterInput {
  full_name: string;
  email: string;
  phone: string;
  language: Language;
  bed_id: Uuid;
  move_in: IsoDate;
  deposit?: Money;
  /** Proposed (design pass). */
  birthday?: IsoDate | null;
}

export interface CreateRenterResult {
  renter: RenterRow;
  invite_sent: boolean;
}

export interface UpdateRenterInput {
  full_name?: string;
  phone?: string;
  language?: Language;
  /** Proposed (design pass). `null` clears it. */
  birthday?: IsoDate | null;
}

export interface RefundInput {
  amount: Money;
  method: AdminMethod;
  reference_no?: string;
  refunded_at: IsoDate;
  note?: string;
}

export interface AssignBedInput {
  renter_id: Uuid;
  bed_id: Uuid;
  move_in: IsoDate;
  deposit?: Money;
}

export interface Tenancy {
  id: Uuid;
  renter: PersonRef;
  bed: BedRef;
  move_in: IsoDate;
  move_out: IsoDate | null;
  is_active: boolean;
}

export interface MoveOutPreview {
  credit_balance: Money;
  would_apply: Money;
  refund_due: Money;
}

export interface MoveOutResult {
  credit_applied: Money;
  refund_due: Money;
}

export interface GenerateRentResult {
  created: number;
  skipped_existing: number;
  skipped_not_moved_in: number;
  credit_applied_total: Money;
}

export interface UpdateChargeInput {
  amount?: Money;
  due_date?: IsoDate;
}

export interface ReviewInput {
  action: 'confirm' | 'reject';
  reason?: string;
}

export interface CreateBillInput {
  type: BillType;
  period: Period;
  total_amount: Money;
  due_date: IsoDate;
  shares?: { tenancy_id: Uuid; amount: Money }[];
}

export interface UpdateSharesInput {
  shares: { id: Uuid; amount: Money }[];
}

// ---------- Proposed (admin dashboard design pass, 2026-10-14): mock-only until the architect specs them ----------
export const EXPENSE_CATEGORIES = ['upgrade', 'appliance', 'repair', 'maintenance', 'supplies', 'utilities', 'subscriptions', 'other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: Uuid;
  /** Posted from a recurring template (badge "Recurring"); null for a one-off expense. */
  recurring_id: Uuid | null;
  /** Month a recurring entry was posted for; null for one-off expenses. */
  period?: Period | null;
  spent_on: IsoDate;
  category: ExpenseCategory;
  description: string;
  amount: Money;
  note: string | null;
  created_at: Timestamp;
}

export interface CreateExpenseInput {
  spent_on: IsoDate;
  category: ExpenseCategory;
  description: string;
  amount: Money;
  note?: string;
}

/** Proposed (recurring expenses, 2026-10-14): a monthly template that posts one expense per month on its due day. */
export interface RecurringExpense {
  id: Uuid;
  name: string;
  category: ExpenseCategory;
  amount: Money;
  /** 1–31; clamped to the month's last day. */
  due_day: number;
  /** First and (optional) last month it posts, `YYYY-MM-01`. */
  starts_on: Period;
  ends_on: Period | null;
  active: boolean;
  note: string | null;
  /** Read-only BR-16 watermark: the last month posted (`YYYY-MM-01`), null if never. */
  last_posted_period: Period | null;
}

export interface RecurringExpenseInput {
  name: string;
  category: ExpenseCategory;
  amount: Money;
  due_day: number;
  starts_on: Period;
  ends_on?: Period | null;
  active: boolean;
  note?: string;
}

export type AnalyticsRange = 'month' | 'year' | 'total';

/** One month of the dashboard series. */
export interface AnalyticsPoint {
  period: Period;
  /** Cash received: non-credit, non-rejected payments, by paid_at month (Manila). */
  revenue: Money;
  expenses: Money;
  /** Rent charges + bill shares whose period is this month. */
  billed: Money;
  /** Paid so far on those items (cash and credit). */
  collected: Money;
  occupied: number;
  total_beds: number;
}

export interface DashboardAnalytics {
  range: AnalyticsRange;
  /** First and last month of the range (`YYYY-MM-01`). */
  from: Period;
  to: Period;
  revenue: Money;
  expenses: Money;
  /** Beds occupied at the end of the range (today for the current month). */
  occupancy: { occupied: number; total: number };
  /** month: the 6 months ending at `to` (sparkline context); year: Jan to Dec or this month; total: every month. */
  series: AnalyticsPoint[];
  /** Rent charges and bill shares with a period in the range (admin shape, with renter and bed). */
  items: ChargeRow[];
  /** Every item still unpaid or partial with a period up to 'to' (arrears from earlier months included). */
  open_items: ChargeRow[];
}

// ---------- Proposed (promotions, 2026-10-14): mock-only until the architect specs them ----------
export type PromoAction = 'none' | 'viewing' | 'section';
/** Public-page sections a promo button can go to (the real section ids; 'gallery' is My Unit). */
export const PROMO_SECTIONS = ['amenities', 'gallery', 'location', 'rates', 'faq'] as const;
export type PromoSection = (typeof PROMO_SECTIONS)[number];

export interface Promotion {
  id: Uuid;
  title: string;
  description: string | null;
  badge: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_action: PromoAction;
  /** For cta_action "section": where the button scrolls to. Internal only, never a URL (Bernie, 2026-10-14). */
  cta_section: PromoSection | null;
  starts_on: IsoDate | null;
  ends_on: IsoDate | null;
  /** Admin only. */
  visible?: boolean;
  /** Admin only: 1 = first. */
  position?: number;
}

export interface AdminPromotions {
  section_visible: boolean;
  items: Promotion[];
}

// ---------- Proposed (viewings, 2026-10-15): mock-only until the architect specs them ----------
export interface ScheduleViewingInput {
  /** ISO timestamp with the Manila offset, e.g. 2026-10-18T10:00:00+08:00 (08:00–19:00, 30-minute slots). */
  scheduled_at: Timestamp;
  note?: string;
}

/** Who was emailed: the visitor only when the inquiry has an email; the admin (ADMIN_NOTIFY_EMAIL) always. */
export interface ViewingResult {
  inquiry: Inquiry;
  /** R69: the visitor is skipped without an email, or after the cap of 6 visitor emails per inquiry (D-23). */
  notified: { visitor: boolean; admin: boolean; visitor_skipped?: 'no_email' | 'cap' };
}

// ---------- Proposed (admin schedule, 2026-10-15): mock-only until the architect specs them ----------
/** `other` is shown as "Maintenance": it lives on the Maintenance page only (Inquiries shows viewings + renter items). */
export type ScheduleEventType = 'renter' | 'other';

/** An admin calendar item that isn't a viewing (viewings stay on inquiries). Times are ISO with +08:00. */
export interface ScheduleEvent {
  id: Uuid;
  type: ScheduleEventType;
  title: string;
  starts_at: Timestamp;
  ends_at: Timestamp | null;
  all_day: boolean;
  /** Renter schedules only. */
  renter: PersonRef | null;
  note: string | null;
  /** Renter schedules only: email the renter (confirmation, change, cancellation, day-before reminder). */
  notify_renter: boolean;
  /** Other items only ("Post to renters"): the linked maintenance notice, or null. */
  announcement_id: Uuid | null;
  /** Other items only: the renter request this item fixes ("Schedule fix"), or null. Set on create, cleared by delete. */
  maintenance_request_id: Uuid | null;
}

export interface ScheduleEventInput {
  type: ScheduleEventType;
  title: string;
  starts_at: Timestamp;
  ends_at?: Timestamp | null;
  all_day: boolean;
  renter_id?: Uuid | null;
  note?: string;
  notify_renter: boolean;
  /** Other items only: keep a linked maintenance notice (needs a note; a timed item needs an end time). Default false. */
  post_to_renters?: boolean;
  /** Email renters once, when the notice is first created. Default false; edits never re-email. */
  email_renters?: boolean;
  /** POST only, Other items: link an open request (Submitted moves to In progress). Ignored on PATCH. */
  maintenance_request_id?: Uuid | null;
}

/** GET /schedule: events plus the scheduled viewings in the range (one calendar feed). */
export interface ScheduleFeed {
  events: ScheduleEvent[];
  viewings: Inquiry[];
}

export interface ScheduleEventResult {
  event: ScheduleEvent | null;
  /** Emailed by this change: the renter (renter item) and/or all renters (a newly created linked notice). */
  notified: { renter: boolean; renters: boolean };
}
