import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Me } from '../../types/api';

export interface SessionInfo {
  userId: string;
  email: string | null;
}

export type AuthStatus =
  /** The stored session has not been read yet (app start). */
  | 'unknown'
  | 'authenticated'
  | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  session: SessionInfo | null;
  /** From `GET /me`; drives role routing (R12) and the profile language (R46). */
  profile: Me | null;
  /** Set when the last logout was caused by an unrecoverable 401 (R14). */
  sessionExpired: boolean;
}

const initialState: AuthState = {
  status: 'unknown',
  session: null,
  profile: null,
  sessionExpired: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionChanged(state, action: PayloadAction<SessionInfo | null>) {
      const session = action.payload;
      if (session && state.session?.userId !== session.userId) state.profile = null;
      state.session = session;
      state.status = session ? 'authenticated' : 'unauthenticated';
      if (session) state.sessionExpired = false;
      else state.profile = null;
    },
    profileLoaded(state, action: PayloadAction<Me>) {
      state.profile = action.payload;
    },
    loggedOut(state) {
      state.status = 'unauthenticated';
      state.session = null;
      state.profile = null;
    },
    sessionExpired(state) {
      state.status = 'unauthenticated';
      state.session = null;
      state.profile = null;
      state.sessionExpired = true;
    },
  },
});

export const { sessionChanged, profileLoaded, loggedOut, sessionExpired } = authSlice.actions;
export const authReducer = authSlice.reducer;

type WithAuth = { auth: AuthState };
export const selectAuthStatus = (state: WithAuth) => state.auth.status;
export const selectProfile = (state: WithAuth) => state.auth.profile;
export const selectRole = (state: WithAuth) => state.auth.profile?.role ?? null;
