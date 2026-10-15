/**
 * Application error with a stable catalogue code (backend-task.md → Error-code catalogue).
 * Everything thrown to the error handler is converted to
 *   { error: { code, message, details? } }   (NFR2)
 */
export class AppError extends Error {
  /**
   * @param {string} code    UPPER_SNAKE catalogue code
   * @param {number} status  HTTP status
   * @param {string} message human-readable, safe to show to users
   * @param {Record<string,string>} [details] per-field messages (validation only)
   */
  constructor(code, status, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }

  toJSON() {
    const body = { code: this.code, message: this.message };
    if (this.details !== undefined) body.details = this.details;
    return { error: body };
  }
}

/** Catalogue: code → [HTTP status, default message]. */
export const ERROR_CATALOGUE = Object.freeze({
  VALIDATION_ERROR: [400, 'Some fields are invalid.'],
  INVALID_FILE_TYPE: [400, 'The file must be a JPEG, PNG or WebP image.'],
  AMOUNT_BELOW_PAID: [400, "The amount can't be less than what has already been paid."],
  SHARES_SUM_MISMATCH: [400, 'The shares must add up to the bill total.'],
  NO_ACTIVE_TENANCIES: [400, 'No active renters to split this bill with.'],
  REFUND_EXCEEDS_CREDIT: [400, "Refund can't be more than the credit balance."],
  MOVE_OUT_BEFORE_MOVE_IN: [400, "The move-out date can't be before the move-in date."],
  MOVE_OUT_IN_FUTURE: [400, "The move-out date can't be in the future."],
  NOT_REVIEWABLE: [400, 'Credit payments cannot be reviewed.'],
  UNAUTHENTICATED: [401, 'You need to log in.'],
  FORBIDDEN: [403, "You don't have access to this."],
  NOT_FOUND: [404, 'Not found.'],
  DUPLICATE_REFERENCE: [409, 'This reference number was already used.'],
  ITEM_ALREADY_PAID: [409, 'This item is already paid.'],
  ALREADY_REVIEWED: [409, 'This payment was already reviewed.'],
  ALREADY_ACTIVATED: [409, 'This renter has already set a password.'],
  EMAIL_EXISTS: [409, 'An account with this email already exists.'],
  BED_TAKEN: [409, 'This bed was just taken. Choose another bed.'],
  RENTER_HAS_ACTIVE_TENANCY: [409, 'This renter already has an active bed.'],
  BED_HAS_HISTORY: [409, "This bed has rental history and can't be deleted."],
  BED_OCCUPIED: [409, "An occupied bed's status can only change through move-out."],
  CHARGE_HAS_PAYMENTS: [409, "This charge has payments and can't be deleted."],
  FILE_TOO_LARGE: [413, 'The file must be 5 MB or smaller.'],
  RATE_LIMITED: [429, 'Too many requests. Please try again later.'],
  INTERNAL: [500, 'Something went wrong. Please try again.'],
});

/** Build an AppError from a catalogue code, optionally overriding the message. */
export function appError(code, message, details) {
  const entry = ERROR_CATALOGUE[code];
  if (!entry) throw new Error(`Unknown error code: ${code}`);
  return new AppError(code, entry[0], message ?? entry[1], details);
}

export const notFound = (message) => appError('NOT_FOUND', message);
export const forbidden = (message) => appError('FORBIDDEN', message);
export const unauthenticated = (message) => appError('UNAUTHENTICATED', message);
export const validationError = (details, message) =>
  appError('VALIDATION_ERROR', message, details);
