import multer from 'multer';
import { appError } from './errors.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB (NFR1)

/** Allowed image types, detected by magic bytes (never by name or client MIME). */
const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Detect jpeg/png/webp from the first bytes. Returns the MIME type or undefined.
 * HEIC, PDF, GIF, SVG and anything else → undefined.
 */
export function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return undefined;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}

export const extensionFor = (mime) => TYPES[mime];

/** Check one multer file; sets `file.detectedType` and `file.extension`. */
export function assertImage(file) {
  const type = detectImageType(file.buffer);
  if (!type) throw appError('INVALID_FILE_TYPE');
  file.detectedType = type;
  file.extension = TYPES[type];
  return file;
}

const memory = multer({
  storage: multer.memoryStorage(),
  // multer 2.x's `fileSize` is the max allowed (it compensates busboy's off-by-one internally).
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 4, fields: 30, fieldSize: 16 * 1024 },
});

function translateMulterError(err) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return appError('FILE_TOO_LARGE');
    const field = err.field || '_';
    return appError('VALIDATION_ERROR', 'The upload is not valid.', { [field]: 'Unexpected or too many files' });
  }
  return err;
}

function wrap(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) return next(translateMulterError(err));
      try {
        const files = req.file ? [req.file] : Object.values(req.files || {}).flat();
        files.forEach(assertImage);
        next();
      } catch (e) {
        next(e);
      }
    });
  };
}

/**
 * Multipart middleware for one optional image field.
 * Oversized → 413 FILE_TOO_LARGE; not jpeg/png/webp by magic bytes → 400 INVALID_FILE_TYPE.
 * Required-ness is checked by the route.
 */
export const uploadSingle = (field) => wrap(memory.single(field));

/** Multipart middleware for several named optional image fields (each max 1 file). */
export const uploadFields = (names) => wrap(memory.fields(names.map((name) => ({ name, maxCount: 1 }))));
