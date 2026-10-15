import { AppError, appError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/** 404 for any unmatched route. */
export function notFoundHandler(_req, _res, next) {
  next(appError('NOT_FOUND', 'Route not found.'));
}

/**
 * The single error handler. Converts everything into the NFR2 shape.
 * Unknown errors become 500 INTERNAL with a generic message; details go to the log only.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let appErr;
  if (err instanceof AppError) {
    appErr = err;
  } else if (err?.type === 'entity.parse.failed') {
    appErr = appError('VALIDATION_ERROR', 'The request body is not valid JSON.', { _: 'Malformed JSON' });
  } else if (err?.type === 'entity.too.large') {
    appErr = appError('VALIDATION_ERROR', 'The request body is too large.', { _: 'Too large' });
  } else {
    appErr = appError('INTERNAL');
  }

  if (appErr.status >= 500) {
    logger.error('request failed', {
      method: req.method,
      path: req.originalUrl?.split('?')[0],
      err: appErr.cause ?? err,
    });
  }

  if (res.headersSent) return;
  res.status(appErr.status).json(appErr.toJSON());
}
