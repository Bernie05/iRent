import { combineReducers, configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from '../services/api';
import { authReducer } from '../features/auth/authSlice';
import { LANGUAGE_STORAGE_KEY, languageChanged, themeChanged, uiReducer } from '../features/ui/uiSlice';
import { safeLocalStorage, storeTheme } from '../theme/theme';

export const rootReducer = combineReducers({
  auth: authReducer,
  ui: uiReducer,
  [api.reducerPath]: api.reducer,
});
export type RootState = ReturnType<typeof rootReducer>;

/** Persists the theme and language choices (R45, R46). */
function createPreferencesListener() {
  const listener = createListenerMiddleware();
  listener.startListening({
    actionCreator: themeChanged,
    effect: (action) => storeTheme(action.payload),
  });
  listener.startListening({
    actionCreator: languageChanged,
    effect: (action) => {
      try {
        safeLocalStorage()?.setItem(LANGUAGE_STORAGE_KEY, action.payload);
      } catch {
        // Storage unavailable: the choice still applies for this visit.
      }
    },
  });
  return listener;
}

export function makeStore(preloadedState?: Partial<RootState>) {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) =>
      getDefault().prepend(createPreferencesListener().middleware).concat(api.middleware),
  });
  setupListeners(store.dispatch);
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
