-- iRent B3: schema (enums, 13 tables, constraints, indexes, updated_at triggers,
-- view renter_credit_balances, storage buckets).
-- Rollback: supabase/rollbacks/20260925000100_schema.down.sql
-- Source: SPEC.md → Data Model, BR-2, BR-6, BR-7, BR-14, D-3, D-4, D-9.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role            as enum ('admin', 'renter');
create type public.lang_code            as enum ('en', 'fil');
create type public.bunk_type            as enum ('lower', 'upper');
create type public.bed_status           as enum ('vacant', 'occupied', 'reserved');
create type public.item_status          as enum ('unpaid', 'partial', 'paid');
create type public.payment_method       as enum ('gcash', 'maya', 'bpi', 'cash', 'credit');
create type public.verification_status  as enum ('auto_verified', 'confirmed', 'rejected');
create type public.ledger_entry_type    as enum ('overpayment', 'application', 'reversal', 'application_reversal', 'refund');
create type public.refund_method        as enum ('cash', 'gcash', 'maya', 'bpi');
create type public.bill_type            as enum ('electricity', 'water', 'internet');
create type public.inquiry_status       as enum ('new', 'contacted', 'scheduled', 'closed');
create type public.announcement_priority as enum ('normal', 'urgent');
create type public.reminder_type        as enum ('due_minus_3', 'due_today', 'overdue_1', 'overdue_3', 'overdue_7');

-- ---------------------------------------------------------------------------
-- updated_at trigger function
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (id = auth.users.id)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id),   -- no cascade: renters are never hard-deleted
  full_name    text not null check (char_length(full_name) between 1 and 100),
  email        text not null check (char_length(email) between 3 and 254),
  phone        text check (phone is null or char_length(phone) <= 20),
  role         public.user_role not null default 'renter',
  language     public.lang_code not null default 'en',
  is_active    boolean not null default true,
  invited_at   timestamptz,
  activated_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index profiles_email_uniq on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- beds
-- ---------------------------------------------------------------------------
create table public.beds (
  id           uuid primary key default gen_random_uuid(),
  label        text not null check (char_length(label) between 1 and 60),
  room         text not null check (char_length(room) between 1 and 40),
  bunk_type    public.bunk_type not null,
  monthly_rate numeric(12,2) not null check (monthly_rate >= 1 and monthly_rate <= 100000),
  status       public.bed_status not null default 'vacant',
  photo_url    text,                                      -- storage path in public-media
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint beds_label_key unique (label)
);
create index beds_status_idx on public.beds (status);

-- ---------------------------------------------------------------------------
-- tenancies
-- ---------------------------------------------------------------------------
create table public.tenancies (
  id         uuid primary key default gen_random_uuid(),
  renter_id  uuid not null references public.profiles (id) on delete restrict,
  bed_id     uuid not null references public.beds (id) on delete restrict,
  move_in    date not null,
  move_out   date,
  deposit    numeric(12,2) check (deposit is null or (deposit >= 0 and deposit <= 100000)),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenancies_move_out_after_move_in check (move_out is null or move_out >= move_in),
  constraint tenancies_active_matches_move_out check (is_active = (move_out is null))
);
-- BR-7: at most one active tenancy per renter and per bed.
create unique index tenancies_one_active_per_renter on public.tenancies (renter_id) where is_active;
create unique index tenancies_one_active_per_bed    on public.tenancies (bed_id)    where is_active;
create index tenancies_renter_idx on public.tenancies (renter_id);
create index tenancies_bed_idx    on public.tenancies (bed_id);

-- ---------------------------------------------------------------------------
-- rent_charges
-- ---------------------------------------------------------------------------
create table public.rent_charges (
  id         uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies (id) on delete restrict,
  period     date not null check (extract(day from period) = 1),
  amount     numeric(12,2) not null check (amount > 0),
  due_date   date not null,
  status     public.item_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rent_charges_tenancy_period_key unique (tenancy_id, period)
);
create index rent_charges_period_idx on public.rent_charges (period);
create index rent_charges_open_due_idx on public.rent_charges (due_date) where status <> 'paid';

-- ---------------------------------------------------------------------------
-- utility_bills and bill_shares
-- ---------------------------------------------------------------------------
create table public.utility_bills (
  id           uuid primary key default gen_random_uuid(),
  type         public.bill_type not null,
  period       date not null check (extract(day from period) = 1),
  total_amount numeric(12,2) not null check (total_amount >= 0.01 and total_amount <= 1000000),
  due_date     date not null,
  created_by   uuid references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index utility_bills_period_idx on public.utility_bills (period desc);

create table public.bill_shares (
  id         uuid primary key default gen_random_uuid(),
  bill_id    uuid not null references public.utility_bills (id) on delete cascade,
  tenancy_id uuid not null references public.tenancies (id) on delete restrict,
  amount     numeric(12,2) not null check (amount >= 0),
  status     public.item_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bill_shares_bill_tenancy_key unique (bill_id, tenancy_id)
);
create index bill_shares_tenancy_idx on public.bill_shares (tenancy_id);

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  tenancy_id       uuid not null references public.tenancies (id) on delete restrict,
  charge_id        uuid references public.rent_charges (id) on delete restrict,
  bill_share_id    uuid references public.bill_shares (id) on delete restrict,
  amount           numeric(12,2) not null check (amount > 0 and amount <= 999999.99),
  applied_amount   numeric(12,2) not null check (applied_amount >= 0),
  credit_amount    numeric(12,2) not null default 0 check (credit_amount >= 0),
  method           public.payment_method not null,
  reference_no     text check (reference_no is null or char_length(reference_no) between 1 and 40),
  proof_url        text,                                   -- storage path in receipts (never a URL)
  paid_at          timestamptz not null default now(),
  notes            text check (notes is null or char_length(notes) <= 500),
  verification     public.verification_status not null,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  submitted_by     uuid references public.profiles (id) on delete restrict,  -- null = system/job
  reviewed_by      uuid references public.profiles (id) on delete restrict,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default clock_timestamp(),  -- wall-clock time keeps rows written in one transaction in order
  updated_at       timestamptz not null default now(),
  constraint payments_one_item check (num_nonnulls(charge_id, bill_share_id) = 1),
  constraint payments_split_sums check (applied_amount + credit_amount = amount),
  constraint payments_credit_rows check (
    method <> 'credit'
    or (reference_no is null and proof_url is null and credit_amount = 0)
  ),
  constraint payments_reference_required check (
    method not in ('gcash', 'maya', 'bpi') or reference_no is not null
  ),
  constraint payments_rejection_reason check (
    verification = 'rejected' or rejection_reason is null
  )
);
-- BR-2: (method, reference) unique across all payments incl. rejected, compared trimmed and upper-cased.
create unique index payments_method_reference_uniq
  on public.payments (method, upper(btrim(reference_no)))
  where reference_no is not null;
create index payments_charge_idx     on public.payments (charge_id) where charge_id is not null;
create index payments_bill_share_idx on public.payments (bill_share_id) where bill_share_id is not null;
create index payments_tenancy_idx    on public.payments (tenancy_id);
create index payments_review_idx     on public.payments (created_at) where verification = 'auto_verified';
create index payments_paid_at_idx    on public.payments (paid_at);

-- ---------------------------------------------------------------------------
-- credit_ledger (append-only, D-9, BR-14)
-- ---------------------------------------------------------------------------
create table public.credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  renter_id     uuid not null references public.profiles (id) on delete restrict,
  entry_type    public.ledger_entry_type not null,
  amount        numeric(12,2) not null check (amount <> 0),
  payment_id    uuid references public.payments (id) on delete restrict,
  refund_method public.refund_method,
  reference_no  text check (reference_no is null or char_length(reference_no) <= 40),
  note          text check (note is null or char_length(note) <= 500),
  created_by    uuid references public.profiles (id) on delete restrict,  -- null = system
  created_at    timestamptz not null default clock_timestamp(),  -- wall-clock time keeps rows written in one transaction in order
  constraint credit_ledger_sign check (
    case entry_type
      when 'overpayment'          then amount > 0
      when 'application_reversal' then amount > 0
      when 'application'          then amount < 0
      when 'reversal'             then amount < 0
      when 'refund'               then amount < 0
    end
  ),
  constraint credit_ledger_payment_link check (
    (entry_type = 'refund' and payment_id is null)
    or (entry_type <> 'refund' and payment_id is not null)
  ),
  constraint credit_ledger_refund_fields check (
    entry_type = 'refund' or (refund_method is null and reference_no is null)
  ),
  constraint credit_ledger_refund_method check (entry_type <> 'refund' or refund_method is not null)
);
create index credit_ledger_renter_created_idx on public.credit_ledger (renter_id, created_at);
create index credit_ledger_payment_idx on public.credit_ledger (payment_id) where payment_id is not null;

-- BR-14: the balance is only ever read through this view.
create view public.renter_credit_balances
with (security_invoker = true) as
select p.id as renter_id,
       coalesce(sum(l.amount), 0)::numeric(12,2) as balance
from public.profiles p
left join public.credit_ledger l on l.renter_id = p.id
where p.role = 'renter'
group by p.id;

-- ---------------------------------------------------------------------------
-- inquiries
-- ---------------------------------------------------------------------------
create table public.inquiries (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 2 and 100),
  phone          text not null check (char_length(phone) between 10 and 20),
  email          text check (email is null or char_length(email) <= 254),
  preferred_date date,
  message        text check (message is null or char_length(message) <= 1000),
  status         public.inquiry_status not null default 'new',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index inquiries_status_created_idx on public.inquiries (status, created_at desc);

-- ---------------------------------------------------------------------------
-- announcements and reads
-- ---------------------------------------------------------------------------
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 120),
  body       text not null check (char_length(body) between 1 and 5000),
  image_url  text,                                         -- storage path in public-media
  priority   public.announcement_priority not null default 'normal',
  pinned     boolean not null default false,
  emailed_at timestamptz,
  created_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index announcements_feed_idx on public.announcements (pinned desc, priority desc, created_at desc);

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  renter_id       uuid not null references public.profiles (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, renter_id)
);
create index announcement_reads_renter_idx on public.announcement_reads (renter_id);

-- ---------------------------------------------------------------------------
-- notifications_log (reminder dedupe, R44)
-- ---------------------------------------------------------------------------
create table public.notifications_log (
  id            uuid primary key default gen_random_uuid(),
  tenancy_id    uuid not null references public.tenancies (id) on delete restrict,
  charge_id     uuid references public.rent_charges (id) on delete cascade,
  bill_share_id uuid references public.bill_shares (id) on delete cascade,
  type          public.reminder_type not null,
  sent_at       timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint notifications_log_one_item check (num_nonnulls(charge_id, bill_share_id) = 1)
);
create unique index notifications_log_item_type_uniq
  on public.notifications_log ((coalesce(charge_id, bill_share_id)), type);
create index notifications_log_tenancy_idx on public.notifications_log (tenancy_id);

-- ---------------------------------------------------------------------------
-- app_settings (singleton, D-4)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id                int primary key default 1 check (id = 1),
  reminders_enabled boolean not null default true,
  reminder_types    text[] not null
    default array['due_minus_3', 'due_today', 'overdue_1', 'overdue_3', 'overdue_7']
    check (reminder_types <@ array['due_minus_3', 'due_today', 'overdue_1', 'overdue_3', 'overdue_7']),
  payment_accounts  jsonb not null default '[]'::jsonb check (jsonb_typeof(payment_accounts) = 'array'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger profiles_updated_at      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger beds_updated_at          before update on public.beds          for each row execute function public.set_updated_at();
create trigger tenancies_updated_at     before update on public.tenancies     for each row execute function public.set_updated_at();
create trigger rent_charges_updated_at  before update on public.rent_charges  for each row execute function public.set_updated_at();
create trigger utility_bills_updated_at before update on public.utility_bills for each row execute function public.set_updated_at();
create trigger bill_shares_updated_at   before update on public.bill_shares   for each row execute function public.set_updated_at();
create trigger payments_updated_at      before update on public.payments      for each row execute function public.set_updated_at();
create trigger inquiries_updated_at     before update on public.inquiries     for each row execute function public.set_updated_at();
create trigger announcements_updated_at before update on public.announcements for each row execute function public.set_updated_at();
create trigger app_settings_updated_at  before update on public.app_settings  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media', 'public-media', true,  5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('receipts',     'receipts',     false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
