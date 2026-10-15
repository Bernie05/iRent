/**
 * A tiny in-memory stand-in for the supabase-js client, enough for unit tests of the auth
 * middleware and /me: auth.getUser, from(table).select/update/eq/is/maybeSingle/single.
 */
import { vi } from 'vitest';

export function createMockSupabase({ tokens = {}, tables = {}, getUserError } = {}) {
  const db = structuredClone(tables);
  const calls = [];

  function from(table) {
    const state = { filters: [], op: 'select', patch: null, cols: '' };
    const api = {
      select(cols = '*') {
        if (state.op === 'select') state.cols = cols;
        return api;
      },
      update(patch) {
        state.op = 'update';
        state.patch = patch;
        return api;
      },
      eq(col, val) {
        state.filters.push((r) => r[col] === val);
        return api;
      },
      is(col, val) {
        state.filters.push((r) => (r[col] ?? null) === val);
        return api;
      },
      maybeSingle: () => exec('maybe'),
      single: () => exec('single'),
      then: (resolve, reject) => exec('many').then(resolve, reject),
    };

    async function exec(mode) {
      const rows = (db[table] ||= []).filter((r) => state.filters.every((f) => f(r)));
      if (state.op === 'update') {
        rows.forEach((r) => Object.assign(r, state.patch));
        calls.push({ table, op: 'update', patch: state.patch, count: rows.length });
      }
      let out = rows.map((r) => ({ ...r }));
      if (table === 'tenancies' && state.cols.includes('bed:beds')) {
        out = out.map((r) => ({ ...r, bed: (db.beds || []).find((b) => b.id === r.bed_id) ?? null }));
      }
      if (mode === 'many') return { data: out, error: null };
      if (mode === 'single') {
        return out.length === 1
          ? { data: out[0], error: null }
          : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      }
      return { data: out[0] ?? null, error: null };
    }
    return api;
  }

  const getUser = vi.fn(async (token) => {
    if (getUserError) return { data: { user: null }, error: getUserError };
    const id = tokens[token];
    return id
      ? { data: { user: { id } }, error: null }
      : { data: { user: null }, error: { status: 401, message: 'invalid JWT' } };
  });

  return { auth: { getUser }, from, _db: db, _calls: calls };
}
