import { inject } from 'vitest';

const sb = inject('supabase') ?? { available: false };

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.SUPABASE_LIVE = sb.available ? '1' : '0';

if (sb.available) {
  process.env.SUPABASE_URL = sb.url;
  process.env.SUPABASE_ANON_KEY = sb.anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = sb.serviceKey;
  if (sb.jwtSecret) process.env.SUPABASE_JWT_SECRET = sb.jwtSecret;
} else {
  // Placeholders so the config loader passes in unit tests (nothing connects to them).
  process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
  process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
}

process.env.CLIENT_ORIGIN ??= 'http://localhost:5173';
process.env.EMAIL_TRANSPORT ??= 'log';
process.env.EMAIL_FROM ??= 'iRent <no-reply@example.com>';
process.env.ADMIN_NOTIFY_EMAIL ??= 'owner@example.com';
process.env.ALLOW_CLOCK_OVERRIDE ??= 'true';
