import { createContext, useContext, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../ui/Modal';
import { ViewingForm } from './ViewingForm';

const OpenViewingModal = createContext<(() => void) | null>(null);

/**
 * Owns the one "Schedule a Viewing" modal of the public site (hero and navbar buttons open it). Modal returns focus
 * to the button that opened it; a successful submit shows the toast and closes it.
 */
export function ViewingModalProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <OpenViewingModal.Provider value={() => setOpen(true)}>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title={t('public:viewingForm.title')} description={t('public:viewingForm.intro')}
        panelClassName="!rounded-none border !shadow-none"
      >
        <ViewingForm withStayDetails onSuccess={() => setOpen(false)} />
      </Modal>
    </OpenViewingModal.Provider>
  );
}

/** Opens the viewing modal. Needs ViewingModalProvider above (PublicLayout). */
export function useOpenViewingModal(): () => void {
  const open = useContext(OpenViewingModal);
  if (!open) throw new Error('useOpenViewingModal needs ViewingModalProvider');
  return open;
}
