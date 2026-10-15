import { rateLimit } from 'express-rate-limit';
import { appError } from '../lib/errors.js';

/**
 * Build a limiter that answers with the NFR2 error shape (429 RATE_LIMITED).
 * @param {object} opts
 * @param {number} opts.windowMs
 * @param {number} opts.limit
 * @param {(req) => string} [opts.keyGenerator]  default: client IP
 * @param {string} [opts.message]
 */
export function createLimiter({ windowMs, limit, keyGenerator, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (_req, _res, next) => next(appError('RATE_LIMITED', message)),
  });
}

/** NFR1: general API limit, 300 requests / 15 min / IP. */
export const generalLimiter = () => createLimiter({ windowMs: 15 * 60 * 1000, limit: 300 });
