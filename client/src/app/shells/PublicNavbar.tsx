import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BrandLockup } from '../../ui/Logo';
import { IconButton } from '../../ui/IconButton';
import { Modal } from '../../ui/Modal';
import { Menu, Phone } from '../../ui/icons';
import { ThemeToggle } from './PreferenceControls';
import { env, telHref } from '../../config/env';
import { SQUARE_CTA } from '../../features/public/HeroSection';
import { useOpenViewingModal } from '../../features/public/ViewingModal';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** In-page sections, in page order (ids live on the sections themselves). */
const SECTIONS = [
  { id: 'amenities', labelKey: 'public:amenities.title' },
  { id: 'gallery', labelKey: 'public:unit.title' },
  { id: 'location', labelKey: 'public:location.title' },
  { id: 'rates', labelKey: 'public:rates.title' },
  { id: 'faq', labelKey: 'public:faq.navLabel' },
];

/** Scroll-spy: the section crossing the middle of the viewport ("top" = the hero, which highlights nothing). */
function useActiveSection(): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    ['top', ...SECTIONS.map((s) => s.id)].forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);
  return active;
}

/**
 * Public site navbar (DESIGN.md S1 + Build direction, "crisp" 2026-10-14): a plain fixed bar on the page colour, no
 * container, shadow or radius. Brand left; section links centred as plain text, the active one bold (scroll-spy,
 * aria-current); right: call icon (xl+), the Light/Dark switch, "Log in" as a text link (lg+) and a black square
 * "Schedule a Viewing" button (sm+) that opens the viewing modal. Below 1024px the links, phone, Schedule a Viewing (opens the viewing modal) and Log in move into the Modal menu sheet.
 */
export function PublicNavbar() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = useActiveSection();
  const openViewing = useOpenViewingModal();

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 bg-[color-mix(in_srgb,var(--color-bg-page)_92%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between gap-3 px-4 lg:h-20">
          <Link to="/" className={`shrink-0 ${FOCUS}`}>
            <BrandLockup compact />
          </Link>

          <nav aria-label={t('nav:sections')} className="hidden lg:block">
            <ul className="flex items-center gap-1 xl:gap-3">
              {SECTIONS.map(({ id, labelKey }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    aria-current={active === id ? 'true' : undefined}
                    className={`type-body-m inline-flex min-h-touch items-center whitespace-nowrap px-3 transition-colors duration-fast ${FOCUS} ${
                      active === id ? 'font-bold text-primary' : 'text-secondary hover:text-primary'
                    }`}
                  >
                    {t(labelKey)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href={telHref()}
              aria-label={t('public:nav.call', { phone: env.contactPhone })}
              title={t('public:nav.call', { phone: env.contactPhone })}
              className={`hidden h-control-md w-control-md items-center justify-center text-secondary hover:text-primary xl:inline-flex ${FOCUS}`}
            >
              <Phone className="h-icon-sm w-icon-sm" aria-hidden="true" />
            </a>
            <ThemeToggle />
            <Link
              to="/login"
              className={`type-label-m hidden min-h-touch items-center px-3 text-primary underline-offset-4 hover:underline lg:inline-flex ${FOCUS}`}
            >
              {t('common:login')}
            </Link>
            <button type="button" onClick={openViewing} aria-haspopup="dialog" className={`${SQUARE_CTA} hidden min-h-touch px-5 sm:inline-flex`}>
              {t('public:nav.scheduleViewing')}
            </button>
            <IconButton
              label={t('nav:menu')}
              icon={<Menu className="h-icon-md w-icon-md" aria-hidden="true" />}
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className="!rounded-none lg:hidden"
            />
          </div>
        </div>
      </header>

      <Modal open={open} onClose={() => setOpen(false)} title={t('nav:menu')}>
        <nav aria-label={t('nav:sections')}>
          <ul className="flex flex-col">
            {SECTIONS.map(({ id, labelKey }) => (
              <li key={id} className="border-b last:border-b-0">
                <a
                  href={`#${id}`}
                  onClick={() => setOpen(false)}
                  aria-current={active === id ? 'true' : undefined}
                  className={`type-h4 flex min-h-[3.25rem] items-center justify-between px-1 ${FOCUS} ${active === id ? 'text-primary' : 'text-secondary hover:text-primary'}`}
                >
                  {t(labelKey)}
                  {active === id && <span className="h-2 w-2 rounded-full bg-mark" aria-hidden="true" />}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-6 flex flex-col gap-3">
          <a
            href={telHref()}
            className={`type-label-m inline-flex min-h-control-lg items-center justify-center gap-2 border border-strong tabular-nums text-primary ${FOCUS}`}
          >
            <Phone className="h-icon-sm w-icon-sm" aria-hidden="true" />
            {env.contactPhone}
          </a>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openViewing();
            }}
            className={`${SQUARE_CTA} min-h-control-lg`}
          >
            {t('public:nav.scheduleViewing')}
          </button>
          <Link to="/login" className={`type-label-m inline-flex min-h-control-lg items-center justify-center border border-strong text-primary ${FOCUS}`}>
            {t('common:login')}
          </Link>
        </div>
      </Modal>
    </>
  );
}
