import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, Info, AlertTriangle, Close } from './icons';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  show: (tone: ToastTone, message: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="h-icon-md w-icon-md text-success" aria-hidden="true" />,
  error: <XCircle className="h-icon-md w-icon-md text-danger" aria-hidden="true" />,
  info: <Info className="h-icon-md w-icon-md text-status-info-fg" aria-hidden="true" />,
  warning: <AlertTriangle className="h-icon-md w-icon-md text-status-warning-fg" aria-hidden="true" />,
};

const AUTO_DISMISS_MS = 5000;

/** Toast system (DESIGN.md): success/info/warning auto-dismiss after 5s, error stays until dismissed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);

  const show = useCallback(
    (tone: ToastTone, message: string, action?: ToastAction) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, tone, message, action }]);
      if (tone !== 'error') setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-sm animate-dialog-in items-start gap-3 rounded-lg border bg-surface px-4 py-3 shadow-elevation-2"
          >
            {TONE_ICON[toast.tone]}
            <p className="type-body-s text-primary">{toast.message}</p>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onClick();
                  dismiss(toast.id);
                }}
                className="shrink-0 rounded-md type-label-s text-primary underline underline-offset-4 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label={t('dismiss')}
              onClick={() => dismiss(toast.id)}
              className="ml-auto rounded-full p-1 hover:bg-muted"
            >
              <Close className="h-icon-sm w-icon-sm" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
