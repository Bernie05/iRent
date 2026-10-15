import { useLayoutEffect, useRef, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';

/**
 * Inner vertical scroll from xl (dashboard cards): the frame fills the card's remaining height whatever the content and
 * scrolls when it overflows. Natural height below xl, so phones never get a nested scroll.
 */
export const SCROLL_FRAME =
  'scroll-subtle xl:min-h-0 xl:flex-1 xl:overflow-y-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/**
 * Scrolls horizontally below 1024px (SC-45) instead of clipping controls. With `scrollLabel` the frame also scrolls
 * vertically inside a fixed-height card from xl: it is a focusable, labelled region and the header row sticks.
 */
/** The same filling frame for an empty or loading state: bordered, content centred. */
export const EMPTY_FRAME = 'flex flex-col items-center justify-center rounded-lg border bg-surface px-4 py-6 text-center xl:min-h-0 xl:flex-1';

/** White list surface for ListRows (renter portal): rows inset, the last row loses its divider. */
export const LIST_PANEL = 'flex flex-col rounded-lg border bg-surface px-4 shadow-elevation-1 [&>*:last-child]:border-b-0';

/**
 * R79 stacked mode, below md: the header row is visually hidden and every body row becomes a card of "Label  value" lines
 * (the label is the column header, copied into `data-label` and shown with ::before). A cell spanning columns (a details
 * row) gets no label. Same markup and semantics; no horizontal page scroll at 320 px.
 */
const STACKED = [
  'max-md:min-w-0 max-md:[&_thead]:sr-only max-md:[&_tbody]:block',
  'max-md:[&_tbody_tr]:block max-md:[&_tbody_tr]:border-b max-md:[&_tbody_tr]:px-4 max-md:[&_tbody_tr]:py-2 max-md:[&_tbody_tr:last-child]:border-b-0',
  'max-md:[&_td]:flex max-md:[&_td]:items-start max-md:[&_td]:justify-between max-md:[&_td]:gap-4 max-md:[&_td]:border-b-0 max-md:[&_td]:px-0 max-md:[&_td]:py-1.5 max-md:[&_td]:text-right',
  'max-md:[&_td[data-label]]:before:shrink-0 max-md:[&_td[data-label]]:before:text-left max-md:[&_td[data-label]]:before:font-semibold max-md:[&_td[data-label]]:before:text-secondary max-md:[&_td[data-label]]:before:content-[attr(data-label)]',
].join(' ');

export function Table({ children, className = '', scrollLabel, stacked }: { children: ReactNode; className?: string; scrollLabel?: string; stacked?: boolean }) {
  const ref = useRef<HTMLTableElement>(null);
  // Stacked rows lose their table display below md, which some screen readers read as plain text: give every part its
  // role back explicitly, and label each cell with its column header. Runs after every render (rows change).
  useLayoutEffect(() => {
    const table = ref.current;
    if (!stacked || !table) return;
    const heads = Array.from(table.querySelectorAll('thead th'), (th) => th.textContent?.trim() ?? '');
    table.setAttribute('role', 'table');
    table.querySelectorAll('thead, tbody').forEach((g) => g.setAttribute('role', 'rowgroup'));
    table.querySelectorAll('tr').forEach((tr) => tr.setAttribute('role', 'row'));
    table.querySelectorAll('thead th').forEach((th) => th.setAttribute('role', 'columnheader'));
    table.querySelectorAll<HTMLTableCellElement>('tbody td').forEach((td) => {
      td.setAttribute('role', 'cell');
      const label = td.colSpan > 1 ? '' : heads[td.cellIndex];
      if (label) td.setAttribute('data-label', label);
      else td.removeAttribute('data-label');
    });
  });
  return (
    <div
      className={`relative w-full overflow-x-auto rounded-lg border bg-surface ${scrollLabel ? `${SCROLL_FRAME} [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10` : ''}`}
      {...(scrollLabel ? { tabIndex: 0, role: 'region', 'aria-label': scrollLabel } : {})}
    >
      <table ref={ref} className={`w-full min-w-[640px] border-collapse tabular-nums [&_tbody_tr:last-child>td]:border-b-0 ${stacked ? STACKED : ''} ${className}`}>
        {children}
      </table>
    </div>
  );
}

export function TableHeaderCell({ children, className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={`whitespace-nowrap border-b bg-muted px-3 py-2.5 text-left type-overline text-secondary ${className}`} {...rest}>
      {children}
    </th>
  );
}

type CellVariant = 'text' | 'strong' | 'muted' | 'badge' | 'actions';

const CELL_CLASSES: Record<CellVariant, string> = {
  text: 'type-body-s text-primary',
  strong: 'type-body-s-strong text-primary',
  muted: 'type-body-s text-tertiary',
  badge: 'whitespace-nowrap',
  actions: 'text-right [&_a]:whitespace-nowrap [&_button]:whitespace-nowrap',
};

export function TableCell({
  variant = 'text',
  children,
  className = '',
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { variant?: CellVariant }) {
  return (
    <td className={`border-b px-3 py-3 align-middle ${CELL_CLASSES[variant]} ${className}`} {...rest}>
      {children}
    </td>
  );
}

interface ListRowProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/** Mobile row equivalent of a table row. */
export function ListRow({ title, subtitle, trailing, onClick, className = '' }: ListRowProps) {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex min-h-touch w-full items-center justify-between gap-3 border-b py-3 text-left transition-colors ${
        onClick ? 'transition-colors duration-fast hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus' : ''
      } ${className}`}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="type-body-m-strong text-primary">{title}</span>
        {subtitle && <span className="type-body-s text-secondary">{subtitle}</span>}
      </span>
      {trailing}
    </Component>
  );
}
