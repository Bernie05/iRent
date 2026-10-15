import { act, renderHook } from '@testing-library/react';
import { useReducedMotion } from './useReducedMotion';
import { installMatchMedia } from '../test/utils';

const QUERY = '(prefers-reduced-motion: reduce)';

describe('useReducedMotion (NFR4)', () => {
  it('reads the OS setting and follows changes live', () => {
    const media = installMatchMedia({ [QUERY]: false });
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => media.set(QUERY, true));
    expect(result.current).toBe(true);

    unmount();
    expect(media.listenerCount(QUERY)).toBe(0);
  });
});
