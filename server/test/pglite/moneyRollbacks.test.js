/** B7–B9 rollbacks: they drop exactly what their migrations created, newest first, and the migrations re-apply. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDb, migrationFiles, SUPABASE_DIR } from '../helpers/pglite.js';

const NEW = ['20261002000300_tenancy_rpcs', '20261002000200_rent_bill_rpcs', '20261002000100_review_rpcs'];

describe('B7–B9 rollbacks', () => {
  it('drop every function the migrations added, then the migrations apply again', async () => {
    const db = await createDb({ seed: false });
    const fnCount = async () => (await db.query(
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows[0].n;
    const before = await fnCount();
    for (const name of NEW) await db.exec(readFileSync(join(SUPABASE_DIR, 'rollbacks', `${name}.down.sql`), 'utf8'));
    const { rows } = await db.query(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
       and proname in ('review_payment','reverse_credit','generate_rent','create_bill','update_charge','update_bill_shares',
                       'due_date_for','create_renter','assign_bed','move_out','move_out_preview','record_refund',
                       'credit_already_used','item_remaining','item_status_of','reopened_items','payment_admin_json','applied_total')`);
    expect(rows).toEqual([]);
    expect(await fnCount()).toBeLessThan(before);

    for (const { name, sql } of migrationFiles().filter((f) => NEW.some((n) => f.name.startsWith(n)))) {
      await db.exec(sql); // B6 functions were untouched, so the new ones re-create cleanly
      expect(name).toMatch(/\.sql$/);
    }
    expect(await fnCount()).toBe(before);
  });
});
