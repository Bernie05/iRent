import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AmenityCard } from '../../ui/AmenityCard';
import { Lightbox } from './Lightbox';
import { IconButton } from '../../ui/IconButton';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { AMENITY_PHOTOS } from '../../lib/demoPhotos';
import { Waves, Building2, Baby, Trophy, ShieldCheck, Church, Footprints, ChevronLeft, ChevronRight, type LucideIcon } from '../../ui/icons';
import { SECTION_HEADING } from './HeroSection';

const AMENITIES: { key: string; icon: LucideIcon }[] = [
  { key: 'pool', icon: Waves },
  { key: 'clubhouse', icon: Building2 },
  { key: 'playground', icon: Baby },
  { key: 'basketballCourt', icon: Trophy },
  { key: 'security', icon: ShieldCheck },
  { key: 'chapel', icon: Church },
  { key: 'joggingPath', icon: Footprints },
];

/**
 * R3: the 7 amenities as a scroll-snap row of 4:5 photo cards (photos: lib/demoPhotos → AMENITY_PHOTOS, one array per
 * amenity). The row scrolls by touch, trackpad, keyboard (focusable list) or the previous/next buttons. A card shows its
 * first photo and a photo count; clicking it opens all of that amenity's photos in the Lightbox (focus returns to it).
 */
export function AmenitiesSection() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const [open, setOpen] = useState<{ key: string; index: number } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  function onScroll() {
    const el = track.current;
    if (el) setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
  }

  function page(dir: 1 | -1) {
    const el = track.current;
    el?.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  return (
    <section id="amenities" aria-labelledby="amenities-title" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-xl flex-col gap-3">
          <h2 id="amenities-title" className={SECTION_HEADING}>
            {t('public:amenities.title')}
          </h2>
          <p className="type-body-l text-secondary">{t('public:amenities.lead')}</p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <IconButton
            label={t('public:amenities.previous')}
            icon={<ChevronLeft className="h-icon-md w-icon-md" aria-hidden="true" />}
            variant="secondary"
            disabled={edge.start}
            onClick={() => page(-1)}
          />
          <IconButton
            label={t('public:amenities.next')}
            icon={<ChevronRight className="h-icon-md w-icon-md" aria-hidden="true" />}
            variant="secondary"
            disabled={edge.end}
            onClick={() => page(1)}
          />
        </div>
      </div>

      <ul
        ref={track}
        onScroll={onScroll}
        tabIndex={0}
        aria-label={t('public:amenities.title')}
        className="-mx-4 mt-10 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:gap-5 [&::-webkit-scrollbar]:hidden"
      >
        {AMENITIES.map(({ key, icon: Icon }) => (
          <li key={key} className="w-[72%] shrink-0 snap-start sm:w-[44%] lg:w-[calc((100%-2.5rem)/3.4)]">
            <AmenityCard
              photo={AMENITY_PHOTOS[key][0]}
              alt={t(AMENITY_PHOTOS[key][0].altKey)}
              sizes="(min-width: 1024px) 20rem, (min-width: 640px) 44vw, 72vw"
              icon={<Icon className="h-icon-sm w-icon-sm text-primary" strokeWidth={1.75} />}
              label={t(`public:amenities.${key}`)}
              countLabel={t('public:amenities.photoCount', { count: AMENITY_PHOTOS[key].length })}
              aria-label={`${t(`public:amenities.${key}`)}, ${t('public:amenities.photoCount', { count: AMENITY_PHOTOS[key].length })}`}
              onClick={(e) => {
                trigger.current = e.currentTarget;
                setOpen({ key, index: 0 });
              }}
            />
          </li>
        ))}
      </ul>

      {open && (
        <Lightbox
          label={t(`public:amenities.${open.key}`)}
          images={AMENITY_PHOTOS[open.key].map((photo) => ({ src: photo.src, alt: t(photo.altKey) }))}
          index={open.index}
          onNavigate={(index) => setOpen({ key: open.key, index })}
          onClose={() => setOpen(null)}
          triggerRef={trigger}
        />
      )}
    </section>
  );
}
