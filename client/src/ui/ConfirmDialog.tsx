import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  /** Label of the red confirm button. */
  confirmLabel: string;
  /** Label of the safe button (default "Cancel"). */
  dismissLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}

/**
 * Shared confirmation (R65): focus starts on Cancel (the safe choice); Esc, the scrim and Close cancel; the red button
 * confirms. Built on the shared Modal (focus trap, focus returns to the opener).
 */
export function ConfirmDialog({ open, title, body, confirmLabel, dismissLabel, onCancel, onConfirm, busy = false }: ConfirmDialogProps) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Runs after Modal's own effect (child effects run first), so it wins over Modal's "focus the first control".
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={body}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {dismissLabel ?? t('common:cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy} loadingText={t('common:saving')}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {null}
    </Modal>
  );
}

interface ConfirmDeleteProps {
  /** What is being deleted, shown in quotes (e.g. a title or "Room A – Lower Bunk 3"). `null` = closed. */
  item: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
  /** Optional extra consequence, e.g. "It will be removed for every renter." */
  detail?: string;
}

/** The one delete confirmation (Bernie: "every delete"): "Are you sure you want to delete this?". */
export function ConfirmDelete({ item, onCancel, onConfirm, busy = false, detail }: ConfirmDeleteProps) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={item !== null}
      title={t('common:confirmDelete.title')}
      body={item === null ? undefined : `${t('common:confirmDelete.body', { item })}${detail ? ` ${detail}` : ''}`}
      confirmLabel={t('common:confirmDelete.delete')}
      onCancel={onCancel}
      onConfirm={onConfirm}
      busy={busy}
    />
  );
}
