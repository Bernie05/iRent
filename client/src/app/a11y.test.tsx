import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { routes } from './routes';
import { AppProviders } from './AppProviders';
import { makeStore } from './store';
import { createI18n } from '../i18n';
import { startAuthListener } from '../features/auth/authListener';
import { getSupabase } from '../lib/supabase';
import { MOCK_PASSWORD } from '../mocks/fixtures';
import { languageChanged } from '../features/ui/uiSlice';

/**
 * F24: axe over every screen of the real route table (layouts, guards, lazy chunks), rendered with the
 * MSW mocks. happy-dom has no layout or CSS, so colour contrast is NOT covered here: it was checked in a
 * real browser against the tokens in both themes (see the F24 report).
 */
const SCREENS: { who: 'public' | 'ana' | 'admin'; paths: string[] }[] = [
  { who: 'public', paths: ['/', '/login', '/forgot-password', '/set-password', '/no-such-page'] },
  { who: 'ana', paths: ['/portal', '/portal/pay', '/portal/history', '/portal/bills', '/portal/requests'] },
  {
    who: 'admin',
    paths: ['/admin', '/admin/beds', '/admin/renters', '/admin/rent', '/admin/payments', '/admin/bills', '/admin/inquiries', '/admin/announcements', '/admin/maintenance', '/admin/settings'],
  },
];

async function renderRoute(path: string, who: string, language: 'en' | 'fil') {
  const store = makeStore();
  store.dispatch(languageChanged(language));
  const i18n = createI18n(language);
  const stop = startAuthListener(getSupabase(), store.dispatch);
  if (who !== 'public') {
    const { error } = await getSupabase().auth.signInWithPassword({ email: `${who}@irent.test`, password: MOCK_PASSWORD });
    expect(error).toBeNull();
  }
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <AppProviders store={store} i18n={i18n}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  await screen.findByRole('heading', { level: 1 }, { timeout: 4000 });
  await waitFor(() => expect(document.querySelector('.animate-pulse, [aria-busy="true"]')).toBeNull(), { timeout: 4000 });
  return { ...view, stop };
}

describe.each(['en', 'fil'] as const)('axe on every screen (%s)', (language) => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
  });

  for (const { who, paths } of SCREENS) {
    it.each(paths)(`${who}: %s has no axe violations`, async (path) => {
      const { container, stop } = await renderRoute(path, who, language);
      // happy-dom ignores CSS, so the shells' responsive nav pairs (one is `display: none` in a browser) both
      // count as visible: landmark-unique is checked in the real-browser sweep instead. iframes: the map embed.
      const results = await axe(container, { iframes: false, rules: { 'landmark-unique': { enabled: false } } });
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      stop();
    });
  }
});
