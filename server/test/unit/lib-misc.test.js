import { describe, it, expect, vi, afterEach } from 'vitest';
import { callRpc } from '../../src/lib/rpc.js';
import { getSupabaseAdmin, setSupabaseAdmin } from '../../src/lib/supabase.js';
import { logger } from '../../src/lib/logger.js';

afterEach(() => {
  setSupabaseAdmin(undefined);
  vi.restoreAllMocks();
  process.env.LOG_LEVEL = 'silent';
});

describe('callRpc (B1/B6 wrapper)', () => {
  it('returns data and maps RPC errors to catalogue errors', async () => {
    const client = { rpc: vi.fn(async (name) => (name === 'ok' ? { data: { x: 1 }, error: null } : { data: null, error: { code: 'P0001', message: 'ITEM_ALREADY_PAID' } })) };
    await expect(callRpc('ok', { a: 1 }, client)).resolves.toEqual({ x: 1 });
    expect(client.rpc).toHaveBeenCalledWith('ok', { a: 1 });
    await expect(callRpc('bad', {}, client)).rejects.toMatchObject({ code: 'ITEM_ALREADY_PAID', status: 409 });
  });

  it('uses the shared service-role client by default', async () => {
    const client = { rpc: vi.fn(async () => ({ data: 1, error: null })) };
    setSupabaseAdmin(client);
    await expect(callRpc('x')).resolves.toBe(1);
  });
});

describe('service-role client', () => {
  it('is created once from config and can be replaced for tests', () => {
    const a = getSupabaseAdmin();
    expect(getSupabaseAdmin()).toBe(a);
    expect(typeof a.from).toBe('function');
    const fake = {};
    setSupabaseAdmin(fake);
    expect(getSupabaseAdmin()).toBe(fake);
  });
});

describe('logger', () => {
  it('writes JSON lines at or above the level and serialises errors', () => {
    process.env.LOG_LEVEL = 'info';
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.debug('hidden');
    logger.info('hello', { a: 1 });
    logger.warn('careful');
    logger.error('boom', { err: new Error('bad') });
    expect(out).toHaveBeenCalledTimes(1);
    expect(JSON.parse(out.mock.calls[0][0])).toMatchObject({ level: 'info', msg: 'hello', a: 1 });
    expect(err).toHaveBeenCalledTimes(2);
    expect(JSON.parse(err.mock.calls[1][0]).err).toMatchObject({ name: 'Error', message: 'bad' });
  });

  it('is silent when LOG_LEVEL=silent', () => {
    process.env.LOG_LEVEL = 'silent';
    const out = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('nope');
    expect(out).not.toHaveBeenCalled();
  });
});
