import { validationError } from './errors.js';

/** Convert zod issues to `{ field: message }` (first message per field wins). */
export function zodDetails(zodError) {
  const details = {};
  for (const issue of zodError.issues) {
    let field = issue.path.join('.');
    if (!field && issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) details[key] ??= 'Unknown field';
      continue;
    }
    field ||= '_';
    details[field] ??= issue.message;
  }
  return details;
}

/** Parse `data` with `schema` or throw VALIDATION_ERROR with per-field details. */
export function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) throw validationError(zodDetails(result.error));
  return result.data;
}

/**
 * Express middleware: validates `req[source]` ('body' | 'query' | 'params') with a zod schema.
 * The parsed (whitelisted, coerced) value replaces the original and is also kept on `req.valid`.
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    try {
      const parsed = parseOrThrow(schema, req[source] ?? {});
      req.valid = { ...(req.valid || {}), [source]: parsed };
      if (source !== 'query') req[source] = parsed;
      next();
    } catch (err) {
      next(err);
    }
  };
}
