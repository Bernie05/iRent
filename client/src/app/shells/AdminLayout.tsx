import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { BrandLockup } from '../../ui/Logo';
import { IconButton } from '../../ui/IconButton';
import { Home, Bed, Users, Receipt, Wallet, Megaphone, Settings, LogOut, Menu, Close, Tag, Wrench } from '../../ui/icons';
import { useGetDashboardQuery } from '../../services/endpoints/admin';
import { useAppDispatch } from '../hooks';
import { logout } from '../logout';
import { ThemeToggle } from './PreferenceControls';

interface NavItem {
  to: string;
  icon: typeof Home;
  labelKey: string;
  badge?: number;
}

function useNavItems(): NavItem[] {
  const { data } = useGetDashboardQuery();
  return [
    { to: '/admin', icon: Home, labelKey: 'nav:dashboard' },
    { to: '/admin/beds', icon: Bed, labelKey: 'nav:beds' },
    { to: '/admin/renters', icon: Users, labelKey: 'nav:renters' },
    { to: '/admin/rent', icon: Receipt, labelKey: 'nav:rent' },
    { to: '/admin/maintenance', icon: Wrench, labelKey: 'nav:maintenance' }, // D-26 (R27): no badge, the count is on the Dashboard; sits before Payments (Bernie, 2026-10-15)
    { to: '/admin/payments', icon: Wallet, labelKey: 'nav:payments', badge: data?.payments_to_review },
    { to: '/admin/inquiries', icon: Megaphone, labelKey: 'nav:inquiries', badge: data?.new_inquiries },
    { to: '/admin/announcements', icon: Megaphone, labelKey: 'nav:announcements' },
    { to: '/admin/promotions', icon: Tag, labelKey: 'nav:promotions' },
    { to: '/admin/settings', icon: Settings, labelKey: 'nav:settings' },
  ];
}

function SidebarLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const items = useNavItems();
  return (
    <nav aria-label={t('nav:dashboard')} className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/admin'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex min-h-touch items-center justify-between gap-2 rounded-md px-3 type-label-s transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              isActive ? 'bg-brand-subtle text-brand' : 'text-secondary hover:bg-muted hover:text-primary'
            }`
          }
        >
          <span className="flex items-center gap-2">
            <item.icon className="h-icon-md w-icon-md" aria-hidden="true" />
            {t(item.labelKey)}
          </span>
          {Boolean(item.badge) && (
            <span className="type-label-xs min-w-[1.5rem] rounded-full bg-accent px-2 py-0.5 text-center tabular-nums text-on-accent">{item.badge}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Admin shell (DESIGN.md R8): Sidebar (desktop) collapsing into a menu below 1024px, plus a TopBar. */
export function AdminLayout() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        {t('nav:skipLink')}
      </a>

      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b px-4 py-3 lg:hidden bg-[color-mix(in_srgb,var(--color-bg-surface)_88%,transparent)] backdrop-blur-md">
        <Link to="/admin" className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <BrandLockup compact />
        </Link>
        <div className="flex items-center gap-1">
        <ThemeToggle />
        <IconButton label={t('logout')} icon={<LogOut className="h-icon-md w-icon-md" aria-hidden="true" />} onClick={() => void logout(dispatch)} />
        <IconButton
          label={menuOpen ? t('common:close') : t('nav:menu')}
          icon={menuOpen ? <Close className="h-icon-md w-icon-md" aria-hidden="true" /> : <Menu className="h-icon-md w-icon-md" aria-hidden="true" />}
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
        />
        </div>
      </header>
      {menuOpen && (
        <div className="sticky top-[4.25rem] z-30 border-b bg-surface px-4 py-4 shadow-elevation-2 lg:hidden">
          <SidebarLinks onNavigate={() => setMenuOpen(false)} />
        </div>
      )}

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-8 overflow-y-auto border-r bg-surface px-3 py-5 lg:flex">
        <Link to="/admin" className="rounded-md px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <BrandLockup />
        </Link>
        <SidebarLinks />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 hidden items-center justify-end gap-2 border-b px-8 py-3 lg:flex bg-[color-mix(in_srgb,var(--color-bg-surface)_88%,transparent)] backdrop-blur-md">
          <ThemeToggle />
          <IconButton label={t('logout')} icon={<LogOut className="h-icon-md w-icon-md" aria-hidden="true" />} onClick={() => void logout(dispatch)} />
        </div>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
