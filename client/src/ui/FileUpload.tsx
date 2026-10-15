import { useId, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, ImageIcon, Close } from './icons';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface FileUploadProps {
  label: string;
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  required?: boolean;
  id?: string;
  /** i18n key for the type/size error; defaults to the generic image message. */
  invalidKey?: string;
}

/** Validates type (JPG/PNG/WebP) and size (< 5MB) client-side; server stays the authority. */
export function validateUploadFile(file: File, t: (key: string) => string, invalidKey = 'validation:fileInvalid'): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return t(invalidKey);
  if (file.size > MAX_BYTES) return t(invalidKey);
  return null;
}

/** FileUpload atom: Empty, Dragging, Uploaded, Error states. */
export function FileUpload({ label, value, onChange, error, required, id, invalidKey }: FileUploadProps) {
  const { t } = useTranslation();
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = error ?? localError ?? undefined;

  function handleFile(file: File | null) {
    if (!file) {
      onChange(null);
      return;
    }
    const problem = validateUploadFile(file, t, invalidKey);
    setLocalError(problem);
    onChange(problem ? null : file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0] ?? null);
  }

  const describedBy = shownError ? `${fieldId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1">
      <span id={`${fieldId}-label`} className="type-label-s text-primary">
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger">
            {' '}
            *
          </span>
        )}
      </span>
      <div className="relative">
        {/* The input is the only interactive control; it's stretched over the dropzone so the whole area is clickable. */}
        <input
          ref={inputRef}
          id={fieldId}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          required={required}
          aria-labelledby={`${fieldId}-label`}
          aria-describedby={describedBy}
          onDragOver={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          onChange={(e) => {
            setDragging(false);
            handleFile(e.target.files?.[0] ?? null);
          }}
        />
        <div
          aria-hidden="true"
          className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center transition-colors ${
            shownError ? 'border-danger' : dragging ? 'border-brand bg-brand-subtle' : 'border-strong bg-surface hover:border-brand hover:bg-brand-subtle'
          }`}
        >
          {value ? (
            <span className="flex items-center gap-2 type-body-s text-primary">
              <ImageIcon className="h-icon-md w-icon-md" aria-hidden="true" />
              {value.name}
            </span>
          ) : (
            <>
              <Upload className="h-icon-md w-icon-md text-tertiary" aria-hidden="true" />
              <span className="type-body-s text-secondary">{t('fileUploadHint')}</span>
            </>
          )}
        </div>
        {value && (
          <button
            type="button"
            aria-label={t('close')}
            onClick={() => handleFile(null)}
            className="absolute right-2 top-2 z-20 rounded-full bg-surface p-1 shadow-elevation-1 hover:bg-muted"
          >
            <Close className="h-icon-sm w-icon-sm" aria-hidden="true" />
          </button>
        )}
      </div>
      {shownError && (
        <p id={`${fieldId}-error`} role="alert" className="type-body-s text-danger">
          {shownError}
        </p>
      )}
    </div>
  );
}
