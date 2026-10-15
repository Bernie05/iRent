-- iRent B4: RLS policies, grants, storage policies (defense in depth; the API uses the
-- service role and enforces permissions itself).
-- Rollback: supabase/rollbacks/20260925000200_rls.down.sql
-- Source: SPEC.md → Permissions, NFR1, R26, BR-14, D-9.

-- New functions are not callable by clients unless granted explicitly
-- (Supabase grants EXECUTE to anon/authenticated by default).
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- security definer so the lookup itself is not subject to profiles RLS (no recursion).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active
  );
$$;

-- Tenancy ids of the calling renter (current and past; OQ-6 = A).
create or replace function public.my_tenancy_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.tenancies t where t.renter_id = (select auth.uid());
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.my_tenancy_ids() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.my_tenancy_ids() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.beds               enable row level security;
alter table public.tenancies          enable row level security;
alter table public.rent_charges       enable row level security;
alter table public.utility_bills      enable row level security;
alter table public.bill_shares        enable row level security;
alter table public.payments           enable row level security;
alter table public.credit_ledger      enable row level security;
alter table public.inquiries          enable row level security;
alter table public.announcements      enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.notifications_log  enable row level security;
alter table public.app_settings       enable row level security;

-- ---------------------------------------------------------------------------
-- Grants. Clients (anon, authenticated) never write; they may only SELECT, and RLS
-- decides which rows. anon gets nothing at all. The service role keeps full access
-- except UPDATE/DELETE on the append-only credit ledger.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

-- The only client-side write: a renter marking an announcement read (own rows, RLS-checked).
grant insert on public.announcement_reads to authenticated;

-- Future tables do not silently become readable/writable by clients.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- BR-14 / D-9: the ledger is append-only for every role, including the service role.
revoke update, delete, truncate on public.credit_ledger from anon, authenticated, service_role;

create or replace function public.credit_ledger_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'credit_ledger is append-only' using errcode = '42501';
end;
$$;
create trigger credit_ledger_no_update before update or delete on public.credit_ledger
  for each row execute function public.credit_ledger_append_only();

-- ---------------------------------------------------------------------------
-- Policies (SELECT only; no insert/update/delete policies on money tables)
-- ---------------------------------------------------------------------------
-- profiles: own row, or admin.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

-- beds: beds of the renter's own tenancies, or admin.
create policy beds_select on public.beds for select to authenticated
  using (
    (select public.is_admin())
    or id in (select t.bed_id from public.tenancies t where t.renter_id = (select auth.uid()))
  );

create policy tenancies_select on public.tenancies for select to authenticated
  using (renter_id = (select auth.uid()) or (select public.is_admin()));

create policy rent_charges_select on public.rent_charges for select to authenticated
  using ((select public.is_admin()) or tenancy_id in (select public.my_tenancy_ids()));

create policy bill_shares_select on public.bill_shares for select to authenticated
  using ((select public.is_admin()) or tenancy_id in (select public.my_tenancy_ids()));

-- bills: only through the renter's own shares.
create policy utility_bills_select on public.utility_bills for select to authenticated
  using (
    (select public.is_admin())
    or id in (select s.bill_id from public.bill_shares s where s.tenancy_id in (select public.my_tenancy_ids()))
  );

create policy payments_select on public.payments for select to authenticated
  using ((select public.is_admin()) or tenancy_id in (select public.my_tenancy_ids()));

create policy credit_ledger_select on public.credit_ledger for select to authenticated
  using (renter_id = (select auth.uid()) or (select public.is_admin()));

create policy announcements_select on public.announcements for select to authenticated
  using (true);

create policy announcement_reads_select on public.announcement_reads for select to authenticated
  using (renter_id = (select auth.uid()) or (select public.is_admin()));
create policy announcement_reads_insert on public.announcement_reads for insert to authenticated
  with check (renter_id = (select auth.uid()));

-- admin-only tables
create policy inquiries_select on public.inquiries for select to authenticated
  using ((select public.is_admin()));
create policy notifications_log_select on public.notifications_log for select to authenticated
  using ((select public.is_admin()));
create policy app_settings_select on public.app_settings for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Storage: public-media = public read (bucket is public) + admin write;
--          receipts = no client policies at all (server / service role only).
-- ---------------------------------------------------------------------------
create policy public_media_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'public-media');
create policy public_media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and (select public.is_admin()));
create policy public_media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'public-media' and (select public.is_admin()))
  with check (bucket_id = 'public-media' and (select public.is_admin()));
create policy public_media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'public-media' and (select public.is_admin()));
