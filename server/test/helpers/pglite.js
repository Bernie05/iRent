/**
 * In-process Postgres (PGlite, Postgres 16 compiled to WASM) with a minimal stub of the parts
 * of Supabase the migrations depend on: roles anon / authenticated / service_role, auth.users,
 * auth.uid(), storage.buckets and storage.objects.
 *
 * Purpose: execute the real migrations, seed, RLS policies and plpgsql RPCs without Docker.
 * It is single-connection, so true concurrency (SC-22, E9) is covered only by the
 * Supabase integration suite (test/integration), which runs when local Supabase is up.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
export const SUPABASE_DIR = join(here, '..', '..', '..', 'supabase');

const SUPABASE_STUB = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id), name text, owner uuid
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- Supabase's default privileges on schema public.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export function migrationFiles() {
  const dir = join(SUPABASE_DIR, 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ name: f, sql: readFileSync(join(dir, f), 'utf8') }));
}

/** Fresh database with all migrations (and the seed unless `seed: false`). */
export async function createDb({ seed = true } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const { name, sql } of migrationFiles()) {
    try {
      await db.exec(sql);
    } catch (err) {
      err.message = `migration ${name}: ${err.message}`;
      throw err;
    }
  }
  if (seed) await db.exec(readFileSync(join(SUPABASE_DIR, 'seed.sql'), 'utf8'));
  return db;
}

/** Run `fn` with the session switched to `role` (and an optional JWT subject). */
export async function asRole(db, role, sub, fn) {
  await db.exec(`set role ${role}`);
  if (sub) await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub]);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

// ---------------------------------------------------------------------------
// Fixture builders (run as the superuser, like the server's service role would)
// ---------------------------------------------------------------------------
const short = () => randomUUID().slice(0, 8);

export async function givenUser(db, { role = 'renter', language = 'en', name } = {}) {
  const id = randomUUID();
  const email = `${role}-${short()}@irent.test`;
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  await db.query(
    `insert into public.profiles (id, full_name, email, phone, role, language)
     values ($1, $2, $3, '09170000000', $4, $5)`,
    [id, name ?? `Test ${role} ${short()}`, email, role, language],
  );
  return { id, email };
}

export async function givenBed(db, { rate = 4500, bunk = 'lower', status = 'vacant' } = {}) {
  const { rows } = await db.query(
    `insert into public.beds (label, room, bunk_type, monthly_rate, status)
     values ($1, 'Room T', $2, $3, $4) returning id`,
    [`Test bed ${short()}`, bunk, rate, status],
  );
  return rows[0].id;
}

export async function givenTenancy(db, renterId, { moveIn = '2026-09-05', bedId, rate } = {}) {
  const bed = bedId ?? (await givenBed(db, rate === undefined ? {} : { rate }));
  const { rows } = await db.query(
    `insert into public.tenancies (renter_id, bed_id, move_in, is_active) values ($1, $2, $3, true) returning id`,
    [renterId, bed, moveIn],
  );
  await db.query(`update public.beds set status = 'occupied' where id = $1`, [bed]);
  return rows[0].id;
}

export async function givenCharge(db, tenancyId, { amount = 4500, period = '2026-10-01', due = '2026-10-05' } = {}) {
  const { rows } = await db.query(
    `insert into public.rent_charges (tenancy_id, period, amount, due_date) values ($1, $2, $3, $4) returning id`,
    [tenancyId, period, amount, due],
  );
  return rows[0].id;
}

export async function givenShare(db, tenancyId, { amount = 850, period = '2026-10-01', due = '2026-10-10', type = 'electricity' } = {}) {
  const { rows: bill } = await db.query(
    `insert into public.utility_bills (type, period, total_amount, due_date) values ($1, $2, $3, $4) returning id`,
    [type, period, amount, due],
  );
  const { rows } = await db.query(
    `insert into public.bill_shares (bill_id, tenancy_id, amount) values ($1, $2, $3) returning id`,
    [bill[0].id, tenancyId, amount],
  );
  return rows[0].id;
}

/** A renter with an active tenancy. */
export async function givenRenter(db, opts = {}) {
  const user = await givenUser(db, { role: 'renter', ...opts });
  const tenancyId = await givenTenancy(db, user.id, opts);
  return { ...user, tenancyId };
}

let refCounter = 0;
export const uniqueRef = (prefix = 'REF') => `${prefix}-${Date.now().toString(36)}-${++refCounter}`.toUpperCase();

/** Call record_payment as the service role. Returns the PayResult object. */
export async function recordPayment(db, args) {
  const a = {
    item_type: 'charge',
    method: 'gcash',
    reference_no: uniqueRef(),
    proof_path: null,
    paid_at: null,
    notes: null,
    verification: 'auto_verified',
    submitted_by: null,
    reviewed_by: null,
    expect_renter_id: null,
    ...args,
  };
  return asRole(db, 'service_role', null, async () => {
    const { rows } = await db.query(
      `select public.record_payment(
         p_item_type => $1, p_item_id => $2, p_method => $3::public.payment_method, p_amount => $4::numeric,
         p_reference_no => $5, p_proof_path => $6, p_paid_at => $7, p_notes => $8,
         p_verification => $9::public.verification_status, p_submitted_by => $10, p_reviewed_by => $11,
         p_expect_renter_id => $12) as result`,
      [a.item_type, a.item_id, a.method, String(a.amount), a.reference_no, a.proof_path, a.paid_at, a.notes,
        a.verification, a.submitted_by, a.reviewed_by, a.expect_renter_id],
    );
    return rows[0].result;
  });
}

export async function creditBalance(db, renterId) {
  const { rows } = await db.query('select public.credit_balance($1) as b', [renterId]);
  return Number(rows[0].b);
}

export async function itemRow(db, type, id) {
  const table = type === 'charge' ? 'rent_charges' : 'bill_shares';
  const { rows } = await db.query(
    `select i.status, i.amount::numeric as amount, public.item_paid_total($1, i.id) as paid
     from public.${table} i where i.id = $2`,
    [type, id],
  );
  const r = rows[0];
  return { status: r.status, amount: Number(r.amount), paid: Number(r.paid), remaining: Number(r.amount) - Number(r.paid) };
}

/**
 * Money invariants (a first cut of B10's assertInvariants), checked for one renter:
 *  - Σ ledger = view balance
 *  - every item: Σ non-rejected applied ≤ amount, status matches BR-1
 *  - applied + credit = amount on every payment
 *  - no credit > 0 together with an open item
 *  - no credit payment with a reference or proof
 */
export async function invariantViolations(db, renterId) {
  const problems = [];
  const { rows: bal } = await db.query(
    `select (select coalesce(sum(amount),0) from public.credit_ledger where renter_id = $1) as ledger,
            (select balance from public.renter_credit_balances where renter_id = $1) as view`,
    [renterId],
  );
  if (Number(bal[0].ledger) !== Number(bal[0].view ?? 0)) problems.push(`ledger ${bal[0].ledger} != view ${bal[0].view}`);

  const { rows: items } = await db.query(
    `select 'charge' as t, c.id, c.amount, c.status, public.item_paid_total('charge', c.id) as paid
       from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id where t.renter_id = $1
     union all
     select 'bill_share', s.id, s.amount, s.status, public.item_paid_total('bill_share', s.id)
       from public.bill_shares s join public.tenancies t on t.id = s.tenancy_id where t.renter_id = $1`,
    [renterId],
  );
  let open = 0;
  for (const it of items) {
    const amount = Math.round(Number(it.amount) * 100);
    const paid = Math.round(Number(it.paid) * 100);
    if (paid > amount) problems.push(`${it.t} ${it.id}: paid ${paid} > amount ${amount}`);
    const expected = amount - paid <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    if (expected !== it.status) problems.push(`${it.t} ${it.id}: status ${it.status}, expected ${expected}`);
    if (it.status !== 'paid') open += 1;
  }

  const { rows: pays } = await db.query(
    `select p.* from public.payments p join public.tenancies t on t.id = p.tenancy_id where t.renter_id = $1`,
    [renterId],
  );
  for (const p of pays) {
    const [a, ap, cr] = [p.amount, p.applied_amount, p.credit_amount].map((v) => Math.round(Number(v) * 100));
    if (ap + cr !== a) problems.push(`payment ${p.id}: applied + credit != amount`);
    if (p.method === 'credit' && (p.reference_no || p.proof_url)) problems.push(`credit payment ${p.id} has reference/proof`);
  }

  if (Number(bal[0].ledger) > 0 && open > 0) problems.push(`credit ${bal[0].ledger} > 0 with ${open} open item(s)`);
  return problems;
}
