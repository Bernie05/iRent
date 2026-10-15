-- iRent B9: tenancy lifecycle RPCs (R31 atomic steps 2–4, R33, R34, R57, BR-6, BR-7, BR-12, D-6,
-- D-12, E9, E11, E35–E37; OQ-25 = A: move-out date between move-in and today, Asia/Manila).
--   create_renter(...)        profile + bed + tenancy
--   assign_bed(...)           new tenancy for an existing renter
--   move_out(...)             end the tenancy, free the bed, apply credit
--   move_out_preview(...)     read-only
--   record_refund(...)        refund −amount on the credit ledger
-- Rollback: supabase/rollbacks/20261002000300_tenancy_rpcs.down.sql
--
-- Lock order: renter profile → tenancy / bed rows. Service role only.
-- The beds are claimed with a conditional UPDATE (status in vacant/reserved): of two concurrent
-- callers the second re-evaluates the WHERE after the first commits and gets BED_TAKEN (E9);
-- the partial unique indexes on tenancies are the backstop.

-- ---------------------------------------------------------------------------
-- create_renter (R31)
-- The auth user is created by the API first (D-6); this makes the DB part atomic.
-- Returns { renter_id, tenancy_id }. Duplicate email → EMAIL_EXISTS through mapDbError.
-- ---------------------------------------------------------------------------
create or replace function public.create_renter(
  p_auth_id   uuid,
  p_full_name text,
  p_email     text,
  p_phone     text,
  p_language  public.lang_code,
  p_bed_id    uuid,
  p_move_in   date,
  p_deposit   numeric default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tenancy uuid;
begin
  if p_move_in is null then
    raise exception 'VALIDATION_ERROR' using detail = 'Move-in date is required', hint = 'move_in';
  end if;

  insert into profiles (id, full_name, email, phone, role, language, invited_at)
  values (p_auth_id, btrim(p_full_name), btrim(p_email), nullif(btrim(p_phone), ''), 'renter',
          coalesce(p_language, 'en'), now());

  update beds set status = 'occupied' where id = p_bed_id and status in ('vacant', 'reserved');
  if not found then
    if not exists (select 1 from beds where id = p_bed_id) then
      raise exception 'NOT_FOUND';
    end if;
    raise exception 'BED_TAKEN';
  end if;

  insert into tenancies (renter_id, bed_id, move_in, deposit)
  values (p_auth_id, p_bed_id, p_move_in, p_deposit)
  returning id into v_tenancy;

  return jsonb_build_object('renter_id', p_auth_id, 'tenancy_id', v_tenancy);
end;
$$;

-- ---------------------------------------------------------------------------
-- assign_bed (R33). Returns { tenancy_id }.
-- ---------------------------------------------------------------------------
create or replace function public.assign_bed(
  p_renter_id uuid,
  p_bed_id    uuid,
  p_move_in   date,
  p_deposit   numeric default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tenancy uuid;
begin
  if p_move_in is null then
    raise exception 'VALIDATION_ERROR' using detail = 'Move-in date is required', hint = 'move_in';
  end if;

  perform 1 from profiles where id = p_renter_id and role = 'renter' for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if exists (select 1 from tenancies where renter_id = p_renter_id and is_active) then
    raise exception 'RENTER_HAS_ACTIVE_TENANCY';
  end if;

  update beds set status = 'occupied' where id = p_bed_id and status in ('vacant', 'reserved');
  if not found then
    if not exists (select 1 from beds where id = p_bed_id) then
      raise exception 'NOT_FOUND';
    end if;
    raise exception 'BED_TAKEN';
  end if;

  insert into tenancies (renter_id, bed_id, move_in, deposit)
  values (p_renter_id, p_bed_id, p_move_in, p_deposit)
  returning id into v_tenancy;

  return jsonb_build_object('tenancy_id', v_tenancy);
end;
$$;

-- ---------------------------------------------------------------------------
-- move_out (R34, R57 steps 1–2, BR-12, OQ-25 = A)
-- move_in <= p_move_out <= today (Asia/Manila). `p_today` is the Manila business date supplied by
-- the API (which honours the test clock, D-12); when null the DB clock is used.
-- Returns { credit_applied, refund_due }.
-- ---------------------------------------------------------------------------
create or replace function public.move_out(
  p_tenancy_id  uuid,
  p_move_out    date,
  p_acting_user uuid default null,
  p_today       date default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_t       tenancies%rowtype;
  v_today   date := coalesce(p_today, (now() at time zone 'Asia/Manila')::date);
  v_applied numeric(12,2);
begin
  if p_move_out is null then
    raise exception 'VALIDATION_ERROR' using detail = 'Move-out date is required', hint = 'move_out';
  end if;

  select * into v_t from tenancies where id = p_tenancy_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  perform 1 from profiles where id = v_t.renter_id for update;
  select * into v_t from tenancies where id = p_tenancy_id for update;
  if not v_t.is_active then
    raise exception 'NOT_FOUND';                       -- already moved out
  end if;

  if p_move_out > v_today then
    raise exception 'MOVE_OUT_IN_FUTURE';
  end if;
  if p_move_out < v_t.move_in then
    raise exception 'MOVE_OUT_BEFORE_MOVE_IN';
  end if;

  update tenancies set move_out = p_move_out, is_active = false where id = p_tenancy_id;
  update beds set status = 'vacant' where id = v_t.bed_id;

  v_applied := applied_total(apply_credit(v_t.renter_id, p_acting_user));

  return jsonb_build_object(
    'credit_applied', v_applied,
    'refund_due', greatest(credit_balance(v_t.renter_id), 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- move_out_preview (R34). Read-only: { credit_balance, would_apply, refund_due }.
-- ---------------------------------------------------------------------------
create or replace function public.move_out_preview(p_tenancy_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_renter  uuid;
  v_balance numeric(12,2);
  v_open    numeric(12,2);
  v_apply   numeric(12,2);
begin
  select renter_id into v_renter from tenancies where id = p_tenancy_id;
  if v_renter is null then
    raise exception 'NOT_FOUND';
  end if;

  v_balance := credit_balance(v_renter);
  select coalesce(sum(item_remaining(i.item_type, i.id)), 0) into v_open
  from (
    select 'charge'::text as item_type, c.id
    from rent_charges c join tenancies t on t.id = c.tenancy_id
    where t.renter_id = v_renter and c.status <> 'paid'
    union all
    select 'bill_share'::text, s.id
    from bill_shares s join tenancies t on t.id = s.tenancy_id
    where t.renter_id = v_renter and s.status <> 'paid'
  ) i;
  v_apply := case when v_balance > 0 then least(v_balance, v_open) else 0 end;

  return jsonb_build_object(
    'credit_balance', v_balance,
    'would_apply', v_apply,
    'refund_due', greatest(v_balance - v_apply, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- record_refund (R57 step 3, BR-12)
-- Returns the LedgerEntry: { id, created_at, entry_type, amount, refund_method, reference_no, note }.
-- `p_refunded_at` (the business date of the refund) becomes the entry's created_at.
-- ---------------------------------------------------------------------------
create or replace function public.record_refund(
  p_renter_id    uuid,
  p_amount       numeric,
  p_method       public.refund_method,
  p_reference_no text default null,
  p_refunded_at  timestamptz default null,
  p_note         text default null,
  p_admin_id     uuid default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ref     text := nullif(btrim(p_reference_no), '');
  v_note    text := nullif(btrim(p_note), '');
  v_balance numeric(12,2);
  v_entry   credit_ledger%rowtype;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 999999.99 or p_amount <> round(p_amount, 2) then
    raise exception 'VALIDATION_ERROR' using detail = 'Invalid amount', hint = 'amount';
  end if;
  if p_method is null then
    raise exception 'VALIDATION_ERROR' using detail = 'Invalid refund method', hint = 'method';
  end if;
  if v_ref is not null and char_length(v_ref) > 40 then
    raise exception 'VALIDATION_ERROR' using detail = 'Reference is too long', hint = 'reference_no';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'VALIDATION_ERROR' using detail = 'Note is too long', hint = 'note';
  end if;

  perform 1 from profiles where id = p_renter_id and role = 'renter' for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_balance := credit_balance(p_renter_id);
  if p_amount > v_balance then
    -- DETAIL carries the balance for the message "… credit balance ₱1,000.00."
    raise exception 'REFUND_EXCEEDS_CREDIT'
      using detail = to_char(greatest(v_balance, 0), 'FM999,999,990.00');
  end if;

  insert into credit_ledger (renter_id, entry_type, amount, refund_method, reference_no, note, created_by, created_at)
  values (p_renter_id, 'refund', -p_amount, p_method, v_ref, v_note, p_admin_id, coalesce(p_refunded_at, clock_timestamp()))
  returning * into v_entry;

  return jsonb_build_object(
    'id', v_entry.id,
    'created_at', v_entry.created_at,
    'entry_type', v_entry.entry_type,
    'amount', v_entry.amount,
    'refund_method', v_entry.refund_method,
    'reference_no', v_entry.reference_no,
    'note', v_entry.note);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: server (service role) only.
-- ---------------------------------------------------------------------------
revoke all on function public.create_renter(uuid, text, text, text, public.lang_code, uuid, date, numeric) from public, anon, authenticated;
revoke all on function public.assign_bed(uuid, uuid, date, numeric)             from public, anon, authenticated;
revoke all on function public.move_out(uuid, date, uuid, date)                  from public, anon, authenticated;
revoke all on function public.move_out_preview(uuid)                            from public, anon, authenticated;
revoke all on function public.record_refund(uuid, numeric, public.refund_method, text, timestamptz, text, uuid) from public, anon, authenticated;

grant execute on function public.create_renter(uuid, text, text, text, public.lang_code, uuid, date, numeric) to service_role;
grant execute on function public.assign_bed(uuid, uuid, date, numeric)             to service_role;
grant execute on function public.move_out(uuid, date, uuid, date)                  to service_role;
grant execute on function public.move_out_preview(uuid)                            to service_role;
grant execute on function public.record_refund(uuid, numeric, public.refund_method, text, timestamptz, text, uuid) to service_role;
