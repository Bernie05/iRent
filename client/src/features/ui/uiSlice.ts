import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Language } from '../../types/api';
import { readStoredTheme, type ThemePreference } from '../../theme/theme';

export const LANGUAGE_STORAGE_KEY = 'irent.lang';

export interface UiState {
  /** R45: Light / Dark (System retired, D-16). Persisted in localStorage by the store listener. */
  theme: ThemePreference;
  /** R46: EN / FIL. Always 'en' at start (no switch in the UI since 2026-10-14). */
  language: Language;
}

export function loadUiState(): UiState {
  // ponytail: no language switch since 2026-10-14 (Bernie); the app always starts in English. FIL resources and the
  // languageChanged action stay, so a switch can come back without plumbing.
  return { theme: readStoredTheme(), language: 'en' };
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: loadUiState,
  reducers: {
    themeChanged(state, action: PayloadAction<ThemePreference>) {
      state.theme = action.payload;
    },
    languageChanged(state, action: PayloadAction<Language>) {
      state.language = action.payload;
    },
  },
});

export const { themeChanged, languageChanged } = uiSlice.actions;
export const uiReducer = uiSlice.reducer;

type WithUi = { ui: UiState };
export const selectThemePreference = (state: WithUi) => state.ui.theme;
export const selectLanguage = (state: WithUi) => state.ui.language;
