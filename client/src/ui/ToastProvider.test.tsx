import { act, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastProvider';
import { renderWithApp } from '../test/utils';

function Harness() {
  const { show } = useToast();
  return (
    <div>
      <button onClick={() => show('success', 'Saved')}>Success</button>
      <button onClick={() => show('error', 'Failed')}>Error</button>
    </div>
  );
}

describe('ToastProvider (F4)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('auto-dismisses a success toast after 5s', () => {
    const { getByText, queryByText } = renderWithApp(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(getByText('Success'));
    expect(getByText('Saved')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    expect(queryByText('Saved')).not.toBeInTheDocument();
  });

  it('keeps an error toast until dismissed', () => {
    const { getByText, queryByText, getByRole } = renderWithApp(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(getByText('Error'));
    act(() => vi.advanceTimersByTime(10000));
    expect(getByText('Failed')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: 'Dismiss' }));
    expect(queryByText('Failed')).not.toBeInTheDocument();
  });
});
