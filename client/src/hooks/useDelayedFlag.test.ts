import { act, renderHook } from '@testing-library/react';
import { useDelayedFlag } from './useDelayedFlag';

describe('useDelayedFlag (F4, NFR5)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not flip to true before the delay', () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active), { initialProps: { active: true } });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(299));
    rerender({ active: true });
    expect(result.current).toBe(false);
  });

  it('flips to true after the delay while still active', () => {
    const { result } = renderHook(() => useDelayedFlag(true));
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(true);
  });

  it('resets to false as soon as active becomes false, even before the delay', () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active), { initialProps: { active: true } });
    act(() => vi.advanceTimersByTime(100));
    rerender({ active: false });
    expect(result.current).toBe(false);
  });
});
