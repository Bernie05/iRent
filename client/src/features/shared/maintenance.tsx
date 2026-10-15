import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MaintenanceStatus } from '../../types/api';
import { StatusBadge } from '../../ui/StatusBadge';
import { IconButton } from '../../ui/IconButton';
import { InlineAlert } from '../../ui/InlineAlert';
import { Skeleton } from '../../ui/Skeleton';
import { CheckCircle2, Clock, Wrench, XCircle, ZoomIn, ZoomOut } from '../../ui/icons';

const STATUS_STYLE = {
  submitted: { tone: 'warning', Icon: Clock },
  in_progress: { tone: 'info', Icon: Wrench },
  done: { tone: 'success', Icon: CheckCircle2 },
  declined: { tone: 'neutral', Icon: XCircle },
} as const;

/** R74/R75: Submitted / In progress / Done / Declined, text + icon (never colour alone). */
export function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  const { t } = useTranslation();
  const { tone, Icon } = STATUS_STYLE[status];
  return (
    <StatusBadge tone={tone} icon={<Icon className="h-icon-sm w-icon-sm" aria-hidden="true" />}>
      {t(`domain:maintenanceStatus.${status}`)}
    </StatusBadge>
  );
}

/** A request's photos from short-lived signed URLs, with a keyboard zoom toggle (as the payment screenshot, R38). */
export function RequestPhotos({ urls, isError }: { urls: string[] | undefined; isError: boolean }) {
  const { t } = useTranslation();
  const [zoomed, setZoomed] = useState(false);
  if (isError) return <InlineAlert tone="error">{t('ui:maintenance.photosError')}</InlineAlert>;
  if (!urls) return <Skeleton variant="row" />;
  return (
    <section aria-label={t('ui:maintenance.photos')} className="flex flex-col gap-2">
      <div className="flex justify-end">
        <IconButton
          label={zoomed ? t('admin:payments.zoomOut') : t('admin:payments.zoomIn')}
          icon={zoomed ? <ZoomOut className="h-icon-sm w-icon-sm" aria-hidden="true" /> : <ZoomIn className="h-icon-sm w-icon-sm" aria-hidden="true" />}
          aria-pressed={zoomed}
          onClick={() => setZoomed((z) => !z)}
        />
      </div>
      {/* Scrollable when zoomed; tabIndex lets keyboard users pan with the arrow keys. */}
      <div className="flex max-h-[60vh] flex-col gap-2 overflow-auto rounded-md border p-2" tabIndex={0}>
        {urls.map((url, i) => (
          <img key={url + i} src={url} alt={t('ui:maintenance.photoAlt', { n: i + 1, total: urls.length })} className={zoomed ? 'w-[200%] max-w-none' : 'w-full'} />
        ))}
      </div>
    </section>
  );
}
