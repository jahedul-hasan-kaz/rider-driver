import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { api } from '@/api';
import { listTrips, type TripSummary } from '@/api/endpoints/driver';
import { keys } from '@/features/account/queries';
import { errorMessage } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { space } from '@/theme/tokens';
import { Banner, Button, Card, EmptyState, HeroHeader, ListRow, Screen, Skeleton, Text } from '@/ui';

// Trip history (docs/spec/03-screens.md §7.10): completed and cancelled trips, newest first (GET /driver/trips).
export default function Trips() {
  const { t } = useTranslation();
  const list = useInfiniteQuery({
    queryKey: keys.trips,
    queryFn: ({ pageParam }) => listTrips(api(), pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <Screen hero={<HeroHeader title={t('trips.title')} subtitle={t('trips.subtitle')} onBack={() => router.back()} overlap={space[6]} />}>
      {list.error ? <Banner tone="danger" body={errorMessage(list.error)} /> : null}
      {list.isPending ? (
        <Card>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState icon="map" title={t('trips.emptyTitle')} body={t('trips.emptyBody')} />
      ) : (
        <Card padded={false} style={{ padding: space[2] }} testID="trip-list">
          {rows.map((trip) => (
            <TripRow key={trip.id} trip={trip} />
          ))}
        </Card>
      )}
      {list.hasNextPage ? <Button label={t('earnings.more')} variant="ghost" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /> : null}
    </Screen>
  );
}

function TripRow({ trip }: { trip: TripSummary }) {
  const { t } = useTranslation();
  const completed = trip.status === 'completed';
  const when = trip.completed_at ?? trip.cancelled_at ?? trip.accepted_at;
  const route = [trip.pickup_label, trip.destination_label].filter(Boolean).join(' → ');
  return (
    <ListRow
      icon={completed ? 'navigation' : 'x-circle'}
      title={route || new Date(when).toLocaleString()}
      subtitle={`${new Date(when).toLocaleString()}${completed && trip.net_earning ? ` · ${t('trips.earned', { net: formatMoney(trip.net_earning) })}` : ''}`}
      value={
        <Text variant="caption" color={completed ? 'textMuted' : 'dangerText'}>
          {completed ? formatMoney(trip.final_fare ?? trip.estimated_fare) : t(`trip.status.${trip.status}`, { defaultValue: t('trip.status.cancelled') })}
        </Text>
      }
      onPress={() => router.push({ pathname: '/trips/[id]', params: { id: trip.id } })}
    />
  );
}
