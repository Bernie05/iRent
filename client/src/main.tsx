import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import './index.css';
import { makeStore } from './app/store';
import { AppProviders } from './app/AppProviders';
import { routes } from './app/routes';
import { createI18n } from './i18n';
import { startAuthListener } from './features/auth/authListener';
import { getSupabase } from './lib/supabase';

async function bootstrap() {
  // With VITE_USE_MOCKS=true every API and Supabase Auth call is answered by MSW (frozen contract mocks).
  // `import.meta.env.VITE_USE_MOCKS` is replaced at build time, so with mocks off the branch and the MSW
  // chunk are removed from the bundle entirely.
  if (import.meta.env.VITE_USE_MOCKS === 'true') {
    const { startMockWorker } = await import('./mocks/browser');
    await startMockWorker();
  }

  const store = makeStore();
  const i18n = createI18n(store.getState().ui.language);
  startAuthListener(getSupabase(), store.dispatch);
  const router = createBrowserRouter(routes);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProviders store={store} i18n={i18n}>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
}

void bootstrap();
