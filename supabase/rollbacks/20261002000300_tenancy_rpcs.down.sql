-- Rollback for 20261002000300_tenancy_rpcs.sql.
drop function if exists public.record_refund(uuid, numeric, public.refund_method, text, timestamptz, text, uuid);
drop function if exists public.move_out_preview(uuid);
drop function if exists public.move_out(uuid, date, uuid, date);
drop function if exists public.assign_bed(uuid, uuid, date, numeric);
drop function if exists public.create_renter(uuid, text, text, text, public.lang_code, uuid, date, numeric);
