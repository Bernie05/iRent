/**
 * Lets non-React code (the RTK Query base query) navigate.
 * The router registers its `navigate` on mount (see app/NavigationBridge.tsx); before that, or outside
 * the router, it falls back to a full page load.
 */
export type Navigate = (to: string, options?: { replace?: boolean }) => void;

const fallback: Navigate = (to, options) => {
  if (options?.replace) window.location.replace(to);
  else window.location.assign(to);
};

let current: Navigate = fallback;

export function registerNavigator(navigate: Navigate): () => void {
  current = navigate;
  return () => {
    if (current === navigate) current = fallback;
  };
}

export function navigateTo(to: string, options?: { replace?: boolean }): void {
  current(to, options);
}

export const SESSION_EXPIRED_PATH = '/login?reason=session_expired';
