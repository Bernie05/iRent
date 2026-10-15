import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../app/hooks';
import { selectProfile } from '../../features/auth/authSlice';
import { useGetMyAnnouncementsQuery, useGetMyBalanceQuery, useGetMyChargesQuery, useGetMyBillsQuery, useGetMyGreetingQuery } from '../../services/endpoints/renter';
import { BirthdayGreeting } from './BirthdayGreeting';
import { AnnouncementsFeed } from './AnnouncementsFeed';
import { MyBedSection } from './MyBedSection';
import { OpenItemsList } from './OpenItemsList';
import { RentCountdown } from './RentCountdown';
import { BalanceCard } from '../../ui/BalanceCard';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { EmptyState } from '../../ui/EmptyState';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';

/** R17: Portal Home, in order: announcements, balance (with the R76 rent countdown), My Bed, open items. Proposed: the birthday greeting on top, on that day only. */
export function PortalHomePage() {
  const { t } = useTranslation();
  const profile = useAppSelector(selectProfile);
  const announcements = useGetMyAnnouncementsQuery();
  const balance = useGetMyBalanceQuery();
  const charges = useGetMyChargesQuery();
  const bills = useGetMyBillsQuery();
  // Optional extra: a failed greeting never blocks Home, so it is left out of `error`.
  const greeting = useGetMyGreetingQuery();

  const isLoading = announcements.isLoading || balance.isLoading || charges.isLoading || bills.isLoading || greeting.isLoading;
  const showSkeleton = useDelayedFlag(isLoading);
  const error = announcements.error || balance.error || charges.error || bills.error;

  function retry() {
    if (announcements.error) void announcements.refetch();
    if (balance.error) void balance.refetch();
    if (charges.error) void charges.refetch();
    if (bills.error) void bills.refetch();
  }

  if (error && !isLoading) {
    return <ErrorState message={t('portal:home.errorLoading')} onRetry={retry} />;
  }

  if (isLoading) {
    return showSkeleton ? (
      <div className="flex flex-col gap-4">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="row" />
        <Skeleton variant="row" />
      </div>
    ) : null;
  }

  const items = announcements.data?.items ?? [];
  const unreadCount = announcements.data?.unread_count ?? 0;
  const openCharges = (charges.data ?? []).filter((c) => c.status !== 'paid');
  const openShares = (bills.data ?? []).filter((s) => s.status !== 'paid');
  const isEmpty = items.length === 0 && openCharges.length === 0 && openShares.length === 0 && !profile?.tenancy && !greeting.data;

  if (isEmpty) {
    return <EmptyState title={t('portal:home.empty')} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-h1 text-primary max-sm:type-h2">{t('nav:home')}</h1>
      {greeting.data && <BirthdayGreeting greeting={greeting.data} />}
      <AnnouncementsFeed items={items} unreadCount={unreadCount} />
      {(balance.data || profile?.tenancy) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {balance.data && (
            <BalanceCard
              status={balance.data.status}
              outstanding={balance.data.outstanding}
              nextDueDate={balance.data.next_due_date ?? undefined}
              creditBalance={balance.data.credit_balance}
              className={profile?.tenancy ? '' : 'sm:col-span-2'}
            >
              <RentCountdown tenancy={profile?.tenancy} charges={charges.data ?? []} />
            </BalanceCard>
          )}
          {profile?.tenancy && <MyBedSection tenancy={profile.tenancy} />}
        </div>
      )}
      <section aria-labelledby="items-title">
        <h2 id="items-title" className="type-h3 text-primary">
          {t('portal:home.itemsTitle')}
        </h2>
        <div className="mt-3">
          <OpenItemsList charges={openCharges} shares={openShares} />
        </div>
      </section>
    </div>
  );
}
