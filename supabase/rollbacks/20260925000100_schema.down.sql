-- Rollback for 20260925000100_schema.sql.
-- Run the later rollbacks first (…000300, …000200). Destroys all iRent data.
delete from storage.objects where bucket_id in ('public-media', 'receipts');
delete from storage.buckets where id in ('public-media', 'receipts');

drop view  if exists public.renter_credit_balances;
drop table if exists public.app_settings;
drop table if exists public.notifications_log;
drop table if exists public.announcement_reads;
drop table if exists public.announcements;
drop table if exists public.inquiries;
drop table if exists public.credit_ledger;
drop table if exists public.payments;
drop table if exists public.bill_shares;
drop table if exists public.utility_bills;
drop table if exists public.rent_charges;
drop table if exists public.tenancies;
drop table if exists public.beds;
drop table if exists public.profiles;
drop function if exists public.set_updated_at();

drop type if exists public.reminder_type;
drop type if exists public.announcement_priority;
drop type if exists public.inquiry_status;
drop type if exists public.bill_type;
drop type if exists public.refund_method;
drop type if exists public.ledger_entry_type;
drop type if exists public.verification_status;
drop type if exists public.payment_method;
drop type if exists public.item_status;
drop type if exists public.bed_status;
drop type if exists public.bunk_type;
drop type if exists public.lang_code;
drop type if exists public.user_role;
