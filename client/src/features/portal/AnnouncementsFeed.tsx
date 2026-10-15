import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Announcement } from '../../types/api';
import { AnnouncementCard } from '../../ui/AnnouncementCard';
import { Modal } from '../../ui/Modal';
import { ChevronLeft, ChevronRight, Wrench } from '../../ui/icons';
import { useCarousel } from '../../ui/useCarousel';
import { useMarkAnnouncementReadMutation } from '../../services/endpoints/renter';
import { formatDate, maintenanceWindow } from '../../lib/format';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../ui/uiSlice';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';
const ARROW = `inline-flex h-control-md w-control-md items-center justify-center rounded-full border border-strong bg-surface text-primary transition-colors duration-fast hover:bg-muted ${FOCUS}`;

/**
 * R17.1, R18, D-25, D-30: in the order the server sends (pinned, then custom order), as a carousel (shared useCarousel: arrows, dots, ← → keys,
 * swipe, no autoplay). Fixed height: every slide sits in one grid cell (inactive ones hidden and inert), so the frame is
 * as tall as the tallest clamped slide and paging never moves the content below. Title / Read more open the full
 * announcement in a dialog; that open marks it read (once).
 */
export function AnnouncementsFeed({ items, unreadCount }: { items: Announcement[]; unreadCount: number }) {
  const { t } = useTranslation();
  const language = useAppSelector(selectLanguage);
  const [markRead] = useMarkAnnouncementReadMutation();
  const [openId, setOpenId] = useState<string | null>(null);

  // D-30: the server already sends pinned first, then the admin's custom order.
  const sorted = items;

  const { current, many, go, prev, next, regionProps } = useCarousel(sorted.length);
  const slideLabel = (n: number) => t('portal:home.slide', { n, total: sorted.length });
  const open = sorted.find((a) => a.id === openId);
  const openWindow = open ? maintenanceWindow(open, { language }) : null;

  function readMore(a: Announcement) {
    setOpenId(a.id);
    if (!a.is_read) void markRead(a.id);
  }

  return (
    <section aria-labelledby="announcements-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <h2 id="announcements-title" className="type-h3 text-primary">
            {t('portal:home.announcementsTitle')}
          </h2>
          {unreadCount > 0 && (
            <span className="type-label-xs min-w-[1.5rem] rounded-full bg-accent px-2 py-0.5 text-center tabular-nums text-on-accent">{unreadCount}</span>
          )}
        </div>
        {many && (
          <div className="flex items-center gap-2">
            <span className="type-label-s tabular-nums text-secondary" aria-hidden="true">
              {slideLabel(current + 1)}
            </span>
            <button type="button" className={ARROW} onClick={prev} aria-label={t('portal:home.previousAnnouncement')} aria-controls="announcement-slides">
              <ChevronLeft className="h-icon-sm w-icon-sm" aria-hidden="true" />
            </button>
            <button type="button" className={ARROW} onClick={next} aria-label={t('portal:home.nextAnnouncement')} aria-controls="announcement-slides">
              <ChevronRight className="h-icon-sm w-icon-sm" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {sorted.length > 0 ? (
        <div role="region" aria-roledescription="carousel" aria-label={t('portal:home.announcementsTitle')} className="flex touch-pan-y flex-col gap-2" {...regionProps}>
          <div id="announcement-slides" className="grid" aria-live={many ? 'polite' : undefined}>
            {sorted.map((item, i) => (
              <div
                key={item.id}
                role="group"
                aria-roledescription="slide"
                aria-label={slideLabel(i + 1)}
                className="[grid-area:1/1]"
                // Inline (not a class) so the hidden slides are also out of the accessibility tree in tests.
                style={i === current ? undefined : { visibility: 'hidden' }}
                inert={i !== current}
              >
                <AnnouncementCard
                  className="h-full"
                  title={item.title}
                  body={item.body}
                  priority={item.priority}
                  pinned={item.pinned}
                  unread={!item.is_read}
                  createdAt={item.created_at}
                  maintenanceWindow={maintenanceWindow(item, { language })}
                  imageUrl={item.image_url}
                  onReadMore={() => readMore(item)}
                />
              </div>
            ))}
          </div>
          {many && (
            <div className="flex flex-wrap justify-center">
              {sorted.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={t('portal:home.goToAnnouncement', { n: i + 1, total: sorted.length })}
                  aria-current={i === current || undefined}
                  aria-controls="announcement-slides"
                  className={`inline-flex h-6 w-7 items-center justify-center rounded-full ${FOCUS}`}
                >
                  <span
                    className={`h-2 rounded-full transition-[width] duration-fast motion-reduce:transition-none ${
                      i === current ? 'w-5 bg-primary' : 'w-2 bg-[color:var(--color-text-tertiary)]'
                    }`}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="type-body-s text-tertiary">{t('portal:home.announcementsEmpty')}</p>
      )}

      {open && (
        <Modal open onClose={() => setOpenId(null)} title={open.title}>
          <div className="flex flex-col gap-3">
            {openWindow && (
              <p className="inline-flex items-center gap-1 type-label-s text-primary">
                <Wrench className="h-icon-sm w-icon-sm" aria-hidden="true" />
                {t('ui:announcement.maintenance')} · {openWindow}
              </p>
            )}
            <p className="type-body-m whitespace-pre-line text-secondary">{open.body}</p>
            {open.image_url && <img src={open.image_url} alt={t('ui:announcement.imageAlt', { title: open.title })} className="max-h-[60vh] w-full rounded-md border object-contain" />}
            <p className="type-caption text-tertiary">{formatDate(open.created_at, { language })}</p>
          </div>
        </Modal>
      )}
    </section>
  );
}
