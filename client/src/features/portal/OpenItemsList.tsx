import { useTranslation } from 'react-i18next';
import type { ChargeRow, ShareRow } from '../../types/api';
import { LIST_PANEL, ListRow } from '../../ui/Table';
import { StatusBadge } from '../../ui/StatusBadge';
import { formatPeso, formatDate, formatPeriod } from '../../lib/format';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../../features/ui/uiSlice';

type OpenItem = (ChargeRow | ShareRow) & { key: string };

const STATUS_TONE = { unpaid: 'neutral', partial: 'warning', paid: 'success', overdue: 'danger' } as const;

/** R17.4: combined open charges and bill shares, each with a status badge (never colour alone). */
export function OpenItemsList({ charges, shares }: { charges: ChargeRow[]; shares: ShareRow[] }) {
  const { t } = useTranslation();
  const language = useAppSelector(selectLanguage);

  const items: OpenItem[] = [
    ...charges.map((c) => ({ ...c, key: `charge-${c.id}` })),
    ...shares.map((s) => ({ ...s, key: `share-${s.id}` })),
  ].sort((a, b) => a.due_date.localeCompare(b.due_date));

  if (items.length === 0) {
    return <p className={`${LIST_PANEL} py-6 text-center type-body-s text-secondary`}>{t('portal:home.itemsEmpty')}</p>;
  }

  return (
    <div className={LIST_PANEL}>
      {items.map((item) => {
        const statusKey = item.is_overdue ? 'overdue' : item.status;
        const period = formatPeriod(item.item.period, { language });
        const itemLabel =
          item.item.type === 'charge'
            ? t('domain:item.charge', { period })
            : t('domain:item.bill_share', { period, billType: item.item.bill_type ? t(`domain:billTypeTitle.${item.item.bill_type}`) : '' });
        return (
          <ListRow
            key={item.key}
            title={itemLabel}
            subtitle={t('portal:home.remaining', { amount: formatPeso(item.remaining, { language }) })}
            trailing={
              <span className="flex flex-col items-end gap-1">
                <StatusBadge tone={STATUS_TONE[statusKey]}>{t(`domain:itemStatus.${statusKey}`)}</StatusBadge>
                <span className="type-caption text-tertiary">{formatDate(item.due_date, { language })}</span>
              </span>
            }
          />
        );
      })}
    </div>
  );
}

