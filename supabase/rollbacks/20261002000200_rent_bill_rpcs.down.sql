-- Rollback for 20261002000200_rent_bill_rpcs.sql.
drop function if exists public.update_bill_shares(uuid, jsonb, uuid);
drop function if exists public.update_charge(uuid, numeric, date, uuid);
drop function if exists public.create_bill(public.bill_type, date, numeric, date, jsonb, uuid);
drop function if exists public.generate_rent(date, uuid);
drop function if exists public.due_date_for(date, date);
drop function if exists public.applied_total(jsonb);
