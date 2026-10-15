import { useEffect, useState } from 'react';

/**
 * True only once `active` has stayed true for `delayMs` (default 300ms, NFR5). Used to avoid flashing a
 * skeleton on fast loads: `useDelayedFlag(isLoading)` instead of `isLoading` directly.
 */
export function useDelayedFlag(active: boolean, delayMs = 300): boolean {
  const [flag, setFlag] = useState(false);

  useEffect(() => {
    if (!active) {
      setFlag(false);
      return;
    }
    const timer = setTimeout(() => setFlag(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return flag;
}
