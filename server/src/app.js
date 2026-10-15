import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { getConfig } from './config.js';
import { getSupabaseAdmin } from './lib/supabase.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

/**
 * Build the Express app.
 * Middleware order (B1): helmet → cors (CLIENT_ORIGIN only) → JSON → general limiter → routes → 404 → errors.
 * @param {object} [deps]
 * @param {object} [deps.config]    validated config (default: process config)
 * @param {object} [deps.supabase]  service-role client (default: shared client)
 * @param {(router) => void} [deps.extraRoutes]  test hook to mount extra routes under /api
 */
export function createApp(deps = {}) {
  const config = deps.config ?? getConfig();
  const supabase = deps.supabase ?? getSupabaseAdmin();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY ?? 0);

  app.use(helmet());
  const allowed = new Set(config.CLIENT_ORIGIN);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, origin !== undefined && allowed.has(origin)),
      credentials: false,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', generalLimiter());

  const api = apiRouter({ supabase, config });
  if (deps.extraRoutes) deps.extraRoutes(api);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
