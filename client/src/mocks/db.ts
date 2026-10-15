/**
 * In-memory mock database for the MSW handlers. It stores money in integer centavos and implements
 * just enough of the business rules (BR-1, BR-3, BR-4, BR-5, BR-8, BR-9–BR-12) for the documented
 * response shapes to be realistic. The real rules live in the server RPCs; this is a development aid.
 */
import { recurringDueDate } from '../lib/recurring';
import { equalSplit, fromCentavos, toCentavos, type Centavos } from '../lib/money';
import { addDays, addMonths, dueDateFor, manilaToday, periodOf } from '../lib/time';
import type {
  AdminMethod,
  Announcement,
  AnnouncementKind,
  AnnouncementStatus,
  Bed,
  BedStatus,
  BillType,
  BunkType,
  ChargeRow,
  ExpenseCategory,
  GreetingSettings,
  PromoAction,
  PromoSection,
  Inquiry,
  InquiryStatus,
  Item,
  ItemStatus,
  ItemType,
  Language,
  LedgerEntry,
  MaintenanceCategory,
  MaintenanceRequest,
  MaintenanceStatus,
  MaintenanceUrgency,
  LedgerEntryType,
  Payment,
  PaymentAccount,
  PaymentMethod,
  Priority,
  RenterRow,
  ReminderType,
  Role,
  ShareRow,
  Verification,
} from '../types/api';
import { seed } from './fixtures';

export interface ProfileRec {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  language: Language;
  password: string;
  invited_at: string | null;
  activated_at: string | null;
  /** Proposed (design pass): profiles.birthday. */
  birthday?: string | null;
  /** D-15(c): a manual lever, off by default. `false` → 403 FORBIDDEN on every authenticated route. */
  is_active: boolean;
}
export interface BedRec {
  id: string;
  label: string;
  room: string;
  bunk_type: BunkType;
  monthly_rate: Centavos;
  status: BedStatus;
  photo_url: string | null;
}
export interface TenancyRec {
  id: string;
  renter_id: string;
  bed_id: string;
  move_in: string;
  move_out: string | null;
  deposit: Centavos | null;
  is_active: boolean;
}
export interface ChargeRec {
  id: string;
  tenancy_id: string;
  period: string;
  amount: Centavos;
  due_date: string;
  created_at: string;
}
export interface BillRec {
  id: string;
  type: BillType;
  period: string;
  total: Centavos;
  due_date: string;
  created_at: string;
}
export interface ShareRec {
  id: string;
  bill_id: string;
  tenancy_id: string;
  amount: Centavos;
  created_at: string;
}
export interface PaymentRec {
  id: string;
  tenancy_id: string;
  item_type: ItemType;
  item_id: string;
  method: PaymentMethod;
  amount: Centavos;
  applied: Centavos;
  credit: Centavos;
  reference_no: string | null;
  has_proof: boolean;
  paid_at: string;
  notes: string | null;
  verification: Verification;
  rejection_reason: string | null;
  reviewed_at: string | null;
  submitted_by: string | null;
}
export interface LedgerRec {
  id: string;
  renter_id: string;
  created_at: string;
  entry_type: LedgerEntryType;
  amount: Centavos;
  payment_id?: string;
  item?: { type: ItemType; id: string };
  refund_method?: AdminMethod;
  reference_no?: string;
  note?: string;
}
export interface AccountRec {
  method: PaymentAccount['method'];
  enabled: boolean;
  account_name: string;
  account_number: string;
  qr_url: string | null;
}
export interface SettingsRec {
  reminders_enabled: boolean;
  reminder_types: ReminderType[];
  payment_accounts: AccountRec[];
  updated_at: string;
}
export interface AnnouncementRec {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  priority: Priority;
  pinned: boolean;
  emailed_at: string | null;
  created_at: string;
  updated_at: string;
  /** D-25 (R72, R73, BR-17, BR-18). */
  kind: AnnouncementKind;
  starts_on: string | null;
  ends_on: string | null;
  start_time: string | null;
  end_time: string | null;
  publish_at: string;
  email_pending: boolean;
  /** D-30: custom order, lower = higher; unique, gaps allowed. */
  position: number;
  /** Proposed ("Post to renters"): the schedule item this notice mirrors (edits there overwrite it; deleting it deletes this). */
  schedule_event_id: string | null;
}
/** Proposed (design pass): expenses table. */
export interface ExpenseRec {
  id: string;
  spent_on: string;
  category: ExpenseCategory;
  description: string;
  amount: Centavos;
  note: string | null;
  recurring_id: string | null;
  /** Month a recurring entry was posted for (unique with recurring_id); null for one-off expenses. */
  period?: string | null;
  created_at: string;
}
/** Proposed: recurring_expenses. */
export interface RecurringRec {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: Centavos;
  due_day: number;
  starts_on: string;
  ends_on: string | null;
  active: boolean;
  note: string | null;
  /** BR-16 watermark: the last month posted (null = never). */
  last_posted_period: string | null;
  created_at: string;
}
/** Mock-only: cash received in the months before the first charge in this seed, so the revenue chart has history. */
export interface ArchiveRec {
  period: string;
  revenue: Centavos;
}
/** Proposed (promotions). */
export interface PromoRec {
  id: string;
  title: string;
  description: string | null;
  badge: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_action: PromoAction;
  cta_section: PromoSection | null;
  starts_on: string | null;
  ends_on: string | null;
  visible: boolean;
  position: number;
  created_at: string;
}
/** Mock email outbox (proposed viewing emails). */
export interface OutboxRec {
  to: string;
  template:
    | 'viewing_confirmation'
    | 'viewing_reschedule'
    | 'viewing_cancellation'
    | 'viewing_reminder'
    | 'event_confirmation'
    | 'event_change'
    | 'event_cancellation'
    | 'event_reminder'
    | 'maintenance_new'
    | 'maintenance_done'
    | 'maintenance_declined';
  inquiry_id?: string;
  event_id?: string;
  request_id?: string;
  subject: string;
  sent_at: string;
}
/** D-26: maintenance_requests. `photos` stand in for the private bucket objects (the API only returns signed URLs). */
export interface MaintenanceRec {
  id: string;
  renter_id: string;
  tenancy_id: string;
  category: MaintenanceCategory;
  urgency: MaintenanceUrgency;
  description: string;
  status: MaintenanceStatus;
  admin_note: string | null;
  decline_reason: string | null;
  photos: string[];
  created_at: string;
  status_changed_at: string;
  updated_at: string;
}
/** Proposed: schedule_events (renter and other admin calendar items). */
export interface ScheduleEventRec {
  id: string;
  type: 'renter' | 'other';
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  renter_id: string | null;
  note: string | null;
  notify_renter: boolean;
  /** The starts_at a reminder was sent for (a time change re-arms it). */
  reminder_sent_for: string | null;
  created_at: string;
  /** Other items only: the linked maintenance notice ("Post to renters"). */
  announcement_id: string | null;
  /** Other items only: the renter request this item fixes ("Schedule fix"); the request shows its date. */
  maintenance_request_id?: string | null;
}
export interface InquiryRec extends Inquiry {
  /** R69 cap (D-23): visitor emails sent for this inquiry; at most VISITOR_EMAIL_CAP. */
  visitor_emails_sent?: number;
  status: InquiryStatus;
}

export interface MockDb {
  profiles: ProfileRec[];
  beds: BedRec[];
  tenancies: TenancyRec[];
  charges: ChargeRec[];
  bills: BillRec[];
  shares: ShareRec[];
  payments: PaymentRec[];
  ledger: LedgerRec[];
  inquiries: InquiryRec[];
  announcements: AnnouncementRec[];
  reads: Set<string>;
  settings: SettingsRec;
  expenses: ExpenseRec[];
  recurring: RecurringRec[];
  promotions: PromoRec[];
  outbox: OutboxRec[];
  scheduleEvents: ScheduleEventRec[];
  maintenance: MaintenanceRec[];
  /** Inquiry ids already reminded for their current scheduled_at (reminder job idempotency). */
  reminded: Set<string>;
  /** Proposed settings flag: show the Promos section on the public page. */
  promoSection: boolean;
  /** Proposed: the birthday greeting template (one for everyone). */
  greeting: GreetingSettings;
  archive: ArchiveRec[];
  /** Access token → user id. Refresh token → user id. */
  accessTokens: Map<string, string>;
  refreshTokens: Map<string, string>;
  seq: number;
  /** "Today" in Manila; overridable in tests (like the server's CLOCK_OVERRIDE). */
  today: () => string;
}

export let db: MockDb = createDb();

export function createDb(): MockDb {
  const data = seed();
  const created: MockDb = {
    ...data,
    reads: new Set(data.reads),
    outbox: [],
    reminded: new Set(),
    accessTokens: new Map(),
    refreshTokens: new Map(),
    seq: 1000,
    today: () => manilaToday(),
  };
  // Seed history: the templates have never posted, so the first run posts every month from their start (BR-16).
  postRecurringExpenses(created);
  return created;
}


/** BR-16 on re-activation (Bernie, 2026-10-15): the month before the current one, so the current month posts on resume even if
 * its due day passed while paused, and earlier paused months are never back-filled. */
export function resumeWatermark(today: string): string {
  return addMonths(periodOf(today), -1);
}

/**
 * The posting job (BR-16; mock of the daily job B33). For each active template, every month after its watermark
 * `last_posted_period` (or from the start month) up to the current month, within start/end, whose due date has come,
 * gets one expense (unique per template + period) and the watermark advances. So a missed run catches up, reruns never
 * duplicate, and a posted entry the admin deletes is never posted again. Entries copy the amount at posting time.
 */
export function postRecurringExpenses(d: MockDb): number {
  let posted = 0;
  const today = d.today();
  for (const r of d.recurring.filter((x) => x.active)) {
    for (let p = r.last_posted_period ? addMonths(r.last_posted_period, 1) : r.starts_on; p <= periodOf(today); p = addMonths(p, 1)) {
      if (p < r.starts_on) continue;
      if (r.ends_on && p > r.ends_on) break;
      const spentOn = recurringDueDate(r.due_day, p);
      if (spentOn > today) break;
      if (!d.expenses.some((e) => e.recurring_id === r.id && e.period === p)) {
        d.expenses.push({ id: `exp-${r.id}-${p.slice(0, 7)}`, spent_on: spentOn, category: r.category, description: r.name, amount: r.amount, note: null, recurring_id: r.id, period: p, created_at: `${spentOn}T06:00:00+08:00` });
        posted += 1;
      }
      r.last_posted_period = p;
    }
  }
  return posted;
}

export function resetDb(): void {
  db = createDb();
}

export function nextId(prefix: string): string {
  db.seq += 1;
  return `${prefix}-${db.seq}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export const money = fromCentavos;
export const cents = toCentavos;

// ---------- Lookups ----------
export const profileById = (id: string) => db.profiles.find((p) => p.id === id);
export const bedById = (id: string) => db.beds.find((b) => b.id === id);
export const tenancyById = (id: string) => db.tenancies.find((t) => t.id === id);
export const activeTenancyOf = (renterId: string) => db.tenancies.find((t) => t.renter_id === renterId && t.is_active);
export const activeTenancyOnBed = (bedId: string) => db.tenancies.find((t) => t.bed_id === bedId && t.is_active);
export const tenanciesOf = (renterId: string) => db.tenancies.filter((t) => t.renter_id === renterId);

export interface ItemRec {
  type: ItemType;
  rec: ChargeRec | ShareRec;
  period: string;
  due_date: string;
  bill?: BillRec;
}

export function findItem(type: ItemType, id: string): ItemRec | undefined {
  if (type === 'charge') {
    const rec = db.charges.find((c) => c.id === id);
    return rec && { type, rec, period: rec.period, due_date: rec.due_date };
  }
  const rec = db.shares.find((s) => s.id === id);
  if (!rec) return undefined;
  const bill = db.bills.find((b) => b.id === rec.bill_id)!;
  return { type, rec, period: bill.period, due_date: bill.due_date, bill };
}

export function itemRef(item: ItemRec): Item {
  return item.type === 'charge'
    ? { type: 'charge', id: item.rec.id, period: item.period }
    : { type: 'bill_share', id: item.rec.id, period: item.period, bill_type: item.bill!.type };
}

export function itemRefOf(type: ItemType, id: string): Item {
  const item = findItem(type, id);
  return item ? itemRef(item) : { type, id, period: '' };
}

export const renterOfTenancy = (tenancyId: string) => tenancyById(tenancyId)?.renter_id;

// ---------- BR-1, BR-3 ----------
const livePayments = (type: ItemType, id: string) =>
  db.payments.filter((p) => p.item_type === type && p.item_id === id && p.verification !== 'rejected');

export function paidTotal(type: ItemType, id: string): Centavos {
  return livePayments(type, id).reduce((s, p) => s + p.applied, 0);
}

export function remainingOf(item: ItemRec): Centavos {
  return Math.max(0, item.rec.amount - paidTotal(item.type, item.rec.id));
}

export function statusOf(item: ItemRec): ItemStatus {
  const paid = paidTotal(item.type, item.rec.id);
  if (item.rec.amount - paid <= 0) return 'paid';
  return paid > 0 ? 'partial' : 'unpaid';
}

export function isOverdue(item: ItemRec): boolean {
  return item.due_date < db.today() && statusOf(item) !== 'paid';
}

export function toChargeRow(item: ItemRec, withAdmin: boolean): ChargeRow | ShareRow {
  const tenancy = tenancyById(item.rec.tenancy_id)!;
  const live = livePayments(item.type, item.rec.id);
  const row: ChargeRow = {
    id: item.rec.id,
    item: itemRef(item),
    tenancy_id: tenancy.id,
    amount: money(item.rec.amount),
    paid_total: money(paidTotal(item.type, item.rec.id)),
    paid_from_credit: money(live.filter((p) => p.method === 'credit').reduce((s, p) => s + p.applied, 0)),
    remaining: money(remainingOf(item)),
    due_date: item.due_date,
    status: statusOf(item),
    is_overdue: isOverdue(item),
  };
  if (withAdmin) {
    const renter = profileById(tenancy.renter_id)!;
    const bed = bedById(tenancy.bed_id)!;
    row.renter = { id: renter.id, full_name: renter.full_name };
    row.bed = { id: bed.id, label: bed.label, room: bed.room };
  }
  return item.type === 'bill_share' ? { ...row, bill_id: (item.rec as ShareRec).bill_id } : row;
}

export function itemsOfRenter(renterId: string): ItemRec[] {
  const tenancyIds = new Set(tenanciesOf(renterId).map((t) => t.id));
  const charges = db.charges.filter((c) => tenancyIds.has(c.tenancy_id)).map((c) => findItem('charge', c.id)!);
  const shares = db.shares.filter((s) => tenancyIds.has(s.tenancy_id)).map((s) => findItem('bill_share', s.id)!);
  return [...charges, ...shares];
}

/** Open items, oldest due date first, then oldest created (BR-10 order). */
export function openItemsOf(renterId: string): ItemRec[] {
  return itemsOfRenter(renterId)
    .filter((i) => statusOf(i) !== 'paid')
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.rec.created_at.localeCompare(b.rec.created_at));
}

// ---------- Credit (BR-9 to BR-14) ----------
export function creditBalance(renterId: string): Centavos {
  return db.ledger.filter((l) => l.renter_id === renterId).reduce((s, l) => s + l.amount, 0);
}

export function addLedger(entry: Omit<LedgerRec, 'id' | 'created_at'>): LedgerRec {
  const rec: LedgerRec = { id: nextId('led'), created_at: nowIso(), ...entry };
  db.ledger.push(rec);
  return rec;
}

export function toLedgerEntry(rec: LedgerRec): LedgerEntry {
  return {
    id: rec.id,
    created_at: rec.created_at,
    entry_type: rec.entry_type,
    amount: money(rec.amount),
    ...(rec.item ? { item: itemRefOf(rec.item.type, rec.item.id) } : {}),
    ...(rec.payment_id ? { payment_id: rec.payment_id } : {}),
    ...(rec.refund_method ? { refund_method: rec.refund_method } : {}),
    ...(rec.reference_no ? { reference_no: rec.reference_no } : {}),
    ...(rec.note ? { note: rec.note } : {}),
  };
}

export function ledgerOf(renterId: string) {
  const entries = db.ledger
    .filter((l) => l.renter_id === renterId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(toLedgerEntry);
  return { balance: money(creditBalance(renterId)), entries };
}

/** BR-10: applies available credit to open items, oldest due first. Returns the applications. */
export function applyCredit(renterId: string, actingUser: string | null): { item: Item; amount: number }[] {
  const applied: { item: Item; amount: number }[] = [];
  let balance = creditBalance(renterId);
  for (const item of openItemsOf(renterId)) {
    if (balance <= 0) break;
    const x = Math.min(balance, remainingOf(item));
    if (x <= 0) continue;
    const payment: PaymentRec = {
      id: nextId('pay'),
      tenancy_id: item.rec.tenancy_id,
      item_type: item.type,
      item_id: item.rec.id,
      method: 'credit',
      amount: x,
      applied: x,
      credit: 0,
      reference_no: null,
      has_proof: false,
      paid_at: nowIso(),
      notes: null,
      verification: 'confirmed',
      rejection_reason: null,
      reviewed_at: null,
      submitted_by: actingUser,
    };
    db.payments.push(payment);
    addLedger({ renter_id: renterId, entry_type: 'application', amount: -x, payment_id: payment.id, item: { type: item.type, id: item.rec.id } });
    balance -= x;
    applied.push({ item: itemRef(item), amount: money(x) });
  }
  return applied;
}

/** BR-9 + BR-10: records an external payment and returns the PayResult pieces. */
export function recordPayment(input: {
  item: ItemRec;
  method: Exclude<PaymentMethod, 'credit'>;
  amount: Centavos;
  reference_no: string | null;
  has_proof: boolean;
  paid_at: string;
  notes: string | null;
  verification: Verification;
  submitted_by: string;
}) {
  const remaining = remainingOf(input.item);
  const applied = Math.min(input.amount, remaining);
  const payment: PaymentRec = {
    id: nextId('pay'),
    tenancy_id: input.item.rec.tenancy_id,
    item_type: input.item.type,
    item_id: input.item.rec.id,
    method: input.method,
    amount: input.amount,
    applied,
    credit: input.amount - applied,
    reference_no: input.reference_no,
    has_proof: input.has_proof,
    paid_at: input.paid_at,
    notes: input.notes,
    verification: input.verification,
    rejection_reason: null,
    reviewed_at: input.verification === 'confirmed' ? nowIso() : null,
    submitted_by: input.submitted_by,
  };
  db.payments.push(payment);
  const renterId = renterOfTenancy(payment.tenancy_id)!;
  if (payment.credit > 0) {
    addLedger({ renter_id: renterId, entry_type: 'overpayment', amount: payment.credit, payment_id: payment.id, item: { type: payment.item_type, id: payment.item_id } });
  }
  const creditApplied = applyCredit(renterId, input.submitted_by);
  return {
    payment: toPayment(payment, false),
    item_status: statusOf(input.item),
    remaining: money(remainingOf(input.item)),
    credit_added: money(payment.credit),
    credit_applied: creditApplied,
    credit_balance: money(creditBalance(renterId)),
  };
}

/** BR-2: (method, upper(trim(reference))) is unique across all payments, rejected ones included. */
export function isDuplicateReference(method: string, reference: string | null): boolean {
  if (!reference) return false;
  const key = reference.trim().toUpperCase();
  return db.payments.some((p) => p.method === method && p.reference_no?.trim().toUpperCase() === key);
}

/** `C − min(C, max(balance, 0))`: how much of a payment's credit is already used (S11 warning). */
export function creditAlreadyUsed(p: PaymentRec): Centavos {
  if (p.credit <= 0) return 0;
  const balance = creditBalance(renterOfTenancy(p.tenancy_id)!);
  return p.credit - Math.min(p.credit, Math.max(balance, 0));
}

export function toPayment(p: PaymentRec, withAdmin: boolean): Payment {
  const out: Payment = {
    id: p.id,
    item: itemRefOf(p.item_type, p.item_id),
    method: p.method,
    amount: money(p.amount),
    applied_amount: money(p.applied),
    credit_amount: money(p.credit),
    reference_no: p.reference_no,
    has_proof: p.has_proof,
    paid_at: p.paid_at,
    notes: p.notes,
    verification: p.verification,
    rejection_reason: p.rejection_reason,
    reviewed_at: p.reviewed_at,
  };
  // D-27 (R77): renter rows say who submitted it (an admin-recorded GCash payment looks like a confirmed upload otherwise).
  if (!withAdmin) out.source = p.method !== 'credit' && p.submitted_by && profileById(p.submitted_by)?.role === 'renter' ? 'renter' : 'admin'; // credit rows: always admin (D-29)
  if (withAdmin) {
    const renter = profileById(renterOfTenancy(p.tenancy_id)!)!;
    out.renter = { id: renter.id, full_name: renter.full_name };
    out.credit_already_used = money(creditAlreadyUsed(p));
  }
  return out;
}

/** BR-11: reject a payment, reverse its credit, unwind applications, re-apply any overshoot. */
export function rejectPayment(p: PaymentRec, reason: string, adminId: string) {
  const renterId = renterOfTenancy(p.tenancy_id)!;
  const reopened = new Map<string, ItemRec>();
  const track = (type: ItemType, id: string) => {
    const item = findItem(type, id)!;
    const before = statusOf(item);
    return () => {
      if (before === 'paid' && statusOf(item) !== 'paid') reopened.set(`${type}:${id}`, item);
    };
  };

  const after = track(p.item_type, p.item_id);
  p.verification = 'rejected';
  p.rejection_reason = reason;
  p.reviewed_at = nowIso();
  after();

  if (p.credit > 0) {
    addLedger({ renter_id: renterId, entry_type: 'reversal', amount: -p.credit, payment_id: p.id });
    const credits = () =>
      db.payments
        .filter((x) => x.method === 'credit' && x.verification !== 'rejected' && renterOfTenancy(x.tenancy_id) === renterId)
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.id.localeCompare(a.id));
    while (creditBalance(renterId) < 0 && credits().length > 0) {
      const c = credits()[0];
      const done = track(c.item_type, c.item_id);
      c.verification = 'rejected';
      c.rejection_reason = `Credit reversed: payment ${p.method} ${p.reference_no ?? ''} was rejected`.trim();
      c.reviewed_at = nowIso();
      addLedger({ renter_id: renterId, entry_type: 'application_reversal', amount: c.amount, payment_id: c.id, item: { type: c.item_type, id: c.item_id } });
      done();
    }
    if (creditBalance(renterId) > 0) applyCredit(renterId, adminId);
  }
  return {
    payment: toPayment(p, true),
    credit_reversed: money(p.credit),
    items_reopened: [...reopened.values()].map((item) => ({ item: itemRef(item), remaining: money(remainingOf(item)) })),
    credit_balance: money(creditBalance(renterId)),
  };
}

// ---------- BR-4 and renter rows ----------
export function balanceOf(renterId: string) {
  const open = openItemsOf(renterId);
  const credit = creditBalance(renterId);
  const outstanding = open.reduce((s, i) => s + remainingOf(i), 0) + Math.max(0, -credit);
  const status = open.some(isOverdue) ? 'overdue' : outstanding > 0 ? 'due' : 'paid';
  return {
    outstanding: money(outstanding),
    next_due_date: open[0]?.due_date ?? null,
    status: status as 'due' | 'overdue' | 'paid',
    credit_balance: money(credit),
  };
}

export function toRenterRow(p: ProfileRec): RenterRow {
  const active = activeTenancyOf(p.id);
  const all = tenanciesOf(p.id).sort((a, b) => b.move_in.localeCompare(a.move_in));
  const credit = creditBalance(p.id);
  const bed = active ? bedById(active.bed_id)! : null;
  return {
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    phone: p.phone,
    language: p.language,
    status: active ? 'active' : 'moved_out',
    invite_pending: p.activated_at === null,
    tenancy:
      active && bed
        ? { id: active.id, bed: { id: bed.id, label: bed.label, room: bed.room }, move_in: active.move_in, due_day: Number(active.move_in.slice(8, 10)) }
        : null,
    last_tenancy_id: all[0]?.id ?? null,
    last_move_out: all.find((t) => t.move_out)?.move_out ?? null,
    outstanding: balanceOf(p.id).outstanding,
    credit_balance: money(credit),
    refund_due: !active && credit > 0 ? money(credit) : 0,
    birthday: p.birthday ?? null,
    unpaid_months: new Set(openItemsOf(p.id).map((i) => i.period)).size,
  };
}

export function toBed(b: BedRec): Bed {
  const tenancy = activeTenancyOnBed(b.id);
  const renter = tenancy ? profileById(tenancy.renter_id) : undefined;
  return {
    id: b.id,
    label: b.label,
    room: b.room,
    bunk_type: b.bunk_type,
    monthly_rate: money(b.monthly_rate),
    status: b.status,
    photo_url: b.photo_url,
    current_renter: renter ? { id: renter.id, full_name: renter.full_name } : null,
    has_history: db.tenancies.some((t) => t.bed_id === b.id),
  };
}

/** BR-17: a renter sees it once published and, for a maintenance notice, until the end of its To date (Manila). */
export function isLive(a: AnnouncementRec, d: MockDb = db): boolean {
  return Date.parse(a.publish_at) <= Date.now() && (a.kind === 'general' || (a.ends_on ?? '') >= d.today());
}

/** BR-17 admin status (derived, never stored). */
export function announcementStatus(a: AnnouncementRec, d: MockDb = db): AnnouncementStatus {
  if (Date.parse(a.publish_at) > Date.now()) return 'scheduled';
  return a.kind === 'maintenance' && (a.ends_on ?? '') < d.today() ? 'ended' : 'published';
}

/** Admin rows carry publish_at, status and email_pending; renter rows don't (and add is_read). */
export function toAnnouncement(a: AnnouncementRec, renterId?: string): Announcement {
  if (!renterId) return { ...a, status: announcementStatus(a) };
  const { publish_at: _p, email_pending: _e, position: _o, schedule_event_id: _s, ...shown } = a;
  return { ...shown, is_read: db.reads.has(`${a.id}:${renterId}`) };
}

/** D-26 API shape; renter + bed only for the admin. */
export function toMaintenance({ renter_id, tenancy_id, photos, ...m }: MaintenanceRec, withAdmin = false): MaintenanceRequest {
  const fix = db.scheduleEvents.find((e) => e.maintenance_request_id === m.id);
  const out: MaintenanceRequest = { ...m, photo_count: photos.length, scheduled_fix: fix ? { starts_at: fix.starts_at, all_day: fix.all_day } : null };
  if (withAdmin) {
    const renter = profileById(renter_id)!;
    const bed = bedById(tenancyById(tenancy_id)?.bed_id ?? '');
    out.renter = { id: renter.id, full_name: renter.full_name };
    out.bed = bed ? { id: bed.id, label: bed.label, room: bed.room } : null;
  }
  return out;
}

/** D-26 mock email (R75 rules; English only). */
export function notifyMaintenance(d: MockDb, m: MaintenanceRec, template: 'maintenance_new' | 'maintenance_done' | 'maintenance_declined') {
  const category = m.category === 'wifi' ? 'Wi-Fi' : m.category === 'aircon' ? 'Aircon' : m.category[0].toUpperCase() + m.category.slice(1);
  const sent_at = new Date().toISOString();
  if (template === 'maintenance_new') {
    const urgency = m.urgency[0].toUpperCase() + m.urgency.slice(1);
    d.outbox.push({ to: ADMIN_NOTIFY_EMAIL, template, request_id: m.id, subject: `[Admin] iRent: New maintenance request: ${category} (${urgency})`, sent_at });
    return;
  }
  const subject = template === 'maintenance_done' ? `iRent: Your ${category.toLowerCase()} request is done` : `iRent: Your ${category.toLowerCase()} request was declined`;
  d.outbox.push({ to: profileById(m.renter_id)!.email, template, request_id: m.id, subject, sent_at });
}

/** D-30 custom order: pinned first, then position (what renters see; the admin's "Custom order"). */
export const byCustomOrder = (a: AnnouncementRec, b: AnnouncementRec) => Number(b.pinned) - Number(a.pinned) || a.position - b.position;

/** D-30: a new or newly (un)pinned post goes to the top of its group: min(position) − 1, no renumbering. */
export const topPosition = (d: MockDb = db) => Math.min(1, ...d.announcements.map((a) => a.position)) - 1;

/**
 * BR-18 publish job (mock of the 5-minute job + the run at start): claims each due pending email once
 * (email_pending → false, emailed_at = now), so reruns send nothing. Returns how many went out.
 */
export function publishAnnouncements(d: MockDb): number {
  const due = d.announcements.filter((a) => a.email_pending && Date.parse(a.publish_at) <= Date.now());
  for (const a of due) Object.assign(a, { email_pending: false, emailed_at: new Date().toISOString() });
  return due.length;
}

// ---------- Rent generation (R36, BR-8) and bills (R39, BR-5) ----------
export function generateRent(period: string, actingUser: string) {
  let created = 0;
  let skippedExisting = 0;
  let skippedNotMovedIn = 0;
  let creditTotal = 0;
  for (const t of db.tenancies.filter((x) => x.is_active)) {
    if (db.charges.some((c) => c.tenancy_id === t.id && c.period === period)) {
      skippedExisting += 1;
      continue;
    }
    const due = dueDateFor(t.move_in, period);
    if (t.move_in > due) {
      skippedNotMovedIn += 1;
      continue;
    }
    db.charges.push({ id: nextId('chg'), tenancy_id: t.id, period, amount: bedById(t.bed_id)!.monthly_rate, due_date: due, created_at: nowIso() });
    created += 1;
    creditTotal += applyCredit(t.renter_id, actingUser).reduce((s, a) => s + cents(a.amount), 0);
  }
  return { created, skipped_existing: skippedExisting, skipped_not_moved_in: skippedNotMovedIn, credit_applied_total: money(creditTotal) };
}

/** Active tenancies ordered by move-in date, then id (BR-5 order). */
export function activeTenanciesOrdered(): TenancyRec[] {
  return db.tenancies.filter((t) => t.is_active).sort((a, b) => a.move_in.localeCompare(b.move_in) || a.id.localeCompare(b.id));
}

export function splitEqually(total: Centavos): { tenancy_id: string; amount: Centavos }[] {
  const tenancies = activeTenanciesOrdered();
  const parts = equalSplit(total, tenancies.length);
  return tenancies.map((t, i) => ({ tenancy_id: t.id, amount: parts[i] }));
}

export function currentPeriod(): string {
  return periodOf(db.today());
}

export const ADMIN_NOTIFY_EMAIL = 'admin@irent.test';

/** Manila business date of an instant. */
export const manilaDateOf = (iso: string) => manilaToday(new Date(iso));

export const VISITOR_EMAIL_CAP = 6;

/**
 * Mock email service (R69): the visitor gets a copy only when they left an email and fewer than 6 visitor emails went
 * out for this inquiry (an unverified address can't be mailed without limit); the admin always does.
 */
export function notifyViewing(d: MockDb, inquiry: InquiryRec, template: OutboxRec['template'], subject: string) {
  const sent_at = new Date().toISOString();
  const sent = inquiry.visitor_emails_sent ?? 0;
  const visitor_skipped = !inquiry.email ? ('no_email' as const) : sent >= VISITOR_EMAIL_CAP ? ('cap' as const) : undefined;
  if (!visitor_skipped) {
    d.outbox.push({ to: inquiry.email!, template, inquiry_id: inquiry.id, subject, sent_at });
    inquiry.visitor_emails_sent = sent + 1;
  }
  d.outbox.push({ to: ADMIN_NOTIFY_EMAIL, template, inquiry_id: inquiry.id, subject: `[Admin] ${subject}`, sent_at });
  return { visitor: !visitor_skipped, admin: true, ...(visitor_skipped ? { visitor_skipped } : {}) };
}

/** The API shape of an inquiry (the cap counter stays server-side). */
export const toInquiry = ({ visitor_emails_sent: _v, ...i }: InquiryRec): Inquiry => i;

/** Reminder job (proposed, daily 08:00 Manila): viewings tomorrow get one reminder each (visitor + admin). */
export function sendViewingReminders(d: MockDb): number {
  const tomorrow = addDays(d.today(), 1);
  let sent = 0;
  for (const i of d.inquiries.filter((x) => x.status === 'scheduled' && x.scheduled_at && manilaDateOf(x.scheduled_at) === tomorrow)) {
    const key = `${i.id}@${i.scheduled_at}`;
    if (d.reminded.has(key)) continue;
    notifyViewing(d, i, 'viewing_reminder', 'Reminder: your viewing is tomorrow');
    d.reminded.add(key);
    sent += 1;
  }
  // Schedule events tomorrow: the admin always, the renter if they opted in.
  for (const e of d.scheduleEvents.filter((x) => manilaDateOf(x.starts_at) === tomorrow && x.reminder_sent_for !== x.starts_at)) {
    const sent_at = new Date().toISOString();
    if (e.notify_renter) notifyRenterEvent(d, e, 'event_reminder');
    d.outbox.push({ to: ADMIN_NOTIFY_EMAIL, template: 'event_reminder', event_id: e.id, subject: `[Admin] Reminder: ${e.title} tomorrow`, sent_at });
    e.reminder_sent_for = e.starts_at;
    sent += 1;
  }
  return sent;
}

const EVENT_SUBJECT: Record<'event_confirmation' | 'event_change' | 'event_cancellation' | 'event_reminder', string> = {
  event_confirmation: 'Scheduled',
  event_change: 'Changed',
  event_cancellation: 'Cancelled',
  event_reminder: 'Reminder, tomorrow',
};

/** Email the renter of a renter schedule (only when notify_renter). Returns whether an email went out. */
export function notifyRenterEvent(d: MockDb, e: ScheduleEventRec, template: keyof typeof EVENT_SUBJECT): boolean {
  const renter = e.renter_id ? profileById(e.renter_id) : undefined;
  if (e.type !== 'renter' || !e.notify_renter || !renter) return false;
  d.outbox.push({ to: renter.email, template, event_id: e.id, subject: `${EVENT_SUBJECT[template]}: ${e.title}`, sent_at: new Date().toISOString() });
  return true;
}

export function toScheduleEvent(e: ScheduleEventRec): import('../types/api').ScheduleEvent {
  const renter = e.renter_id ? profileById(e.renter_id) : undefined;
  return {
    id: e.id,
    type: e.type,
    title: e.title,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    all_day: e.all_day,
    renter: renter ? { id: renter.id, full_name: renter.full_name } : null,
    note: e.note,
    notify_renter: e.notify_renter,
    announcement_id: e.announcement_id,
    maintenance_request_id: e.maintenance_request_id ?? null,
  };
}
