import { Fragment, useState } from 'react';
import { Pagination, usePaged } from '../../../ui/Pagination';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../../hooks/useFormat';
import { manilaToday } from '../../../lib/time';
import type { ChargeRow } from '../../../types/api';
import { IconButton } from '../../../ui/IconButton';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { StatusBadge, type StatusTone } from '../../../ui/StatusBadge';
import { EMPTY_FRAME, Table, TableCell, TableHeaderCell } from '../../../ui/Table';
import { ChevronDown, Wallet } from '../../../ui/icons';
import { RecordPaymentModal, type RecordPaymentTarget } from '../../shared/RecordPaymentModal';
import { collectionOf, daysBetween, debtsByRenter, type NotPaidFilter, type RenterDebt } from './metrics';
import { Card } from './Card';

const FILTERS: NotPaidFilter[] = ['all', 'overdue', 'partial', 'unpaid'];
const TONE: Record<RenterDebt['status'], StatusTone> = { overdue: 'danger', partial: 'warning', unpaid: 'neutral' };
const STATUS_KEY = { overdue: 'overdue', partial: 'partial', unpaid: 'unpaid' } as const;

/**
 * Renters who haven't paid, one row per renter: total of their open items (arrears included), months unpaid, oldest due.
 * A row expands to its items; Record payment pays toward the total, oldest first.
 */
export function NotPaidCard({ items, periodLabel, className = '' }: { items: ChargeRow[]; periodLabel: string; className?: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [filter, setFilter] = useState<NotPaidFilter>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState<RecordPaymentTarget | null>(null);
  const today = manilaToday();
  const debts = debtsByRenter(items, filter);
  const paged = usePaged(debts, 10, filter);
  const owing = debtsByRenter(items, 'all').length;
  const toggle = (id: string) => setOpen((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)));

  return (
    <Card
      className={className}
      title={t('admin:dashboard.notPaid')}
      hint={t('admin:dashboard.notPaidAsOf', { period: periodLabel })}
      action={
        <SegmentedControl
          label={t('admin:dashboard.notPaidFilter')}
          options={FILTERS.map((v) => ({ value: v, label: t(`admin:dashboard.filter.${v}`) }))}
          value={filter}
          onChange={setFilter}
        />
      }
    >
      {items.length > 0 && (
        <p className="type-body-s text-secondary">
          <span className="type-amount-m text-primary">{f.peso(collectionOf(items).outstanding)}</span> {t('admin:dashboard.notPaidSummary', { count: owing })}
        </p>
      )}
      {items.length === 0 ? (
        <div className={EMPTY_FRAME}>
          <p className="type-body-s-strong text-primary">{t('admin:dashboard.allPaid')}</p>
        </div>
      ) : debts.length === 0 ? (
        <div className={EMPTY_FRAME}>
          <p className="type-body-s text-secondary">{t('admin:dashboard.noMatches')}</p>
        </div>
      ) : (
        <Table scrollLabel={t('admin:dashboard.scrollable', { name: t('admin:dashboard.notPaid') })}>
          <caption className="sr-only">{t('admin:dashboard.notPaid')}</caption>
          <thead>
            <tr>
              <TableHeaderCell>
                {t('admin:dashboard.col.renter')} / {t('admin:dashboard.col.bed')}
              </TableHeaderCell>
              <TableHeaderCell className="text-right">{t('admin:dashboard.col.total')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('admin:dashboard.col.months')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:dashboard.col.oldest')}</TableHeaderCell>
              <TableHeaderCell>{t('admin:dashboard.col.status')}</TableHeaderCell>
              <TableHeaderCell>
                <span className="sr-only">{t('admin:rent.recordPayment')}</span>
              </TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((d) => {
              const expanded = open.has(d.renter.id);
              const panelId = `notpaid-${d.renter.id}`;
              const late = daysBetween(d.oldestDue, today);
              return (
                <Fragment key={d.renter.id}>
                  <tr>
                    <TableCell variant="strong" className={expanded ? 'border-b-0' : ''}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        aria-label={t('admin:dashboard.showItems', { name: d.renter.full_name })}
                        onClick={() => toggle(d.renter.id)}
                        className="-my-2 -ml-2 flex min-h-touch items-center gap-2 rounded-md px-2 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <ChevronDown className={`h-icon-sm w-icon-sm shrink-0 text-tertiary transition-transform duration-fast ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                        <span>
                          {d.renter.full_name}
                          <span className="block type-caption font-normal text-tertiary">{d.bed ?? '—'}</span>
                        </span>
                      </button>
                    </TableCell>
                    <TableCell variant="strong" className={`text-right ${expanded ? 'border-b-0' : ''}`}>
                      {f.peso(d.total)}
                    </TableCell>
                    <TableCell className={`text-right ${expanded ? 'border-b-0' : ''}`}>{t('admin:dashboard.monthsCount', { count: d.months })}</TableCell>
                    <TableCell className={expanded ? 'border-b-0' : ''}>
                      {f.date(d.oldestDue)}
                      <span className="block type-caption text-tertiary">{late > 0 ? t('admin:dashboard.daysOverdue', { count: late }) : t('admin:dashboard.notYetDue')}</span>
                    </TableCell>
                    <TableCell variant="badge" className={expanded ? 'border-b-0' : ''}>
                      <StatusBadge tone={TONE[d.status]}>{t(`domain:itemStatus.${STATUS_KEY[d.status]}`)}</StatusBadge>
                    </TableCell>
                    <TableCell variant="actions" className={expanded ? 'border-b-0' : ''}>
                      <IconButton
                        label={t('admin:dashboard.payTotal', { name: d.renter.full_name })}
                        icon={<Wallet className="h-icon-sm w-icon-sm" aria-hidden="true" />}
                        onClick={() => setPaying({ item: d.items[0].item, remaining: d.total, renterName: d.renter.full_name, openItems: d.items })}
                      />
                    </TableCell>
                  </tr>
                  <tr id={panelId} hidden={!expanded}>
                    <td colSpan={6} className="border-b bg-page px-3 pb-3 pt-1">
                      <ul className="flex flex-col divide-y divide-default pl-8">
                        {d.items.map((i) => (
                          <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 type-body-s">
                            <span className="text-primary">
                              {f.item(i.item)}
                              <span className="ml-2 type-caption text-tertiary">{f.date(i.due_date)}</span>
                            </span>
                            <span className="flex items-center gap-3">
                              <StatusBadge tone={i.is_overdue ? 'danger' : i.status === 'partial' ? 'warning' : 'neutral'}>
                                {t(`domain:itemStatus.${i.is_overdue ? 'overdue' : i.status}`)}
                              </StatusBadge>
                              <span className="w-24 text-right type-body-s-strong tabular-nums text-primary">{f.peso(i.remaining)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('admin:dashboard.notPaid') })} />
      <RecordPaymentModal target={paying} onClose={() => setPaying(null)} />
    </Card>
  );
}
