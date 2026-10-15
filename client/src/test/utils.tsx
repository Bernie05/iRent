import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppProviders } from '../app/AppProviders';
import { makeStore, type RootState } from '../app/store';
import { createI18n } from '../i18n';

/** Renders with the real store, i18n and theme/language controllers, inside a MemoryRouter. */
export function renderWithApp(ui: ReactElement, options: { route?: string; preloadedState?: Partial<RootState> } = {}) {
  const store = makeStore(options.preloadedState);
  const i18n = createI18n(store.getState().ui.language);
  const result = render(
    <AppProviders store={store} i18n={i18n}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
  return { ...result, store, i18n };
}

/** Multipart test bodies: happy-dom's global File/FormData round-trip correctly through fetch → MSW. */
export function nodeFile(bytes: number, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

export function nodeFormData(fields: Record<string, string | File>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

/** A controllable matchMedia for theme and reduced-motion tests. */
export function installMatchMedia(initial: Record<string, boolean> = {}) {
  const state = { ...initial };
  const listeners = new Map<string, Set<(e: MediaQueryListEvent) => void>>();
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return Boolean(state[query]);
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        if (!listeners.has(query)) listeners.set(query, new Set());
        listeners.get(query)!.add(cb);
      },
      removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.get(query)?.delete(cb),
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  return {
    set(query: string, matches: boolean) {
      state[query] = matches;
      listeners.get(query)?.forEach((cb) => cb({ matches, media: query } as MediaQueryListEvent));
    },
    listenerCount: (query: string) => listeners.get(query)?.size ?? 0,
  };
}
