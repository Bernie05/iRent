import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbox } from './Lightbox';
import { UNIT_PHOTOS } from '../../lib/demoPhotos';
import { Check } from '../../ui/icons';
import { SECTION_HEADING } from './HeroSection';

const GALLERY_COUNT = UNIT_PHOTOS.length;
const INCLUSION_KEYS = ['inclusionWifi', 'inclusionAircon', 'inclusionBed', 'inclusionUtilities'];
const RULE_KEYS = ['rule1', 'rule2', 'rule3', 'rule4'];

/** Gallery layout: photo 1 is the big panel; on phones the last one also spans the row so nothing is orphaned. */
function tileClass(i: number): string {
  if (i === 0) return 'col-span-2 sm:row-span-2 rounded-2xl';
  if (i === GALLERY_COUNT - 1) return 'col-span-2 sm:col-span-1 rounded-xl';
  return 'rounded-xl';
}

/** R4: gallery of rounded photo panels with a keyboard-accessible lightbox, inclusions and house rules. */
export function MyUnitSection() {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const images = UNIT_PHOTOS.map((photo) => ({ ...photo, alt: t(photo.altKey) }));

  return (
    <section id="gallery" aria-labelledby="unit-title" className="mx-auto scroll-mt-24 max-w-6xl px-4 pb-20 sm:pb-28">
      <h2 id="unit-title" className={SECTION_HEADING}>
        {t('public:unit.title')}
      </h2>

      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {images.map((image, i) => (
          <button
            key={i}
            ref={(el) => {
              thumbRefs.current[i] = el;
            }}
            type="button"
            onClick={() => {
              activeTriggerRef.current = thumbRefs.current[i];
              setOpenIndex(i);
            }}
            className={`overflow-hidden bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${tileClass(i)}`}
          >
            <img
              src={image.src}
              srcSet={image.srcSet}
              sizes={i === 0 ? '(min-width: 1152px) 760px, (min-width: 640px) 66vw, 100vw' : '(min-width: 1152px) 380px, (min-width: 640px) 33vw, 50vw'}
              width={image.width}
              height={image.height}
              alt={image.alt}
              loading="lazy"
              className="aspect-[4/3] h-full w-full object-cover transition-transform duration-modal ease-out hover:scale-[1.03] motion-reduce:hover:scale-100"
            />
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <Lightbox
          images={images}
          index={openIndex}
          onNavigate={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          triggerRef={activeTriggerRef}
        />
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-surface p-6 sm:p-8">
          <h3 className="type-h3 text-primary">{t('public:unit.inclusionsTitle')}</h3>
          <ul className="mt-5 flex flex-col gap-3 type-body-m text-secondary">
            {INCLUSION_KEYS.map((key) => (
              <li key={key} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-on-brand" aria-hidden="true">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {t(`public:unit.${key}`)}
              </li>
            ))}
          </ul>
        </div>
        <div id="house-rules" className="scroll-mt-24 rounded-xl border bg-surface p-6 sm:p-8">
          <h3 className="type-h3 text-primary">{t('public:unit.rulesTitle')}</h3>
          <ul className="mt-5 flex flex-col gap-3 type-body-m text-secondary">
            {RULE_KEYS.map((key) => (
              <li key={key} className="flex gap-3">
                <span className="ml-1.5 mr-1.5 mt-2.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                {t(`public:unit.${key}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
