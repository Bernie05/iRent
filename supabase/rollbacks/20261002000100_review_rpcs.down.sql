-- Rollback for 20261002000100_review_rpcs.sql.
drop function if exists public.review_payment(uuid, text, text, uuid);
drop function if exists public.reverse_credit(uuid, uuid);
drop function if exists public.payment_admin_json(uuid);
drop function if exists public.credit_already_used(uuid);
drop function if exists public.reopened_items(jsonb);
drop function if exists public.item_remaining(text, uuid);
drop function if exists public.item_status_of(text, uuid);
