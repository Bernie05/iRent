import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination, pageList, usePaged } from './Pagination';
import { renderWithApp } from '../test/utils';

const items = Array.from({ length: 37 }, (_, i) => i + 1);

describe('usePaged', () => {
  it('slices pages, resets to page 1 when the filter key changes, and clamps after deletes', () => {
    const { result, rerender } = renderHook(({ list, key }) => usePaged(list, 10, key), { initialProps: { list: items, key: 'all' } });
    expect([result.current.page, result.current.pages, result.current.rows]).toEqual([1, 4, items.slice(0, 10)]);

    act(() => result.current.setPage(4));
    expect(result.current.rows).toEqual([31, 32, 33, 34, 35, 36, 37]);

    rerender({ list: items.slice(0, 30), key: 'all' }); // the last page's rows were deleted
    expect([result.current.page, result.current.pages]).toEqual([3, 3]);

    rerender({ list: items, key: 'overdue' }); // new filter → page 1
    expect(result.current.page).toBe(1);
  });

  it('page list keeps first, last and neighbours with gaps', () => {
    expect(pageList(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageList(5, 12)).toEqual([1, null, 4, 5, 6, null, 12]);
    expect(pageList(1, 12)).toEqual([1, 2, null, 12]);
  });
});

function Demo() {
  const paged = usePaged(items, 10);
  return (
    <>
      <ul>{paged.rows.map((n) => <li key={n}>Row {n}</li>)}</ul>
      <Pagination pager={paged} label="Demo pages" />
    </>
  );
}

describe('Pagination', () => {
  it('is a labelled nav with Prev/Next, aria-current and a "Showing" status', async () => {
    const user = userEvent.setup();
    renderWithApp(<Demo />);
    const nav = screen.getByRole('navigation', { name: 'Demo pages' });
    expect(nav).toHaveTextContent('Showing 1–10 of 37');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page 1 of 4' })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(nav).toHaveTextContent('Showing 11–20 of 37');
    expect(screen.getByText('Row 11')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Page 4 of 4' }));
    expect(nav).toHaveTextContent('Showing 31–37 of 37');
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('renders nothing when everything fits on one page', () => {
    const { container } = render(<Pagination pager={{ page: 1, pages: 1, total: 3, pageSize: 10, setPage: () => {} }} label="x" />);
    expect(container).toBeEmptyDOMElement();
  });
});
