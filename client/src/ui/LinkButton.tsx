import { Link, type LinkProps } from 'react-router-dom';
import { BUTTON_BASE_CLASSES, BUTTON_VARIANT_CLASSES, type ButtonVariant } from './Button';

export interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant;
  className?: string;
}

/** A react-router Link styled like Button, for navigation (Button itself only submits/clicks). */
export function LinkButton({ variant = 'primary', className = '', ...rest }: LinkButtonProps) {
  return (
    <Link
      className={`${BUTTON_BASE_CLASSES} ${BUTTON_VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
