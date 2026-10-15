import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigError } from '../../src/config.js';

const base = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  EMAIL_FROM: 'iRent <no-reply@example.com>',
  ADMIN_NOTIFY_EMAIL: 'owner@example.com',
  CLIENT_ORIGIN: 'http://localhost:5173',
};

describe('config loader (B1)', () => {
  it('loads a valid config with defaults', () => {
    const cfg = loadConfig(base);
    expect(cfg.PORT).toBe(4000);
    expect(cfg.EMAIL_TRANSPORT).toBe('log');
    expect(cfg.ALLOW_CLOCK_OVERRIDE).toBe(false);
    expect(cfg.CLIENT_ORIGIN).toEqual(['http://localhost:5173']);
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it('accepts several comma-separated client origins', () => {
    const cfg = loadConfig({ ...base, CLIENT_ORIGIN: 'http://localhost:5173, https://irent.example.com' });
    expect(cfg.CLIENT_ORIGIN).toEqual(['http://localhost:5173', 'https://irent.example.com']);
  });

  it('fails fast listing every missing required variable', () => {
    let error;
    try {
      loadConfig({});
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'EMAIL_FROM', 'ADMIN_NOTIFY_EMAIL', 'CLIENT_ORIGIN']) {
      expect(error.message).toContain(key);
    }
  });

  it('treats empty values as unset', () => {
    expect(() => loadConfig({ ...base, SUPABASE_SERVICE_ROLE_KEY: '' })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(loadConfig({ ...base, CLOCK_OVERRIDE: '', EMAIL_LOGO_URL: '' }).CLOCK_OVERRIDE).toBeUndefined();
  });

  it('requires RESEND_API_KEY only for the resend transport', () => {
    expect(() => loadConfig({ ...base, EMAIL_TRANSPORT: 'resend' })).toThrow(/RESEND_API_KEY/);
    expect(loadConfig({ ...base, EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_x' }).EMAIL_TRANSPORT).toBe('resend');
  });

  it('refuses ALLOW_CLOCK_OVERRIDE=true in production (D-12)', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', ALLOW_CLOCK_OVERRIDE: 'true' })).toThrow(
      /ALLOW_CLOCK_OVERRIDE: must not be true when NODE_ENV=production/,
    );
    expect(loadConfig({ ...base, NODE_ENV: 'production', ALLOW_CLOCK_OVERRIDE: 'false' }).NODE_ENV).toBe('production');
  });

  it('rejects CLOCK_OVERRIDE unless the override is allowed, and validates it', () => {
    expect(() => loadConfig({ ...base, CLOCK_OVERRIDE: '2026-09-30T16:30:00Z' })).toThrow(/CLOCK_OVERRIDE/);
    expect(() => loadConfig({ ...base, ALLOW_CLOCK_OVERRIDE: 'true', CLOCK_OVERRIDE: 'yesterday' })).toThrow(/ISO 8601/);
    const cfg = loadConfig({ ...base, ALLOW_CLOCK_OVERRIDE: 'true', CLOCK_OVERRIDE: '2026-09-30T16:30:00Z' });
    expect(cfg.CLOCK_OVERRIDE).toBe('2026-09-30T16:30:00Z');
  });

  it('rejects malformed values', () => {
    expect(() => loadConfig({ ...base, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...base, ADMIN_NOTIFY_EMAIL: 'nope' })).toThrow(/ADMIN_NOTIFY_EMAIL/);
    expect(() => loadConfig({ ...base, CLIENT_ORIGIN: 'not a url' })).toThrow(/CLIENT_ORIGIN/);
    expect(() => loadConfig({ ...base, EMAIL_TRANSPORT: 'smtp' })).toThrow(/EMAIL_TRANSPORT/);
  });
});
