import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../app/hooks';
import { selectLanguage } from '../features/ui/uiSlice';
import { formatDate, formatDateTime, formatDueDay, formatPeriod, formatPeso, formatPesoCompact, type DateStyle } from '../lib/format';
import type { Item } from '../types/api';

/** Formatters bound to the current UI language, plus the localised item label (D-12). */
export function useFormat() {
  const language = useAppSelector(selectLanguage);
  const { t } = useTranslation('domain');

  return useMemo(
    () => ({
      language,
      peso: (amount: number, whole = false) => formatPeso(amount, { whole, language }),
      pesoCompact: (amount: number) => formatPesoCompact(amount, { language }),
      date: (value: string | Date, style?: DateStyle) => formatDate(value, { language, style }),
      dateTime: (value: string | Date) => formatDateTime(value, { language }),
      period: (period: string) => formatPeriod(period, { language }),
      dueDay: (day: number) => formatDueDay(day, { language }),
      /** "October 2026 rent" / "September 2026 electricity bill". */
      item: (item: Item) =>
        item.type === 'charge'
          ? t('item.charge', { period: formatPeriod(item.period, { language }) })
          : t('item.bill_share', {
              period: formatPeriod(item.period, { language }),
              billType: t(`billType.${item.bill_type ?? 'electricity'}`),
            }),
    }),
    [language, t],
  );
}
