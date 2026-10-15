import { useTranslation } from 'react-i18next';
import { env, telHref } from '../../config/env';
import { useGetAvailableBedsQuery } from '../../services/endpoints/public';
import { AMENITY_PHOTOS, HERO_PHOTO } from '../../lib/demoPhotos';
import { formatPeso } from '../../lib/format';
import { ArrowRight, Phone } from '../../ui/icons';
import { useOpenViewingModal } from './ViewingModal';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** Black square CTA of the public site (navbar and hero "Schedule a Viewing", menu-sheet Log in). */
export const SQUARE_CTA = `type-label-m inline-flex items-center justify-center gap-2 bg-primary text-on-brand transition-[background-color,transform] duration-fast ease-out hover:bg-primary-hover active:scale-[0.98] motion-reduce:active:scale-100 ${FOCUS}`;

/** Bold section heading of the public site; scales from small phones to wide screens. */
export const SECTION_HEADING = 'type-h1 text-primary sm:type-display-m';

const AMENITY_COUNT = Object.keys(AMENITY_PHOTOS).length;

/**
 * R2 hero, photo banner (2026-10-14, Bernie): the house photo fills the hero as a full-bleed background under an ink
 * scrim (.hero-scrim, AA-tested worst case in tokens.test.ts) in both themes. On top: headline, subtext, the square
 * "Schedule a Viewing" button (white on the photo; opens the viewing modal) and the call link (R7). The live stats
 * (vacant beds, lowest rate, amenity count) sit in a translucent strip along the bottom.
 */
export function HeroSection() {
  const { t } = useTranslation();
  const { data } = useGetAvailableBedsQuery();
  const openViewing = useOpenViewingModal();

  const rates = data ?? [];
  const vacantBeds = rates.reduce((sum, rate) => sum + rate.vacant_count, 0);
  const fromRate = rates.length ? Math.min(...rates.map((rate) => rate.monthly_rate)) : null;

  const statValue = 'text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-[color:var(--color-mark)]';

  return (
    <section id="top" className="hero-on-photo relative isolate flex flex-col overflow-hidden pt-[4.5rem] lg:pt-20">
      <div className="absolute inset-x-0 bottom-0 top-[4.5rem] -z-10 bg-[color:var(--gray-900)] lg:top-20">
        <img
          src={HERO_PHOTO.src}
          srcSet={HERO_PHOTO.srcSet}
          sizes="100vw"
          width={HERO_PHOTO.width}
          height={HERO_PHOTO.height}
          alt={t(HERO_PHOTO.altKey)}
          fetchPriority="high"
          className="h-full w-full object-cover object-[60%_50%]"
        />
        <div className="hero-scrim absolute inset-0" aria-hidden="true" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 lg:min-h-[min(calc(100svh-5rem-7rem),38rem)]">
        <div className="flex max-w-[36rem] flex-col gap-6 py-12 lg:py-20">
          <h1 className="text-[clamp(2.5rem,1.6rem+3.6vw,4.25rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-primary">
            {t('public:hero.title')}
          </h1>
          <p className="type-body-l max-w-[40ch] text-secondary">{t('public:hero.subtitle')}</p>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
            <button type="button" onClick={openViewing} aria-haspopup="dialog" className={`${SQUARE_CTA} min-h-control-lg w-full px-7 sm:w-auto`}>
              {t('public:hero.cta')}
              <ArrowRight className="h-icon-sm w-icon-sm" aria-hidden="true" />
            </button>
            <a href={telHref()} className={`type-label-m inline-flex min-h-touch items-center justify-center gap-2 tabular-nums text-primary underline-offset-4 hover:underline ${FOCUS}`}>
              <Phone className="h-icon-sm w-icon-sm" aria-hidden="true" />
              {t('public:hero.call', { phone: env.contactPhone })}
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-[color:rgba(255,255,255,0.2)] bg-[color:rgba(var(--hero-scrim-rgb),0.6)] backdrop-blur-sm">
        <dl className="mx-auto grid max-w-6xl grid-cols-3 gap-4 px-4 py-5 sm:gap-8 lg:py-6">
          {data && (
            <div className="flex flex-col-reverse gap-1">
              <dt className="type-body-s max-w-[12ch] text-secondary">{t('public:hero.stats.beds')}</dt>
              <dd className={statValue}>{vacantBeds}</dd>
            </div>
          )}
          {fromRate !== null && (
            <div className="flex flex-col-reverse gap-1">
              <dt className="type-body-s max-w-[12ch] text-secondary">{t('public:hero.stats.from')}</dt>
              <dd className={`whitespace-nowrap ${statValue}`}>{formatPeso(fromRate, { whole: true })}</dd>
            </div>
          )}
          <div className="flex flex-col-reverse gap-1">
            <dt className="type-body-s max-w-[12ch] text-secondary">{t('public:hero.stats.amenities')}</dt>
            <dd className={statValue}>{AMENITY_COUNT}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
