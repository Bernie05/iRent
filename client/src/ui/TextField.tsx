import { ChevronDown } from './icons';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldChromeProps {
  label: string;
  helper?: string;
  error?: string;
  required?: boolean;
  id: string;
  labelHidden?: boolean;
}

function FieldChrome({ label, helper, error, required, id, labelHidden, children }: FieldChromeProps & { children: ReactNode }) {
  const helperId = helper ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelHidden ? 'sr-only' : 'type-label-s text-primary'}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-danger">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {helper && !error && (
        <p id={helperId} className="type-body-s text-tertiary">
          {helper}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="type-body-s text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const fieldClasses = (hasError: boolean) =>
  `min-h-touch rounded-md border bg-surface px-3 type-body-m text-primary shadow-elevation-1 transition-colors duration-fast placeholder:text-tertiary hover:border-brand focus-visible:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 ${
    hasError ? 'border-danger' : 'border-strong'
  }`;

type BaseFieldProps = {
  label: string;
  helper?: string;
  error?: string;
  containerClassName?: string;
  /** Keeps the label for screen readers only (e.g. an input inside a table cell). */
  labelHidden?: boolean;
};

export type TextFieldProps = BaseFieldProps & InputHTMLAttributes<HTMLInputElement>;

/** Text/email/password/date input (`type` picks the HTML input type; `type="date"` uses the native picker). */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, labelHidden, helper, error, required, id, containerClassName = '', className = '', ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedBy = error ? `${fieldId}-error` : helper ? `${fieldId}-helper` : undefined;
  return (
    <div className={containerClassName}>
      <FieldChrome label={label} labelHidden={labelHidden} helper={helper} error={error} required={required} id={fieldId}>
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={`${fieldClasses(Boolean(error))} ${className}`}
          {...rest}
        />
      </FieldChrome>
    </div>
  );
});

export type TextareaFieldProps = BaseFieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(function TextareaField(
  { label, helper, error, required, id, containerClassName = '', className = '', rows = 4, ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedBy = error ? `${fieldId}-error` : helper ? `${fieldId}-helper` : undefined;
  return (
    <div className={containerClassName}>
      <FieldChrome label={label} helper={helper} error={error} required={required} id={fieldId}>
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          required={required}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={`${fieldClasses(Boolean(error))} py-2 ${className}`}
          {...rest}
        />
      </FieldChrome>
    </div>
  );
});

export type SelectFieldProps = BaseFieldProps &
  SelectHTMLAttributes<HTMLSelectElement> & {
    options: { value: string; label: string }[];
    placeholder?: string;
  };

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, labelHidden, helper, error, required, id, options, placeholder, containerClassName = '', className = '', ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedBy = error ? `${fieldId}-error` : helper ? `${fieldId}-helper` : undefined;
  return (
    <div className={containerClassName}>
      <FieldChrome label={label} labelHidden={labelHidden} helper={helper} error={error} required={required} id={fieldId}>
        {/* One caret for every select: the native arrow (placed differently per browser and OS) is hidden and a chevron
            is centred vertically with a fixed right inset; the text stops before it. */}
        <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={`${fieldClasses(Boolean(error))} w-full appearance-none pr-10 ${className}`}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-icon-sm w-icon-sm -translate-y-1/2 text-secondary" aria-hidden="true" />
        </div>
      </FieldChrome>
    </div>
  );
});
