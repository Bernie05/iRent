-- Rollback for 20260925000300_payment_rpcs.sql.
drop function if exists public.record_payment(text, uuid, public.payment_method, numeric, text, text,
  timestamptz, text, public.verification_status, uuid, uuid, uuid);
drop function if exists public.apply_credit(uuid, uuid);
drop function if exists public.recalc_item_status(text, uuid);
drop function if exists public.payment_json(uuid);
drop function if exists public.credit_balance(uuid);
drop function if exists public.item_paid_total(text, uuid);
drop function if exists public.item_json(text, uuid);
