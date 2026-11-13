import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { api } from '@/api';
import { getTrip } from '@/api/endpoints/driver';
import { keys } from '@/features/account/queries';
import { RideMap } from '@/features/map/RideMap';
import { RatePassenger } from '@/features/trip/RatePassenger';
import { useTimings } from '@/features/trip/timings';
import { errorMessage } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { radius, space } from '@/theme/tokens';
import { Banner, Button, Card, HeroHeader, Icon, Row, Screen, Skeleton, Text } from '@/ui';


// One past trip: route, times, fare and payment, plus rating the passenger while the window is open and a way to
// report a problem about this trip.
export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const trip = useQuery({ queryKey: keys.trip(id), queryFn: () => getTrip(api(), id) });
  const d = trip.data;
  const now = useNow(60_000);
  const { ratingWindowMs } = useTimings();
  const canRate = d?.status === 'completed' && !!d.completed_at && Date.parse(d.completed_at) > now - ratingWindowMs;

  return (
    <Screen hero={<HeroHeader title={t('trips.detailTitle')} onBack={() => router.back()} overlap={space[6]} />}>
      {trip.error ? <Banner tone="danger" body={errorMessage(trip.error)} /> : null}
      {!d ? (
        <Card>
          <Skeleton height={160} />
          <Skeleton height={20} />
        </Card>
      ) : (
        <>
          <View style={styles.map}>
            <RideMap pickup={d.pickup} destination={d.destination} route interactive={false} fitPadding={{ top: 30, bottom: 30, left: 30, right: 30 }} style={StyleSheet.absoluteFill} />
          </View>
          <Card elevated>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="caption" color="textMuted">
                {t(`trip.status.${d.status}`, { defaultValue: d.status })}
              </Text>
              <Text variant="caption" color="textMuted">
                {d.completed_at ? new Date(d.completed_at).toLocaleString() : ''}
              </Text>
            </Row>
            <Stop icon="circle" text={d.pickup.label ?? t('offer.pin')} />
            <Stop icon="map-pin" text={d.destination.label ?? t('offer.pin')} />
            <Row style={{ justifyContent: 'space-between' }}>
              <Text>{t(`offer.pay.${d.payment_method}`, { defaultValue: d.payment_method })}</Text>
              <Text variant="heading" tabular>
                {formatMoney(d.final_fare ?? d.estimated_fare)}
              </Text>
            </Row>
            {d.passenger.first_name ? (
              <Text variant="caption" color="textMuted">
                {t('offer.passenger', { name: d.passenger.first_name })}
              </Text>
            ) : null}
          </Card>
          {canRate ? <RatePassenger tripId={d.id} /> : null}
          <Button label={t('trips.report')} variant="secondary" leftIcon="life-buoy" onPress={() => router.push({ pathname: '/support/new', params: { tripId: d.id } })} />
        </>
      )}
    </Screen>
  );
}

function Stop({ icon, text }: { icon: 'circle' | 'map-pin'; text: string }) {
  return (
    <Row style={{ gap: space[3] }}>
      <Icon name={icon} size={16} color={icon === 'circle' ? 'primary' : 'dangerText'} />
      <Text style={{ flex: 1 }} numberOfLines={2}>
        {text}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  map: { height: 180, borderRadius: radius.lg, overflow: 'hidden' },
});
