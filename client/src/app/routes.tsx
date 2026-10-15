import type { ComponentType } from 'react';
import { Outlet, type RouteObject } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NavigationBridge } from './NavigationBridge';
import { AppBootstrap } from './AppBootstrap';
import { ProtectedRoute, RedirectIfAuthenticated } from './ProtectedRoute';
import { PublicNavbar } from './shells/PublicNavbar';
import { NotFoundScreen } from './shells/NotFoundScreen';
import { PublicHomePage } from '../features/public/PublicHomePage';
import { ViewingModalProvider } from '../features/public/ViewingModal';

/** Route-level code splitting: each screen is its own chunk, loaded when its route is first visited. */
function page<M>(load: () => Promise<M>, name: keyof M): NonNullable<RouteObject['lazy']> {
  return async () => ({ Component: (await load())[name] as ComponentType });
}

function LoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p role="status" className="type-body-m text-secondary">
        {t('common:loading')}
      </p>
    </div>
  );
}

function RootLayout() {
  return (
    <>
      <NavigationBridge />
      <AppBootstrap>
        <Outlet />
      </AppBootstrap>
    </>
  );
}

function PublicLayout() {
  const { t } = useTranslation();
  // site-crisp: the public site's flat-gray, near-square scope (tokens.css).
  return (
    <div className="site-crisp min-h-dvh bg-page text-primary">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        {t('nav:skipLink')}
      </a>
      <ViewingModalProvider>
        <PublicNavbar />
        <Outlet />
      </ViewingModalProvider>
    </div>
  );
}

/**
 * Route table (F5): public `/`, `/login`, `/set-password`, `/forgot-password`, `/portal/*` (renter),
 * `/admin/*` (admin), `/dev/kit` (dev only).
 */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    hydrateFallbackElement: <LoadingFallback />,
    children: [
      {
        element: <PublicLayout />,
        children: [{ path: '/', element: <PublicHomePage /> }],
      },
      {
        path: '/login',
        element: (
          <RedirectIfAuthenticated>
            <Outlet />
          </RedirectIfAuthenticated>
        ),
        children: [{ index: true, lazy: page(() => import('../features/auth/LoginScreen'), 'LoginScreen') }],
      },
      { path: '/set-password', lazy: page(() => import('../features/auth/SetPasswordScreen'), 'SetPasswordScreen') },
      { path: '/forgot-password', lazy: page(() => import('../features/auth/ForgotPasswordScreen'), 'ForgotPasswordScreen') },
      {
        path: '/portal',
        element: (
          <ProtectedRoute role="renter">
            <Outlet />
          </ProtectedRoute>
        ),
        // The shells are lazy too, so the public entry chunk carries no portal/admin code (O-4).
        children: [
          {
            lazy: page(() => import('./shells/PortalLayout'), 'PortalLayout'),
            children: [
              { index: true, lazy: page(() => import('../features/portal/PortalHomePage'), 'PortalHomePage') },
              { path: 'pay', lazy: page(() => import('../features/portal/PortalPayPage'), 'PortalPayPage') },
              { path: 'history', lazy: page(() => import('../features/portal/PortalHistoryPage'), 'PortalHistoryPage') },
              { path: 'bills', lazy: page(() => import('../features/portal/PortalBillsPage'), 'PortalBillsPage') },
              { path: 'requests', lazy: page(() => import('../features/portal/PortalRequestsPage'), 'PortalRequestsPage') },
            ],
          },
        ],
      },
      {
        path: '/admin',
        element: (
          <ProtectedRoute role="admin">
            <Outlet />
          </ProtectedRoute>
        ),
        children: [
          {
            lazy: page(() => import('./shells/AdminLayout'), 'AdminLayout'),
            children: [
              { index: true, lazy: page(() => import('../features/admin/AdminDashboardPage'), 'AdminDashboardPage') },
              { path: 'beds', lazy: page(() => import('../features/admin/AdminBedsPage'), 'AdminBedsPage') },
              { path: 'renters', lazy: page(() => import('../features/admin/AdminRentersPage'), 'AdminRentersPage') },
              { path: 'renters/:id', lazy: page(() => import('../features/admin/AdminRentersPage'), 'AdminRentersPage') },
              { path: 'rent', lazy: page(() => import('../features/admin/AdminRentPage'), 'AdminRentPage') },
              { path: 'payments', lazy: page(() => import('../features/admin/AdminPaymentsPage'), 'AdminPaymentsPage') },
              { path: 'bills', lazy: page(() => import('../features/admin/AdminBillsPage'), 'AdminBillsPage') },
              { path: 'inquiries', lazy: page(() => import('../features/admin/AdminInquiriesPage'), 'AdminInquiriesPage') },
              { path: 'announcements', lazy: page(() => import('../features/admin/AdminAnnouncementsPage'), 'AdminAnnouncementsPage') },
              { path: 'promotions', lazy: page(() => import('../features/admin/AdminPromotionsPage'), 'AdminPromotionsPage') },
              { path: 'maintenance', lazy: page(() => import('../features/admin/AdminMaintenancePage'), 'AdminMaintenancePage') },
              { path: 'settings', lazy: page(() => import('../features/admin/AdminSettingsPage'), 'AdminSettingsPage') },
            ],
          },
        ],
      },
      ...(import.meta.env.DEV ? [
            { path: '/dev/kit', lazy: page(() => import('../ui/DevKitPage'), 'DevKitPage') },
            { path: '/dev/boot', lazy: page(() => import('../features/boot/BootPage'), 'BootPage') },
          ] : []),
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
];
