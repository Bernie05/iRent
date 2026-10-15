import { useTranslation } from 'react-i18next';
import { env } from '../../config/env';
import { MapPin } from '../../ui/icons';
import { SECTION_HEADING } from './HeroSection';

const LANDMARK_KEYS = ['landmark1', 'landmark2', 'landmark3', 'landmark4'];
// Placeholder pin (R6). Bernie supplies the real address/coordinates before launch (PLAN.md).
// `about:blank` under tests: happy-dom performs a real navigation fetch for an iframe src, which would
// otherwise hit the live network on every test run.
const MAP_EMBED_SRC = env.isTest ? 'about:blank' : 'https://www.google.com/maps?q=Philippines&output=embed';

/** R6: embedded map (placeholder pin) in a rounded panel, with the nearby-landmarks card over its corner on desktop. */
export function LocationSection() {
  const { t } = useTranslation();
  return (
    <section id="location" aria-labelledby="location-title" className="mx-auto scroll-mt-24 max-w-6xl px-4 pb-20 sm:pb-28">
      <div className="flex flex-col gap-3">
        <h2 id="location-title" className={SECTION_HEADING}>
          {t('public:location.title')}
        </h2>
        <p className="type-body-l text-secondary">{t('public:location.lead')}</p>
      </div>
      <div className="relative mt-10 overflow-hidden rounded-2xl border bg-surface">
        <iframe src={MAP_EMBED_SRC} title={t('public:location.mapTitle')} loading="lazy" className="block h-80 w-full bg-muted lg:h-[520px]" />
        <div className="border-t p-6 sm:p-8 lg:absolute lg:bottom-6 lg:left-6 lg:w-[24rem] lg:rounded-xl lg:border lg:bg-surface lg:shadow-elevation-2">
          <h3 className="type-h3 text-primary">{t('public:location.landmarksTitle')}</h3>
          <ul className="mt-4 flex flex-col gap-3 type-body-m text-secondary">
            {LANDMARK_KEYS.map((key) => (
              <li key={key} className="flex gap-3">
                <MapPin className="mt-0.5 h-icon-md w-icon-md shrink-0 text-primary" strokeWidth={1.75} aria-hidden="true" />
                {t(`public:location.${key}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
