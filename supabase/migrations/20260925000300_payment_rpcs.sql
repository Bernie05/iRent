-- iRent B6: payment core RPCs (D-5, D-9).
--   recalc_item_status(item_type, item_id)          BR-1
--   apply_credit(renter_id, acting_user)            BR-10
--   record_payment(...)                             R21 steps 3–6, R37 (DB part), BR-9
-- plus read helpers item_json, item_paid_total, credit_balance, payment_json.
-- Rollback: supabase/rollbacks/20260925000300_payment_rpcs.down.sql
--
-- Conventions
--   * item_type is 'charge' (rent_charges) or 'bill_share' (bill_shares).
--   * Errors are raised as `raise exception '<CATALOGUE_CODE>'` (SQLSTATE P0001); the
--     server's mapDbError() turns the message into the API error. For VALIDATION_ERROR the
--     DETAIL is the human message and the HINT is the field name.
--   * Lock order, always: renter profile row → item row(s). This serialises every money
--     write for one renter and avoids deadlocks (E2).
--   * Only the service role may execute these functions (the API calls them).

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------
create or replace function public.item_json(p_item_type text, p_item_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select case p_item_type
    when 'charge' then (
      select jsonb_build_object('type', 'charge', 'id', c.id, 'period', c.period)
      from rent_charges c where c.id = p_item_id)
    when 'bill_share' then (
      select jsonb_build_object('type', 'bill_share', 'id', s.id, 'period', b.period, 'bill_type', b.type)
      from bill_shares s join utility_bills b on b.id = s.bill_id where s.id = p_item_id)
  end;
$$;

-- BR-1: Σ applied_amount of non-rejected payments (credit rows included).
create or replace function public.item_paid_total(p_item_type text, p_item_id uuid)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(p.applied_amount), 0)::numeric(12,2)
  from payments p
  where p.verification <> 'rejected'
    and case p_item_type
          when 'charge' then p.charge_id = p_item_id
          when 'bill_share' then p.bill_share_id = p_item_id
          else false
        end;
$$;

-- BR-14: Σ ledger amounts for a renter.
create or replace function public.credit_balance(p_renter_id uuid)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.amount), 0)::numeric(12,2) from credit_ledger l where l.renter_id = p_renter_id;
$$;

-- Payment row in the API contract shape (without the admin-only extras).
create or replace function public.payment_json(p_payment_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', p.id,
    'item', item_json(case when p.charge_id is not null then 'charge' else 'bill_share' end,
                      coalesce(p.charge_id, p.bill_share_id)),
    'method', p.method,
    'amount', p.amount,
    'applied_amount', p.applied_amount,
    'credit_amount', p.credit_amount,
    'reference_no', p.reference_no,
    'has_proof', p.proof_url is not null,
    'paid_at', p.paid_at,
    'notes', p.notes,
    'verification', p.verification,
    'rejection_reason', p.rejection_reason,
    'reviewed_at', p.reviewed_at
  )
  from payments p where p.id = p_payment_id;
$$;

-- ---------------------------------------------------------------------------
-- recalc_item_status (BR-1)
-- ---------------------------------------------------------------------------
create or replace function public.recalc_item_status(p_item_type text, p_item_id uuid)
returns public.item_status
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_amount numeric(12,2);
  v_paid   numeric(12,2);
  v_status item_status;
begin
  if p_item_type = 'charge' then
    select c.amount into v_amount from rent_charges c where c.id = p_item_id;
  elsif p_item_type = 'bill_share' then
    select s.amount into v_amount from bill_shares s where s.id = p_item_id;
  else
    raise exception 'VALIDATION_ERROR' using detail = 'Unknown item type', hint = 'item_type';
  end if;
  if v_amount is null then
    raise exception 'NOT_FOUND';
  end if;

  v_paid := item_paid_total(p_item_type, p_item_id);
  v_status := case
    when v_amount - v_paid <= 0 then 'paid'
    when v_paid > 0 then 'partial'
    else 'unpaid'
  end;

  if p_item_type = 'charge' then
    update rent_charges set status = v_status where id = p_item_id and status is distinct from v_status;
  else
    update bill_shares set status = v_status where id = p_item_id and status is distinct from v_status;
  end if;
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_credit (BR-10)
-- Applies the renter's positive credit to their open items (all tenancies), earliest
-- due date first, then earliest created. Returns [{ item, amount, payment_id }].
-- ---------------------------------------------------------------------------
create or replace function public.apply_credit(p_renter_id uuid, p_acting_user uuid default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_balance    numeric(12,2);
  v_item       record;
  v_remaining  numeric(12,2);
  v_x          numeric(12,2);
  v_payment_id uuid;
  v_result     jsonb := '[]'::jsonb;
begin
  perform 1 from profiles where id = p_renter_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  loop
    v_balance := credit_balance(p_renter_id);
    exit when v_balance <= 0;

    select * into v_item
    from (
      select 'charge'::text as item_type, c.id, c.tenancy_id, c.amount, c.due_date, c.created_at
      from rent_charges c
      join tenancies t on t.id = c.tenancy_id
      where t.renter_id = p_renter_id and c.status <> 'paid'
      union all
      select 'bill_share'::text, s.id, s.tenancy_id, s.amount, b.due_date, s.created_at
      from bill_shares s
      join utility_bills b on b.id = s.bill_id
      join tenancies t on t.id = s.tenancy_id
      where t.renter_id = p_renter_id and s.status <> 'paid'
    ) open_items
    order by due_date, created_at, id
    limit 1;
    exit when not found;

    if v_item.item_type = 'charge' then
      perform 1 from rent_charges where id = v_item.id for update;
    else
      perform 1 from bill_shares where id = v_item.id for update;
    end if;

    v_remaining := v_item.amount - item_paid_total(v_item.item_type, v_item.id);
    if v_remaining <= 0 then
      -- stale status; fix it and look again
      perform recalc_item_status(v_item.item_type, v_item.id);
      continue;
    end if;

    v_x := least(v_balance, v_remaining);

    insert into payments (tenancy_id, charge_id, bill_share_id, amount, applied_amount, credit_amount,
                          method, verification, submitted_by, paid_at)
    values (v_item.tenancy_id,
            case when v_item.item_type = 'charge' then v_item.id end,
            case when v_item.item_type = 'bill_share' then v_item.id end,
            v_x, v_x, 0, 'credit', 'confirmed', p_acting_user, now())
    returning id into v_payment_id;

    insert into credit_ledger (renter_id, entry_type, amount, payment_id, created_by)
    values (p_renter_id, 'application', -v_x, v_payment_id, p_acting_user);

    perform recalc_item_status(v_item.item_type, v_item.id);

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'item', item_json(v_item.item_type, v_item.id),
      'amount', v_x,
      'payment_id', v_payment_id));
  end loop;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_payment (R21 steps 3–6, R37, BR-9, BR-10, E2, E20)
-- Returns the PayResult JSON:
--   { payment, item_status, remaining, credit_added, credit_applied: [{ item, amount }], credit_balance }
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_item_type        text,
  p_item_id          uuid,
  p_method           public.payment_method,
  p_amount           numeric,
  p_reference_no     text default null,
  p_proof_path       text default null,
  p_paid_at          timestamptz default null,
  p_notes            text default null,
  p_verification     public.verification_status default 'auto_verified',
  p_submitted_by     uuid default null,
  p_reviewed_by      uuid default null,
  p_expect_renter_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ref          text := nullif(btrim(p_reference_no), '');
  v_renter       uuid;
  v_tenancy      uuid;
  v_amount       numeric(12,2);
  v_remaining    numeric(12,2);
  v_applied      numeric(12,2);
  v_credit       numeric(12,2);
  v_payment_id   uuid;
  v_status       item_status;
  v_applications jsonb;
begin
  -- Validation (the API validates first; this is the last line of defense).
  if p_item_type is null or p_item_type not in ('charge', 'bill_share') then
    raise exception 'VALIDATION_ERROR' using detail = 'Unknown item type', hint = 'item_type';
  end if;
  if p_method is null or p_method = 'credit' then
    raise exception 'VALIDATION_ERROR' using detail = 'Invalid payment method', hint = 'method';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 999999.99 or p_amount <> round(p_amount, 2) then
    raise exception 'VALIDATION_ERROR' using detail = 'Invalid amount', hint = 'amount';
  end if;
  if p_verification is null or p_verification = 'rejected' then
    raise exception 'VALIDATION_ERROR' using detail = 'Invalid verification', hint = 'verification';
  end if;
  if p_method <> 'cash' and v_ref is null then
    raise exception 'VALIDATION_ERROR' using detail = 'Reference number is required', hint = 'reference_no';
  end if;

  -- Find the owner (no lock yet).
  if p_item_type = 'charge' then
    select t.renter_id, c.tenancy_id into v_renter, v_tenancy
    from rent_charges c join tenancies t on t.id = c.tenancy_id
    where c.id = p_item_id;
  else
    select t.renter_id, s.tenancy_id into v_renter, v_tenancy
    from bill_shares s join tenancies t on t.id = s.tenancy_id
    where s.id = p_item_id;
  end if;
  if v_renter is null or (p_expect_renter_id is not null and v_renter <> p_expect_renter_id) then
    raise exception 'NOT_FOUND';                    -- D-8 / E20: never reveal other renters' items
  end if;

  -- 1. Lock the renter, then the item.
  perform 1 from profiles where id = v_renter for update;
  if p_item_type = 'charge' then
    select c.amount into v_amount from rent_charges c where c.id = p_item_id for update;
  else
    select s.amount into v_amount from bill_shares s where s.id = p_item_id for update;
  end if;

  -- 2. The item must still be open.
  v_remaining := v_amount - item_paid_total(p_item_type, p_item_id);
  if v_remaining <= 0 then
    raise exception 'ITEM_ALREADY_PAID';
  end if;

  -- 3. BR-9 split and insert (a duplicate reference fails on payments_method_reference_uniq).
  v_applied := least(p_amount, v_remaining);
  v_credit  := p_amount - v_applied;

  insert into payments (tenancy_id, charge_id, bill_share_id, amount, applied_amount, credit_amount,
                        method, reference_no, proof_url, paid_at, notes, verification,
                        submitted_by, reviewed_by, reviewed_at)
  values (v_tenancy,
          case when p_item_type = 'charge' then p_item_id end,
          case when p_item_type = 'bill_share' then p_item_id end,
          p_amount, v_applied, v_credit,
          p_method, v_ref, p_proof_path, coalesce(p_paid_at, now()), nullif(btrim(p_notes), ''),
          p_verification,
          p_submitted_by,
          case when p_verification = 'confirmed' then p_reviewed_by end,
          case when p_verification = 'confirmed' then now() end)
  returning id into v_payment_id;

  -- 4. Excess → overpayment credit.
  if v_credit > 0 then
    insert into credit_ledger (renter_id, entry_type, amount, payment_id, created_by)
    values (v_renter, 'overpayment', v_credit, v_payment_id, p_submitted_by);
  end if;

  -- 5. Status.
  v_status := recalc_item_status(p_item_type, p_item_id);

  -- 6. BR-10: apply any credit to open items right away.
  v_applications := apply_credit(v_renter, p_submitted_by);

  select status into v_status from (
    select c.status from rent_charges c where p_item_type = 'charge' and c.id = p_item_id
    union all
    select s.status from bill_shares s where p_item_type = 'bill_share' and s.id = p_item_id
  ) x;

  return jsonb_build_object(
    'payment', payment_json(v_payment_id),
    'item_status', v_status,
    'remaining', greatest(v_amount - item_paid_total(p_item_type, p_item_id), 0),
    'credit_added', v_credit,
    'credit_applied', coalesce(
      (select jsonb_agg(jsonb_build_object('item', e -> 'item', 'amount', e -> 'amount'))
       from jsonb_array_elements(v_applications) e),
      '[]'::jsonb),
    'credit_balance', credit_balance(v_renter)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: server (service role) only.
-- ---------------------------------------------------------------------------
revoke all on function public.item_json(text, uuid)            from public, anon, authenticated;
revoke all on function public.item_paid_total(text, uuid)      from public, anon, authenticated;
revoke all on function public.credit_balance(uuid)             from public, anon, authenticated;
revoke all on function public.payment_json(uuid)               from public, anon, authenticated;
revoke all on function public.recalc_item_status(text, uuid)   from public, anon, authenticated;
revoke all on function public.apply_credit(uuid, uuid)         from public, anon, authenticated;
revoke all on function public.record_payment(text, uuid, public.payment_method, numeric, text, text,
  timestamptz, text, public.verification_status, uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.item_json(text, uuid)          to service_role;
grant execute on function public.item_paid_total(text, uuid)    to service_role;
grant execute on function public.credit_balance(uuid)           to service_role;
grant execute on function public.payment_json(uuid)             to service_role;
grant execute on function public.recalc_item_status(text, uuid) to service_role;
grant execute on function public.apply_credit(uuid, uuid)       to service_role;
grant execute on function public.record_payment(text, uuid, public.payment_method, numeric, text, text,
  timestamptz, text, public.verification_status, uuid, uuid, uuid) to service_role;
