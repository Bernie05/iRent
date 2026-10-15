import { useTranslation } from 'react-i18next';
import { useGetActivePromotionsQuery } from '../../services/endpoints/public';
import type { Promotion } from '../../types/api';
import { ArrowRight, ChevronLeft, ChevronRight } from '../../ui/icons';
import { useCarousel } from '../../ui/useCarousel';
import { SQUARE_CTA } from './HeroSection';
import { useOpenViewingModal } from './ViewingModal';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';
const ARROW = `inline-flex h-control-md w-control-md items-center justify-center border border-strong bg-surface text-primary transition-colors duration-fast hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;

function PromoCta({ promo }: { promo: Promotion }) {
  const openViewing = useOpenViewingModal();
  if (promo.cta_action === 'none' || !promo.cta_label || (promo.cta_action === 'section' && !promo.cta_section)) return null;
  const inner = (
    <>
      {promo.cta_label}
      <ArrowRight className="h-icon-sm w-icon-sm" aria-hidden="true" />
    </>
  );
  const cls = `${SQUARE_CTA} min-h-control-md w-full px-6 sm:w-auto`;
  return promo.cta_action === 'viewing' ? (
    <button type="button" onClick={openViewing} aria-haspopup="dialog" className={cls}>
      {inner}
    </button>
  ) : (
    // An in-page anchor: index.css scrolls smoothly only under prefers-reduced-motion: no-preference.
    <a href={`#${promo.cta_section}`} className={cls}>
      {inner}
    </a>
  );
}

/**
 * Promos (2026-10-14, Bernie): the admin's visible, in-date promotions as a wide banner under the hero. Several promos
 * form a carousel (APG pattern, shared useCarousel): Prev/Next buttons, ← → keys and swipe, "1 of 3", no autoplay. Hidden when there are none or
 * the admin switched the section off (the API then returns []).
 */
export function PromosSection() {
  const { t } = useTranslation();
  const { data } = useGetActivePromotionsQuery();
  const promos = data ?? [];
  const { current, many, prev, next, regionProps } = useCarousel(promos.length);
  if (promos.length === 0) return null;

  const promo = promos[current];

  return (
    <section id="promos" aria-labelledby="promos-title" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-12 sm:pt-16">
      <div className="flex items-end justify-between gap-4">
        <h2 id="promos-title" className="type-h3 text-primary">
          {t('public:promos.heading')}
        </h2>
        {many && (
          <div className="flex items-center gap-2">
            <span className="type-label-s tabular-nums text-secondary" aria-hidden="true">
              {t('public:promos.slide', { n: current + 1, total: promos.length })}
            </span>
            <button type="button" className={ARROW} onClick={prev} aria-label={t('public:promos.previous')} aria-controls="promos-slide">
              <ChevronLeft className="h-icon-sm w-icon-sm" aria-hidden="true" />
            </button>
            <button type="button" className={ARROW} onClick={next} aria-label={t('public:promos.next')} aria-controls="promos-slide">
              <ChevronRight className="h-icon-sm w-icon-sm" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 touch-pan-y" role="region" aria-roledescription="carousel" aria-label={t('public:promos.carousel')} {...regionProps}>
        <div
          id="promos-slide"
          key={promo.id}
          role="group"
          aria-roledescription="slide"
          aria-label={t('public:promos.slide', { n: current + 1, total: promos.length })}
          aria-live={many ? 'polite' : undefined}
          className="grid overflow-hidden border bg-surface md:grid-cols-[1.15fr_1fr]"
        >
          {promo.image_url ? (
            <img src={promo.image_url} alt="" loading="lazy" className="aspect-[16/9] h-full w-full bg-muted object-cover md:aspect-auto md:min-h-[18rem]" />
          ) : (
            <div className="hidden bg-muted md:block" aria-hidden="true" />
          )}
          <div className="flex flex-col items-start gap-4 p-6 sm:p-10">
            {promo.badge && <span className="type-label-xs bg-accent px-2.5 py-1 text-on-accent">{promo.badge}</span>}
            <h3 className="type-h2 text-primary">{promo.title}</h3>
            {promo.description && <p className="type-body-m max-w-[46ch] text-secondary">{promo.description}</p>}
            <div className="mt-2 w-full sm:w-auto">
              <PromoCta promo={promo} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
