import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from './icons';

/**
 * Client-side paging of an in-memory list (the API returns plain arrays, backend-task.md → no pagination).
 * `resetKey` is anything that identifies the current filter/search: when it changes, the list goes back to page 1.
 * The page is clamped to the last page, so deleting the last row of a page moves back one page.
 */
export function usePaged<T>(items: readonly T[], pageSize: number, resetKey: unknown = null) {
  const key = JSON.stringify(resetKey);
  const [state, setState] = useState({ page: 1, key });
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(state.key === key ? state.page : 1, pages);
  return {
    rows: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pages,
    total: items.length,
    pageSize,
    setPage: (p: number) => setState({ page: p, key }),
  };
}

/** Page numbers to show: all when ≤ 7, else first, last, current ±1 and gaps (null). */
export function pageList(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? [null, p] : [p]));
}

export type Pager = Pick<ReturnType<typeof usePaged>, 'page' | 'pages' | 'total' | 'pageSize' | 'setPage'>;

interface PaginationProps {
  pager: Pager;
  /** Names the navigation landmark, e.g. "Renters pages". */
  label: string;
  className?: string;
}

const BTN =
  'inline-flex h-control-md min-w-touch items-center justify-center rounded-full px-3 type-label-s tabular-nums transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40';

/** Prev / page numbers / Next and "Showing 11–20 of 37". Renders nothing when everything fits on one page. */
export function Pagination({ pager, label, className = '' }: PaginationProps) {
  const { t } = useTranslation();
  const { page, pages, total, pageSize, setPage: onChange } = pager;
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label={label} className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <p className="type-body-s text-secondary" aria-live="polite">
        {t('ui:pagination.showing', { from, to, total })}
      </p>
      <ul className="flex items-center gap-1">
        <li>
          <button type="button" className={`${BTN} text-primary hover:bg-muted`} onClick={() => onChange(page - 1)} disabled={page === 1} aria-label={t('ui:pagination.previous')}>
            <ChevronLeft className="h-icon-sm w-icon-sm" aria-hidden="true" />
          </button>
        </li>
        {pageList(page, pages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-tertiary">
              …
            </li>
          ) : (
            <li key={p} className={p === page ? '' : 'max-sm:hidden'}>
              <button
                type="button"
                className={`${BTN} ${p === page ? 'bg-primary text-on-brand' : 'text-primary hover:bg-muted'}`}
                aria-current={p === page ? 'page' : undefined}
                aria-label={t('ui:pagination.page', { page: p, pages })}
                onClick={() => onChange(p)}
              >
                {p}
              </button>
            </li>
          ),
        )}
        <li>
          <button type="button" className={`${BTN} text-primary hover:bg-muted`} onClick={() => onChange(page + 1)} disabled={page === pages} aria-label={t('ui:pagination.next')}>
            <ChevronRight className="h-icon-sm w-icon-sm" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
