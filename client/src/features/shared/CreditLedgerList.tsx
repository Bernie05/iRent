import { useTranslation } from 'react-i18next';
import { Pagination, usePaged } from '../../ui/Pagination';
import type { CreditLedger } from '../../types/api';
import { Table, TableCell, TableHeaderCell } from '../../ui/Table';
import { formatPeso, formatPeriod, formatDate } from '../../lib/format';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../ui/uiSlice';

/** R54/R55: renders a `CreditLedger` (balance + entries; a stacked table, D-31 / R79). Shared by the portal History page (F11) and the admin credit panel (F15). */
export function CreditLedgerList({ ledger }: { ledger: CreditLedger }) {
  const { t } = useTranslation();
  const language = useAppSelector(selectLanguage);
  const paged = usePaged(ledger.entries, 20);

  return (
    <div className="flex flex-col gap-3">
      <p className="type-body-s-strong text-secondary">
        {t('portal:history.creditBalance')}: {formatPeso(ledger.balance, { language })}
      </p>
      {ledger.entries.length === 0 ? (
        <p className="type-body-s text-tertiary">{t('admin:credit.empty')}</p>
      ) : (
        <Table stacked className="md:min-w-0">
          <caption className="sr-only">{t('portal:history.creditTitle')}</caption>
          <thead>
            <tr>
              <TableHeaderCell>{t('portal:history.col.date')}</TableHeaderCell>
              <TableHeaderCell>{t('portal:history.col.type')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('portal:history.col.amount')}</TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((entry) => {
              const itemText = entry.item
                ? entry.item.type === 'charge'
                  ? t('domain:item.charge', { period: formatPeriod(entry.item.period, { language }) })
                  : t('domain:item.bill_share', {
                      period: formatPeriod(entry.item.period, { language }),
                      billType: entry.item.bill_type ? t(`domain:billTypeTitle.${entry.item.bill_type}`) : '',
                    })
                : '';
              return (
                <tr key={entry.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(entry.created_at, { language })}</TableCell>
                  <TableCell>{t(`domain:ledger.${entry.entry_type}`, { item: itemText })}</TableCell>
                  <TableCell variant="strong" className={`whitespace-nowrap text-right ${entry.amount >= 0 ? 'text-success' : 'text-danger'}`}>
                    {entry.amount >= 0 ? '+' : '−'}
                    {formatPeso(Math.abs(entry.amount), { language })}
                  </TableCell>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('portal:history.creditTitle') })} />
    </div>
  );
}
