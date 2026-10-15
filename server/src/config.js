import { z } from 'zod';

const boolFromEnv = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    EMAIL_TRANSPORT: z.enum(['resend', 'log']).default('log'),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().min(3),
    ADMIN_NOTIFY_EMAIL: z.string().email(),
    CLIENT_ORIGIN: z
      .string()
      .min(1)
      .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
      .pipe(z.array(z.string().url()).min(1)),
    ALLOW_CLOCK_OVERRIDE: boolFromEnv,
    CLOCK_OVERRIDE: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), {
        message: 'must be an ISO 8601 date-time',
      }),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    MAIL_LOG_DIR: z.string().optional(),
    EMAIL_LOGO_URL: z.string().url().optional(),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.EMAIL_TRANSPORT === 'resend' && !cfg.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'is required when EMAIL_TRANSPORT=resend',
      });
    }
    // D-12: the test clock can never be enabled in production.
    if (cfg.NODE_ENV === 'production' && cfg.ALLOW_CLOCK_OVERRIDE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ALLOW_CLOCK_OVERRIDE'],
        message: 'must not be true when NODE_ENV=production',
      });
    }
    if (cfg.CLOCK_OVERRIDE && !cfg.ALLOW_CLOCK_OVERRIDE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLOCK_OVERRIDE'],
        message: 'is set but ALLOW_CLOCK_OVERRIDE is not true',
      });
    }
  });

export class ConfigError extends Error {
  constructor(issues) {
    const lines = issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    super(`Invalid server configuration:\n${lines.join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/** Parse and validate an env object. Throws ConfigError listing every problem. */
export function loadConfig(env = process.env) {
  // An empty value in .env means "not set".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) throw new ConfigError(result.error.issues);
  return Object.freeze(result.data);
}

let cached;
/** Lazily loaded process config (so tests can set env first). */
export function getConfig() {
  if (!cached) cached = loadConfig(process.env);
  return cached;
}

/** Test helper: forget the cached config. */
export function resetConfigCache() {
  cached = undefined;
}
