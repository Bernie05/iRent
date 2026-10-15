import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

/** Shared by Button and LinkButton: size, type, focus ring and press feedback (scale 0.98, off with reduced motion). */
export const BUTTON_BASE_CLASSES =
  'type-label-s inline-flex min-h-touch items-center justify-center gap-2 rounded-full px-5 transition-[background-color,border-color,color,transform] duration-fast ease-out active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-brand hover:bg-primary-hover',
  secondary: 'border border-strong bg-secondary text-primary hover:border-brand hover:bg-secondary-hover',
  ghost: 'text-brand hover:bg-brand-subtle',
  danger: 'bg-danger text-on-danger hover:bg-danger-hover',
  accent: 'bg-accent text-on-accent hover:bg-accent-hover',
};
const VARIANT_CLASSES = BUTTON_VARIANT_CLASSES;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Keeps the button's width and shows a spinner plus "Sending…"/"Saving…" while true. */
  loading?: boolean;
  /** Text shown next to the spinner while loading (defaults to common.sending). */
  loadingText?: string;
  iconLeft?: ReactNode;
}

/** Primary/Secondary/Ghost/Danger/Accent button, 44px tall, blocks double-submit while loading. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, loadingText, iconLeft, disabled, className = '', children, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`${BUTTON_BASE_CLASSES} disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          {loadingText ?? t('sending')}
        </>
      ) : (
        <>
          {iconLeft}
          {children}
        </>
      )}
    </button>
  );
});
