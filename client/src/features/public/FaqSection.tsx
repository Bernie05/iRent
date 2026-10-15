import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from '../../ui/icons';
import { SECTION_HEADING } from './HeroSection';

/** Question keys under public:faq.items; `link` adds an in-page link after the answer. */
const ITEMS: { key: string; link?: { href: string; labelKey: string } }[] = [
  { key: 'deposit' },
  { key: 'included' },
  { key: 'minimumStay' },
  { key: 'visitors', link: { href: '#house-rules', labelKey: 'public:faq.rulesLink' } },
  { key: 'payment' },
];

function FaqItem({ itemKey, link }: { itemKey: string; link?: { href: string; labelKey: string } }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className="border-b border-strong">
      <h3>
        <button
          type="button"
          id={`${id}-q`}
          aria-expanded={open}
          aria-controls={`${id}-a`}
          onClick={() => setOpen((v) => !v)}
          className="type-h4 flex min-h-[4rem] w-full items-center justify-between gap-6 py-4 text-left text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {t(`public:faq.items.${itemKey}.q`)}
          <Plus
            className={`h-icon-md w-icon-md shrink-0 transition-transform duration-fast motion-reduce:transition-none ${open ? 'rotate-45' : ''}`}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div id={`${id}-a`} role="region" aria-labelledby={`${id}-q`} hidden={!open} className="type-body-m max-w-[65ch] pb-6 text-secondary">
        <p>{t(`public:faq.items.${itemKey}.a`)}</p>
        {link && (
          <a href={link.href} className="type-label-m mt-3 inline-flex min-h-touch items-center text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {t(link.labelKey)}
          </a>
        )}
      </div>
    </li>
  );
}

/** FAQ accordion (DESIGN.md → Build direction): buttons with aria-expanded, any number open, square and flat. */
export function FaqSection() {
  const { t } = useTranslation();
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto grid max-w-6xl scroll-mt-24 gap-10 px-4 pb-20 sm:pb-28 lg:grid-cols-[2fr_3fr] lg:gap-16">
      <div className="flex flex-col gap-4">
        <h2 id="faq-title" className={SECTION_HEADING}>
          {t('public:faq.title')}
        </h2>
        <p className="type-body-l max-w-[40ch] text-secondary">{t('public:faq.lead')}</p>
      </div>
      <ul className="border-t border-strong">
        {ITEMS.map(({ key, link }) => (
          <FaqItem key={key} itemKey={key} link={link} />
        ))}
      </ul>
    </section>
  );
}
