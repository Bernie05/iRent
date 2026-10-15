import { forwardRef, type InputHTMLAttributes } from 'react';

type ChoiceProps = InputHTMLAttributes<HTMLInputElement> & { label: string };

/** Checkbox with a visible, clickable label (44px min touch target on the row). */
export const Checkbox = forwardRef<HTMLInputElement, ChoiceProps>(function Checkbox({ label, id, className = '', ...rest }, ref) {
  return (
    <label htmlFor={id} className="inline-flex min-h-touch cursor-pointer items-center gap-2 type-body-m text-primary">
      <input
        ref={ref}
        type="checkbox"
        id={id}
        className={`h-5 w-5 rounded border-strong text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`}
        {...rest}
      />
      {label}
    </label>
  );
});

export const Radio = forwardRef<HTMLInputElement, ChoiceProps>(function Radio({ label, id, className = '', ...rest }, ref) {
  return (
    <label htmlFor={id} className="inline-flex min-h-touch cursor-pointer items-center gap-2 type-body-m text-primary">
      <input
        ref={ref}
        type="radio"
        id={id}
        className={`h-5 w-5 border-strong text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`}
        {...rest}
      />
      {label}
    </label>
  );
});

export const Switch = forwardRef<HTMLInputElement, ChoiceProps>(function Switch({ label, id, checked, className = '', ...rest }, ref) {
  return (
    <label htmlFor={id} className="inline-flex min-h-touch cursor-pointer items-center gap-2 type-body-m text-primary">
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          id={id}
          checked={checked}
          className={`peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full border border-strong bg-secondary transition-colors checked:border-primary checked:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`}
          {...rest}
        />
        <span className="pointer-events-none absolute left-1 h-4 w-4 rounded-full bg-surface shadow-elevation-1 transition-transform peer-checked:translate-x-5" />
      </span>
      {label}
    </label>
  );
});
