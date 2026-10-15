import { useTranslation } from 'react-i18next';
import type { MeTenancy } from '../../types/api';
import { formatPeso, formatDate } from '../../lib/format';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../../features/ui/uiSlice';
import { Card } from '../admin/dashboard/Card';

/** R17.3: bed label, room, monthly rate, move-in date. Hidden entirely for a moved-out renter (OQ-22 = A). */
export function MyBedSection({ tenancy }: { tenancy: MeTenancy }) {
  const { t } = useTranslation();
  const language = useAppSelector(selectLanguage);
  return (
    <Card title={t('portal:home.myBedTitle')} className="max-sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="type-body-m-strong text-primary">
            {tenancy.bed.room} – {tenancy.bed.label}
          </p>
          <p className="type-body-s text-secondary">{t(`domain:bunkType.${tenancy.bed.bunk_type}`)}</p>
        </div>
        <p className="type-amount-m tabular-nums text-primary">{formatPeso(tenancy.bed.monthly_rate, { whole: true, language })}</p>
      </div>
      <p className="mt-auto border-t pt-3 type-caption text-tertiary">{t('portal:home.moveInDate', { date: formatDate(tenancy.move_in, { language }) })}</p>
    </Card>
  );
}
