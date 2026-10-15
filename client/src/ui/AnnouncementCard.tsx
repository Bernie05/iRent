import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Priority } from '../types/api';
import { AlertTriangle, Pin, Wrench } from './icons';
import { formatDate } from '../lib/format';

interface AnnouncementCardProps {
  title: string;
  body: string;
  priority: Priority;
  pinned?: boolean;
  unread?: boolean;
  createdAt: string;
  /** R72: the maintenance window label ("Oct 20 – 24 · 9:00 AM–5:00 PM"); shows the Maintenance badge. */
  maintenanceWindow?: string | null;
  /** R17 (D-25): a fixed-size thumbnail beside the text (carousel). */
  imageUrl?: string | null;
  className?: string;
  /**
   * R17 (D-25) carousel mode: the body is clamped to 4 lines, "Read more" shows only when it is clamped, and the title
   * and Read more call this (the full announcement opens in a dialog). No in-place expansion.
   */
  onReadMore?: () => void;
  /** Extra controls under the date (e.g. the admin Edit/Delete buttons). */
  actions?: ReactNode;
}

const EXCERPT_LENGTH = 160;
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** Normal/Urgent (icon + "Urgent" text, never colour alone), Pinned, Maintenance, Unread; expandable or clamped body. */
export function AnnouncementCard({
  title,
  body,
  priority,
  pinned,
  unread,
  createdAt,
  maintenanceWindow,
  imageUrl,
  className = '',
  onReadMore,
  actions,
}: AnnouncementCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const clampMode = Boolean(onReadMore);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);

  // Read more only when the 4-line clamp actually cuts the text: measured on mount, body change and resize.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!clampMode || !el) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [clampMode, body]);

  const isLong = !clampMode && body.length > EXCERPT_LENGTH;
  const shown = expanded || !isLong ? body : `${body.slice(0, EXCERPT_LENGTH)}…`;

  function toggle() {
    if (onReadMore) return onReadMore();
    setExpanded((v) => !v);
  }

  return (
    <article
      className={`flex gap-4 rounded-lg border bg-surface p-5 shadow-elevation-1 max-sm:p-4 ${unread ? 'border-brand' : ''} ${className}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {pinned && (
            <span className="inline-flex items-center gap-1 type-label-xs text-brand">
              <Pin className="h-icon-sm w-icon-sm" aria-hidden="true" />
              {t('ui:announcement.pinned')}
            </span>
          )}
          {priority === 'urgent' && (
            <span className="inline-flex items-center gap-1 type-label-xs text-danger">
              <AlertTriangle className="h-icon-sm w-icon-sm" aria-hidden="true" />
              {t('ui:announcement.urgent')}
            </span>
          )}
          {maintenanceWindow && (
            <span className="inline-flex items-center gap-1 type-label-xs text-primary">
              <Wrench className="h-icon-sm w-icon-sm" aria-hidden="true" />
              {t('ui:announcement.maintenance')}
              <span className="font-normal text-secondary">· {maintenanceWindow}</span>
            </span>
          )}
          {unread && (
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-mark" aria-hidden="true" />
              <span className="sr-only">{t('ui:announcement.unread')}</span>
            </span>
          )}
        </div>
        <button type="button" onClick={toggle} className={`inline-flex min-h-touch w-fit items-center text-left type-h4 text-primary ${FOCUS}`}>
          {title}
        </button>
        <p ref={bodyRef} className={`type-body-m max-w-[65ch] text-secondary ${clampMode ? 'line-clamp-4 whitespace-pre-line' : ''}`}>
          {shown}
        </p>
        {(isLong || clamped) && (
          <button type="button" onClick={toggle} className={`inline-flex min-h-touch w-fit items-center type-label-s text-brand underline ${FOCUS}`}>
            {clampMode ? t('ui:announcement.readMore') : expanded ? t('ui:announcement.showLess') : t('ui:announcement.showMore')}
          </button>
        )}
        <p className="mt-auto type-caption text-tertiary">{formatDate(createdAt)}</p>
        {actions}
      </div>
      {imageUrl && <img src={imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-md border object-cover sm:h-24 sm:w-24" />}
    </article>
  );
}
