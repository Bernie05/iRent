-- Rollback for 20260925000200_rls.sql.
drop policy if exists public_media_read         on storage.objects;
drop policy if exists public_media_admin_insert on storage.objects;
drop policy if exists public_media_admin_update on storage.objects;
drop policy if exists public_media_admin_delete on storage.objects;

drop policy if exists profiles_select           on public.profiles;
drop policy if exists beds_select               on public.beds;
drop policy if exists tenancies_select          on public.tenancies;
drop policy if exists rent_charges_select       on public.rent_charges;
drop policy if exists bill_shares_select        on public.bill_shares;
drop policy if exists utility_bills_select      on public.utility_bills;
drop policy if exists payments_select           on public.payments;
drop policy if exists credit_ledger_select      on public.credit_ledger;
drop policy if exists announcements_select      on public.announcements;
drop policy if exists announcement_reads_select on public.announcement_reads;
drop policy if exists announcement_reads_insert on public.announcement_reads;
drop policy if exists inquiries_select          on public.inquiries;
drop policy if exists notifications_log_select  on public.notifications_log;
drop policy if exists app_settings_select       on public.app_settings;

drop trigger if exists credit_ledger_no_update on public.credit_ledger;
drop function if exists public.credit_ledger_append_only();

alter table public.profiles           disable row level security;
alter table public.beds               disable row level security;
alter table public.tenancies          disable row level security;
alter table public.rent_charges       disable row level security;
alter table public.utility_bills      disable row level security;
alter table public.bill_shares        disable row level security;
alter table public.payments           disable row level security;
alter table public.credit_ledger      disable row level security;
alter table public.inquiries          disable row level security;
alter table public.announcements      disable row level security;
alter table public.announcement_reads disable row level security;
alter table public.notifications_log  disable row level security;
alter table public.app_settings       disable row level security;

-- Restore Supabase's default grants.
alter default privileges in schema public grant execute on functions to public, anon, authenticated;
grant execute on function public.set_updated_at() to public;
alter default privileges in schema public grant all on tables to anon, authenticated;
grant all on all tables in schema public to anon, authenticated, service_role;

drop function if exists public.my_tenancy_ids();
drop function if exists public.is_admin();
