import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { IconButton } from './IconButton';
import { Close } from './icons';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open modals, last = topmost. Only the topmost handles Esc and the Tab trap.
const openStack: string[] = [];

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra classes for the dialog panel (e.g. the public site's square, flat look). */
  panelClassName?: string;
}

/**
 * Modal shell (DESIGN.md Interactions & Motion): focus trap, Esc closes, focus returns to the opener, page scroll locked,
 * 200ms fade+scale (off with prefers-reduced-motion), bottom sheet under 640px.
 */
export function Modal({ open, onClose, title, description, children, footer, panelClassName = '' }: ModalProps) {
  const { t } = useTranslation();
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-description`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const reducedMotion = useReducedMotion();
  // Kept current without re-running the effect below on every render (an inline `onClose` prop is a
  // new reference each time; the effect must only run on open/close, not on every parent re-render,
  // or it steals focus back to the first focusable element while the user is still typing).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    openStack.push(uid);
    // Scroll lock while open (restored on close; nested modals restore in order).
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusable?.[0] ?? dialog)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (openStack[openStack.length - 1] !== uid) return;
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openStack.splice(openStack.indexOf(uid), 1);
      root.style.overflow = previousOverflow;
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, uid]);

  if (!open) return null;

  // Enter only: scrim fades, the dialog rises 8px and scales from 0.97 (a bottom sheet slides up under 640px).
  const transition = reducedMotion ? '' : 'animate-sheet-in sm:animate-dialog-in';

  return (
    <div className={`fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center sm:p-4 ${reducedMotion ? '' : 'animate-scrim-in'}`} onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full flex-col gap-4 rounded-t-xl bg-surface p-6 shadow-elevation-3 sm:max-w-lg sm:rounded-xl ${transition} ${panelClassName}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="type-h3 text-primary">
              {title}
            </h2>
            {description && (
              <p id={descId} className="type-body-s text-secondary">
                {description}
              </p>
            )}
          </div>
          <IconButton label={t('close')} icon={<Close className="h-icon-md w-icon-md" aria-hidden="true" />} onClick={onClose} />
        </div>
        <div className="overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
