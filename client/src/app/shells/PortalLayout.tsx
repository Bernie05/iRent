import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { BrandLockup } from '../../ui/Logo';
import { IconButton } from '../../ui/IconButton';
import { Home, Wallet, Receipt, Megaphone, LogOut, Wrench } from '../../ui/icons';
import { useGetMyAnnouncementsQuery } from '../../services/endpoints/renter';
import { useAppDispatch } from '../hooks';
import { logout } from '../logout';
import { ThemeToggle } from './PreferenceControls';

const TABS = [
  { to: '/portal', icon: Home, labelKey: 'nav:home', end: true },
  { to: '/portal/pay', icon: Wallet, labelKey: 'nav:pay', end: false },
  { to: '/portal/history', icon: Receipt, labelKey: 'nav:history', end: false },
  { to: '/portal/bills', icon: Megaphone, labelKey: 'nav:bills', end: false },
  { to: '/portal/requests', icon: Wrench, labelKey: 'nav:requests', end: false }, // D-26, OQ-33
];

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** Desktop: a pill in a segmented group (the admin SegmentedControl look). Mobile: icon in a pill over its caption. */
function TabLink({ to, icon: Icon, labelKey, end, unread, vertical }: (typeof TABS)[number] & { unread?: boolean; vertical: boolean }) {
  const { t } = useTranslation();
  const dot = unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[color:var(--color-bg-surface)] bg-mark" aria-hidden="true" />;
  if (vertical) {
    return (
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          `flex min-h-touch min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-0.5 py-1.5 type-caption transition-colors duration-fast ${FOCUS} ${isActive ? 'text-primary' : 'text-secondary hover:text-primary'}`
        }
      >
        {({ isActive }) => (
          <>
            <span className={`relative flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-fast ${isActive ? 'bg-brand-subtle' : ''}`}>
              <Icon className="h-icon-md w-icon-md" aria-hidden="true" />
              {dot}
            </span>
            <span className={isActive ? 'font-semibold' : ''}>{t(labelKey)}</span>
          </>
        )}
      </NavLink>
    );
  }
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative inline-flex min-h-touch items-center gap-2 rounded-full px-3.5 type-label-s transition-colors duration-fast ${FOCUS} ${
          isActive ? 'bg-primary text-on-brand shadow-elevation-1' : 'text-secondary hover:bg-surface hover:text-primary'
        }`
      }
    >
      <Icon className="h-icon-sm w-icon-sm" aria-hidden="true" />
      {t(labelKey)}
      {dot}
    </NavLink>
  );
}

/** Portal shell (DESIGN.md R8; renter redesign 2026-10-15): TopBar always; BottomTabBar on mobile, a pill tab group in the TopBar from md (768px). */
export function PortalLayout() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { data } = useGetMyAnnouncementsQuery();
  const hasUnread = Boolean(data?.unread_count);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        {t('nav:skipLink')}
      </a>

      <header className="sticky top-0 z-40 border-b bg-[color-mix(in_srgb,var(--color-bg-surface)_88%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/portal" className={`rounded-md ${FOCUS}`}>
            <BrandLockup compact />
          </Link>
          <nav aria-label={t('nav:home')} className="hidden items-center gap-0.5 rounded-full border border-strong bg-muted p-0.5 md:flex">
            {TABS.map((tab) => (
              <TabLink key={tab.to} {...tab} vertical={false} unread={tab.to === '/portal' && hasUnread} />
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <IconButton label={t('logout')} icon={<LogOut className="h-icon-md w-icon-md" aria-hidden="true" />} onClick={() => void logout(dispatch)} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 pb-28 pt-6 sm:pt-8 md:pb-12">
        <Outlet />
      </main>

      <nav
        aria-label={t('nav:home')}
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-surface px-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 shadow-elevation-2 md:hidden"
      >
        {TABS.map((tab) => (
          <TabLink key={tab.to} {...tab} vertical unread={tab.to === '/portal' && hasUnread} />
        ))}
      </nav>
    </div>
  );
}
