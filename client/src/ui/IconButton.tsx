import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type IconButtonVariant = 'ghost' | 'secondary';

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  ghost: 'text-secondary hover:bg-muted hover:text-primary',
  secondary: 'border border-strong bg-secondary text-primary hover:bg-secondary-hover',
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  /** Required: icon-only buttons must have an accessible name. */
  label: string;
  icon: ReactNode;
}

/** 44x44 icon-only button. `label` becomes the accessible name via aria-label. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', label, icon, disabled, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`inline-flex h-control-md w-control-md items-center justify-center rounded-full transition-[background-color,border-color,color,transform] duration-fast ease-out active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  );
});
