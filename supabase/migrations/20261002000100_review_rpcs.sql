-- iRent B7: review and credit-reversal RPCs (R38 DB part, R56, BR-11, E5, E6, E31–E34, E43).
--   review_payment(payment_id, action, reason, admin_id)   confirm / reject
--   reverse_credit(payment_id, acting_user)                BR-11 steps 2–5
--   credit_already_used(payment_id)                        S11 warning
-- plus read helpers item_remaining, item_status_of, reopened_items, payment_admin_json.
-- Rollback: supabase/rollbacks/20261002000100_review_rpcs.down.sql
--
-- Same conventions as 20260925000300_payment_rpcs.sql: errors are `raise exception '<CODE>'`,
-- lock order is always renter profile → payment → item, service role only.

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------
create or replace function public.item_status_of(p_item_type text, p_item_id uuid)
returns public.item_status
language sql
stable
set search_path = public, pg_temp
as $$
  select case p_item_type
    when 'charge'     then (select c.status from rent_charges c where c.id = p_item_id)
    when 'bill_share' then (select s.status from bill_shares s where s.id = p_item_id)
  end;
$$;

-- amount − Σ non-rejected applied, never below 0.
create or replace function public.item_remaining(p_item_type text, p_item_id uuid)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select greatest(
    case p_item_type
      when 'charge'     then (select c.amount from rent_charges c where c.id = p_item_id)
      when 'bill_share' then (select s.amount from bill_shares s where s.id = p_item_id)
    end - item_paid_total(p_item_type, p_item_id), 0)::numeric(12,2);
$$;

-- [{ item, … }] → [{ item, remaining }], each item once (first occurrence wins), remaining as of now.
create or replace function public.reopened_items(p_items jsonb)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
                'item', f.item,
                'remaining', item_remaining(f.item ->> 'type', (f.item ->> 'id')::uuid))
              order by f.n),
    '[]'::jsonb)
  from (
    select distinct on (e ->> 'id') e as item, n
    from jsonb_array_elements(p_items) with ordinality as t(e, n)
    order by e ->> 'id', n
  ) f;
$$;

-- C − min(C, max(balance, 0)): how much of this payment's credit is already used (S11 warning).
create or replace function public.credit_already_used(p_payment_id uuid)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select case when p.credit_amount <= 0 then 0::numeric(12,2)
              else (p.credit_amount - least(p.credit_amount, greatest(credit_balance(t.renter_id), 0)))::numeric(12,2)
         end
  from payments p join tenancies t on t.id = p.tenancy_id
  where p.id = p_payment_id;
$$;

-- Payment as the admin sees it: payment_json plus renter and credit_already_used.
create or replace function public.payment_admin_json(p_payment_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select payment_json(p.id)
         || jsonb_build_object(
              'renter', jsonb_build_object('id', r.id, 'full_name', r.full_name),
              'credit_already_used', credit_already_used(p.id))
  from payments p
  join tenancies t on t.id = p.tenancy_id
  join profiles r on r.id = t.renter_id
  where p.id = p_payment_id;
$$;

-- ---------------------------------------------------------------------------
-- reverse_credit (BR-11 steps 2–5)
-- Precondition: the payment is already `rejected` (review_payment does step 1).
--   2. reversal −C for the payment's excess;
--   3. unwind: while balance < 0, reject the renter's newest non-rejected credit payment
--      and give its amount back (application_reversal +a), recalculating that item;
--   4. if the unwinding overshot (balance > 0), run BR-10 again (also covers a pre-existing
--      positive balance meeting the item that was just reopened, OQ-16);
--   5. a balance still < 0 stays negative (the credit was already refunded).
-- Returns { credit_reversed, items_reopened: [{ item, remaining }], credit_balance }.
-- items_reopened lists the item of every unwound credit payment (it was paid, wholly or in part,
-- from the reversed credit; SC-62 "Reopened: November rent").
-- ---------------------------------------------------------------------------
create or replace function public.reverse_credit(p_payment_id uuid, p_acting_user uuid default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pay      payments%rowtype;
  v_cp       payments%rowtype;
  v_renter   uuid;
  v_type     text;
  v_item     uuid;
  v_reason   text;
  v_reopened jsonb := '[]'::jsonb;
begin
  select * into v_pay from payments where id = p_payment_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_pay.verification <> 'rejected' then
    raise exception 'VALIDATION_ERROR' using detail = 'The payment must be rejected first', hint = 'payment_id';
  end if;
  select t.renter_id into v_renter from tenancies t where t.id = v_pay.tenancy_id;
  perform 1 from profiles where id = v_renter for update;

  -- 2. Reverse the excess.
  if v_pay.credit_amount > 0 then
    insert into credit_ledger (renter_id, entry_type, amount, payment_id, created_by)
    values (v_renter, 'reversal', -v_pay.credit_amount, v_pay.id, p_acting_user);
  end if;

  -- 3. Unwind, newest credit application first.
  v_reason := 'Credit reversed: payment ' || upper(v_pay.method::text)
              || coalesce(' ' || v_pay.reference_no, '') || ' was rejected';
  while credit_balance(v_renter) < 0 loop
    select pp.* into v_cp
    from payments pp join tenancies t on t.id = pp.tenancy_id
    where t.renter_id = v_renter and pp.method = 'credit' and pp.verification <> 'rejected'
    order by pp.created_at desc, pp.id desc
    limit 1;
    exit when not found;

    v_type := case when v_cp.charge_id is not null then 'charge' else 'bill_share' end;
    v_item := coalesce(v_cp.charge_id, v_cp.bill_share_id);

    update payments
    set verification = 'rejected', rejection_reason = v_reason, reviewed_by = p_acting_user, reviewed_at = now()
    where id = v_cp.id;
    insert into credit_ledger (renter_id, entry_type, amount, payment_id, created_by)
    values (v_renter, 'application_reversal', v_cp.amount, v_cp.id, p_acting_user);
    perform recalc_item_status(v_type, v_item);

    v_reopened := v_reopened || jsonb_build_array(item_json(v_type, v_item));
  end loop;

  -- 4. Overshoot: put the surplus back to work.
  if credit_balance(v_renter) > 0 then
    perform apply_credit(v_renter, p_acting_user);
  end if;

  -- 5. A negative balance simply stays.
  return jsonb_build_object(
    'credit_reversed', v_pay.credit_amount,
    'items_reopened', reopened_items(v_reopened),
    'credit_balance', credit_balance(v_renter));
end;
$$;

-- ---------------------------------------------------------------------------
-- review_payment (R38, E5, E6)
-- confirm → the Payment (admin shape); reject → RejectResult:
--   { payment, credit_reversed, items_reopened: [{ item, remaining }], credit_balance }
-- items_reopened includes the rejected payment's own item when it was `paid` before.
-- ---------------------------------------------------------------------------
create or replace function public.review_payment(
  p_payment_id uuid,
  p_action     text,
  p_reason     text default null,
  p_admin_id   uuid default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_reason   text := nullif(btrim(p_reason), '');
  v_renter   uuid;
  v_pay      payments%rowtype;
  v_type     text;
  v_item     uuid;
  v_before   item_status;
  v_after    item_status;
  v_rev      jsonb;
  v_reopened jsonb := '[]'::jsonb;
begin
  if p_action is null or p_action not in ('confirm', 'reject') then
    raise exception 'VALIDATION_ERROR' using detail = 'Action must be confirm or reject', hint = 'action';
  end if;
  if p_action = 'reject' and (v_reason is null or char_length(v_reason) > 500) then
    raise exception 'VALIDATION_ERROR' using detail = 'A reason of 1 to 500 characters is required', hint = 'reason';
  end if;

  select t.renter_id into v_renter
  from payments p join tenancies t on t.id = p.tenancy_id
  where p.id = p_payment_id;
  if v_renter is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Renter first, then the payment (re-read under the lock: a concurrent review may have won).
  perform 1 from profiles where id = v_renter for update;
  select * into v_pay from payments where id = p_payment_id for update;

  if v_pay.method = 'credit' then
    raise exception 'NOT_REVIEWABLE';
  end if;
  if v_pay.verification <> 'auto_verified' then
    raise exception 'ALREADY_REVIEWED';
  end if;

  if p_action = 'confirm' then
    update payments
    set verification = 'confirmed', reviewed_by = p_admin_id, reviewed_at = now()
    where id = p_payment_id;
    return payment_admin_json(p_payment_id);
  end if;

  -- reject: BR-11 step 1, then reverse_credit for steps 2–5.
  v_type := case when v_pay.charge_id is not null then 'charge' else 'bill_share' end;
  v_item := coalesce(v_pay.charge_id, v_pay.bill_share_id);
  v_before := item_status_of(v_type, v_item);

  update payments
  set verification = 'rejected', rejection_reason = v_reason, reviewed_by = p_admin_id, reviewed_at = now()
  where id = p_payment_id;
  v_after := recalc_item_status(v_type, v_item);

  v_rev := reverse_credit(p_payment_id, p_admin_id);

  if v_before = 'paid' and v_after <> 'paid' then
    v_reopened := jsonb_build_array(item_json(v_type, v_item));
  end if;
  v_reopened := v_reopened || coalesce(
    (select jsonb_agg(e -> 'item') from jsonb_array_elements(v_rev -> 'items_reopened') e), '[]'::jsonb);

  return jsonb_build_object(
    'payment', payment_admin_json(p_payment_id),
    'credit_reversed', v_rev -> 'credit_reversed',
    'items_reopened', reopened_items(v_reopened),
    'credit_balance', v_rev -> 'credit_balance');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: server (service role) only.
-- ---------------------------------------------------------------------------
revoke all on function public.item_status_of(text, uuid)        from public, anon, authenticated;
revoke all on function public.item_remaining(text, uuid)        from public, anon, authenticated;
revoke all on function public.reopened_items(jsonb)             from public, anon, authenticated;
revoke all on function public.credit_already_used(uuid)         from public, anon, authenticated;
revoke all on function public.payment_admin_json(uuid)          from public, anon, authenticated;
revoke all on function public.reverse_credit(uuid, uuid)        from public, anon, authenticated;
revoke all on function public.review_payment(uuid, text, text, uuid) from public, anon, authenticated;

grant execute on function public.item_status_of(text, uuid)        to service_role;
grant execute on function public.item_remaining(text, uuid)        to service_role;
grant execute on function public.reopened_items(jsonb)             to service_role;
grant execute on function public.credit_already_used(uuid)         to service_role;
grant execute on function public.payment_admin_json(uuid)          to service_role;
grant execute on function public.reverse_credit(uuid, uuid)        to service_role;
grant execute on function public.review_payment(uuid, text, text, uuid) to service_role;
