import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Close } from '../../ui/icons';
import { IconButton } from '../../ui/IconButton';

interface LightboxProps {
  images: { src: string; alt: string }[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  /** Dialog name; defaults to the My Unit title. */
  label?: string;
  /** The thumbnail button that opened the lightbox; focus returns here on close (R4). */
  triggerRef: React.RefObject<HTMLElement | null>;
}

/** Fullscreen photo viewer: Left/Right arrows navigate, Esc closes, focus returns to the trigger. */
export function Lightbox({ images, index, onClose, onNavigate, triggerRef, label }: LightboxProps) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Mount/unmount only: move focus in on open, return it to the trigger on close (R4). Re-running this
  // on every `index` change would steal focus back to the thumbnail on each arrow-key press.
  useEffect(() => {
    closeRef.current?.focus();
    const trigger = triggerRef.current;
    return () => trigger?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onNavigate((index - 1 + images.length) % images.length);
      else if (e.key === 'ArrowRight') onNavigate((index + 1) % images.length);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [index, images.length, onClose, onNavigate]);

  const image = images[index];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label ?? t('public:unit.title')}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-scrim p-4"
      onClick={onClose}
    >
      <IconButton
        ref={closeRef}
        label={t('public:lightbox.close')}
        icon={<Close className="h-icon-md w-icon-md" aria-hidden="true" />}
        onClick={onClose}
        className="absolute right-4 top-4 bg-surface"
      />
      <div className="flex max-h-[80vh] w-full max-w-3xl items-center justify-center gap-2 sm:gap-4" onClick={(e) => e.stopPropagation()}>
        <IconButton
          label={t('public:lightbox.previous')}
          icon={<ChevronLeft className="h-icon-md w-icon-md" aria-hidden="true" />}
          onClick={() => onNavigate((index - 1 + images.length) % images.length)}
          className="shrink-0 bg-surface"
        />
        <img src={image.src} alt={image.alt} className="max-h-[70vh] w-auto min-w-0 max-w-full rounded-lg object-contain" />
        <IconButton
          label={t('public:lightbox.next')}
          icon={<ChevronRight className="h-icon-md w-icon-md" aria-hidden="true" />}
          onClick={() => onNavigate((index + 1) % images.length)}
          className="shrink-0 bg-surface"
        />
      </div>
      <p className="type-body-s text-on-brand-strong" aria-live="polite">
        {t('public:lightbox.counter', { current: index + 1, total: images.length })}
      </p>
    </div>
  );
}
