-- iRent B8: rent and bill RPCs (R35 edit rules, R36, R39 DB part, BR-5 server validation, BR-8,
-- BR-10 triggers (b), (c) and raise, D-11, D-12, E7, E8, E13, E14, E26, E27, E38, E44).
--   due_date_for(move_in, period)             SQL twin of dueDateFor (shared vectors, RK16)
--   generate_rent(period, acting_user)
--   create_bill(type, period, total, due_date, shares, created_by)
--   update_charge(id, amount, due_date, acting_user)
--   update_bill_shares(bill_id, shares, acting_user)
-- Rollback: supabase/rollbacks/20261002000200_rent_bill_rpcs.down.sql
--
-- Lock order: renter profile row(s) (ascending id when several) → bill / item rows.
-- Service role only.

-- Σ of the `amount` fields of an apply_credit result.
create or replace function public.applied_total(p_applications jsonb)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(sum((e ->> 'amount')::numeric), 0)::numeric(12,2) from jsonb_array_elements(p_applications) e;
$$;

-- ---------------------------------------------------------------------------
-- BR-8: due_date = (period year, period month, min(day(move_in), last day of that month)).
-- ---------------------------------------------------------------------------
create or replace function public.due_date_for(p_move_in date, p_period date)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  select make_date(
    extract(year from p_period)::int,
    extract(month from p_period)::int,
    least(
      extract(day from p_move_in)::int,
      extract(day from (date_trunc('month', p_period::timestamp) + interval '1 month' - interval '1 day'))::int));
$$;

-- ---------------------------------------------------------------------------
-- generate_rent (R36, E7, E8, E26, E27)
-- Returns { created, skipped_existing, skipped_not_moved_in, credit_applied_total }.
-- ---------------------------------------------------------------------------
create or replace function public.generate_rent(p_period date, p_acting_user uuid default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_t        record;
  v_due      date;
  v_id       uuid;
  v_created  int := 0;
  v_existing int := 0;
  v_not_in   int := 0;
  v_credit   numeric(12,2) := 0;
begin
  if p_period is null or extract(day from p_period) <> 1 then
    raise exception 'VALIDATION_ERROR' using detail = 'Period must be the first day of a month', hint = 'period';
  end if;

  for v_t in
    select t.id, t.renter_id, t.move_in, b.monthly_rate
    from tenancies t join beds b on b.id = t.bed_id
    where t.is_active
    order by t.move_in, t.id
  loop
    perform 1 from profiles where id = v_t.renter_id for update;
    -- The snapshot may predate a concurrent move-out; look again under the lock.
    perform 1 from tenancies where id = v_t.id and is_active;
    if not found then
      continue;
    end if;

    if exists (select 1 from rent_charges where tenancy_id = v_t.id and period = p_period) then
      v_existing := v_existing + 1;
      continue;
    end if;
    v_due := due_date_for(v_t.move_in, p_period);
    if v_t.move_in > v_due then
      v_not_in := v_not_in + 1;
      continue;
    end if;

    v_id := null;
    insert into rent_charges (tenancy_id, period, amount, due_date)
    values (v_t.id, p_period, v_t.monthly_rate, v_due)
    on conflict (tenancy_id, period) do nothing
    returning id into v_id;
    if v_id is null then
      v_existing := v_existing + 1;
      continue;
    end if;

    v_created := v_created + 1;
    v_credit := v_credit + applied_total(apply_credit(v_t.renter_id, p_acting_user));
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'skipped_existing', v_existing,
    'skipped_not_moved_in', v_not_in,
    'credit_applied_total', v_credit);
end;
$$;

-- ---------------------------------------------------------------------------
-- create_bill (R39, BR-5 validation, E13, E14)
-- p_shares = [{ tenancy_id, amount }]. The API computes the equal split (BR-5) when the admin
-- sends none; this function only validates and stores. Returns { bill_id, credit_applied_total }.
-- ---------------------------------------------------------------------------
create or replace function public.create_bill(
  p_type       public.bill_type,
  p_period     date,
  p_total      numeric,
  p_due_date   date,
  p_shares     jsonb,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_bill_id uuid;
  v_renter  uuid;
  v_credit  numeric(12,2) := 0;
begin
  if p_type is null then
    raise exception 'VALIDATION_ERROR' using detail = 'Invalid bill type', hint = 'type';
  end if;
  if p_period is null or extract(day from p_period) <> 1 then
    raise exception 'VALIDATION_ERROR' using detail = 'Period must be the first day of a month', hint = 'period';
  end if;
  if p_due_date is null then
    raise exception 'VALIDATION_ERROR' using detail = 'Due date is required', hint = 'due_date';
  end if;
  if p_total is null or p_total < 0.01 or p_total > 1000000 or p_total <> round(p_total, 2) then
    raise exception 'VALIDATION_ERROR' using detail = 'Invalid total amount', hint = 'total_amount';
  end if;
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' then
    raise exception 'VALIDATION_ERROR' using detail = 'Shares must be a list', hint = 'shares';
  end if;
  if not exists (select 1 from tenancies where is_active) then
    raise exception 'NO_ACTIVE_TENANCIES';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_shares) as s(tenancy_id uuid, amount numeric)
    where s.tenancy_id is null or s.amount is null or s.amount < 0 or s.amount <> round(s.amount, 2)
  ) or (
    select count(*) <> count(distinct s.tenancy_id)
    from jsonb_to_recordset(p_shares) as s(tenancy_id uuid, amount numeric)
  ) then
    raise exception 'VALIDATION_ERROR' using detail = 'Invalid shares', hint = 'shares';
  end if;

  -- Lock every affected renter (ascending id), then validate against the locked state.
  perform 1 from profiles
  where id in (select t.renter_id from tenancies t
               join jsonb_to_recordset(p_shares) as s(tenancy_id uuid, amount numeric) on s.tenancy_id = t.id)
  order by id for update;

  if (select coalesce(sum(s.amount), 0) from jsonb_to_recordset(p_shares) as s(tenancy_id uuid, amount numeric))
     <> p_total then
    raise exception 'SHARES_SUM_MISMATCH';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_shares) as s(tenancy_id uuid, amount numeric)
    where not exists (select 1 from tenancies t where t.id = s.tenancy_id and t.is_active)
  ) then
    raise exception 'VALIDATION_ERROR'
      using detail = 'Every share must belong to an active tenancy', hint = 'shares';
  end if;

  insert into utility_bills (type, period, total_amount, due_date, created_by)
  values (p_type, p_period, p_total, p_due_date, p_created_by)
  returning id into v_bill_id;

  insert into bill_shares (bill_id, tenancy_id, amount)
  select v_bill_id, s.tenancy_id, s.amount from jsonb_to_recordset(p_shares) as s(tenancy_id uuid, amount numeric);

  -- A ₱0 share is already settled.
  perform recalc_item_status('bill_share', id) from bill_shares where bill_id = v_bill_id and amount = 0;

  for v_renter in
    select distinct t.renter_id
    from bill_shares s join tenancies t on t.id = s.tenancy_id
    where s.bill_id = v_bill_id
    order by t.renter_id
  loop
    v_credit := v_credit + applied_total(apply_credit(v_renter, p_created_by));
  end loop;

  return jsonb_build_object('bill_id', v_bill_id, 'credit_applied_total', v_credit);
end;
$$;

-- ---------------------------------------------------------------------------
-- update_charge (R35 edit rules, E44)
-- Amount must be > 0 and ≥ what is already paid; raising it applies available credit.
-- Returns { id, status, credit_applied_total }.
-- ---------------------------------------------------------------------------
create or replace function public.update_charge(
  p_charge_id   uuid,
  p_amount      numeric default null,
  p_due_date    date default null,
  p_acting_user uuid default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_renter uuid;
  v_old    numeric(12,2);
  v_credit numeric(12,2) := 0;
begin
  if p_amount is not null and (p_amount <= 0 or p_amount > 999999.99 or p_amount <> round(p_amount, 2)) then
    raise exception 'VALIDATION_ERROR' using detail = 'Invalid amount', hint = 'amount';
  end if;

  select t.renter_id into v_renter
  from rent_charges c join tenancies t on t.id = c.tenancy_id
  where c.id = p_charge_id;
  if v_renter is null then
    raise exception 'NOT_FOUND';
  end if;

  perform 1 from profiles where id = v_renter for update;
  select c.amount into v_old from rent_charges c where c.id = p_charge_id for update;

  if p_amount is not null and p_amount < item_paid_total('charge', p_charge_id) then
    raise exception 'AMOUNT_BELOW_PAID';
  end if;

  update rent_charges
  set amount = coalesce(p_amount, amount), due_date = coalesce(p_due_date, due_date)
  where id = p_charge_id;
  perform recalc_item_status('charge', p_charge_id);

  if p_amount is not null and p_amount > v_old then
    v_credit := applied_total(apply_credit(v_renter, p_acting_user));
  end if;

  return jsonb_build_object(
    'id', p_charge_id,
    'status', item_status_of('charge', p_charge_id),
    'credit_applied_total', v_credit);
end;
$$;

-- ---------------------------------------------------------------------------
-- update_bill_shares (R39 edit)
-- p_shares = [{ id, amount }] for the shares being changed (all shares may be sent). After the
-- change the bill's shares must still sum to its total, and no share may drop below what it has
-- already received. Recalculates, then applies available credit to the affected renters.
-- Returns { bill_id, credit_applied_total }.
-- ---------------------------------------------------------------------------
create or replace function public.update_bill_shares(
  p_bill_id     uuid,
  p_shares      jsonb,
  p_acting_user uuid default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_total  numeric(12,2);
  v_renter uuid;
  v_credit numeric(12,2) := 0;
begin
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'VALIDATION_ERROR' using detail = 'Shares must be a non-empty list', hint = 'shares';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_shares) as x(id uuid, amount numeric)
    where x.id is null or x.amount is null or x.amount < 0 or x.amount <> round(x.amount, 2)
  ) or (
    select count(*) <> count(distinct x.id) from jsonb_to_recordset(p_shares) as x(id uuid, amount numeric)
  ) then
    raise exception 'VALIDATION_ERROR' using detail = 'Invalid shares', hint = 'shares';
  end if;
  if not exists (select 1 from utility_bills where id = p_bill_id) then
    raise exception 'NOT_FOUND';
  end if;

  -- Renters (ascending id) → bill → shares.
  perform 1 from profiles
  where id in (select t.renter_id from bill_shares s join tenancies t on t.id = s.tenancy_id where s.bill_id = p_bill_id)
  order by id for update;
  select total_amount into v_total from utility_bills where id = p_bill_id for update;
  perform 1 from bill_shares where bill_id = p_bill_id order by id for update;

  if exists (
    select 1 from jsonb_to_recordset(p_shares) as x(id uuid, amount numeric)
    where not exists (select 1 from bill_shares s where s.id = x.id and s.bill_id = p_bill_id)
  ) then
    raise exception 'VALIDATION_ERROR' using detail = 'Unknown share for this bill', hint = 'shares';
  end if;

  if (select coalesce(sum(coalesce(x.amount, s.amount)), 0)
      from bill_shares s
      left join jsonb_to_recordset(p_shares) as x(id uuid, amount numeric) on x.id = s.id
      where s.bill_id = p_bill_id) <> v_total then
    raise exception 'SHARES_SUM_MISMATCH';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_shares) as x(id uuid, amount numeric)
    where x.amount < item_paid_total('bill_share', x.id)
  ) then
    raise exception 'AMOUNT_BELOW_PAID';
  end if;

  update bill_shares s
  set amount = x.amount
  from jsonb_to_recordset(p_shares) as x(id uuid, amount numeric)
  where s.id = x.id and s.amount is distinct from x.amount;

  perform recalc_item_status('bill_share', x.id) from jsonb_to_recordset(p_shares) as x(id uuid, amount numeric);

  for v_renter in
    select distinct t.renter_id
    from jsonb_to_recordset(p_shares) as x(id uuid, amount numeric)
    join bill_shares s on s.id = x.id
    join tenancies t on t.id = s.tenancy_id
    order by t.renter_id
  loop
    v_credit := v_credit + applied_total(apply_credit(v_renter, p_acting_user));
  end loop;

  return jsonb_build_object('bill_id', p_bill_id, 'credit_applied_total', v_credit);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: server (service role) only.
-- ---------------------------------------------------------------------------
revoke all on function public.applied_total(jsonb)                              from public, anon, authenticated;
revoke all on function public.due_date_for(date, date)                          from public, anon, authenticated;
revoke all on function public.generate_rent(date, uuid)                         from public, anon, authenticated;
revoke all on function public.create_bill(public.bill_type, date, numeric, date, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.update_charge(uuid, numeric, date, uuid)          from public, anon, authenticated;
revoke all on function public.update_bill_shares(uuid, jsonb, uuid)             from public, anon, authenticated;

grant execute on function public.applied_total(jsonb)                              to service_role;
grant execute on function public.due_date_for(date, date)                          to service_role;
grant execute on function public.generate_rent(date, uuid)                         to service_role;
grant execute on function public.create_bill(public.bill_type, date, numeric, date, jsonb, uuid) to service_role;
grant execute on function public.update_charge(uuid, numeric, date, uuid)          to service_role;
grant execute on function public.update_bill_shares(uuid, jsonb, uuid)             to service_role;
