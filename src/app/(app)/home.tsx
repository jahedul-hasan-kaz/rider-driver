import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { isTripActive } from '@/api/endpoints/driver';
import { useCurrentOffer, useCurrentTrip, useMe, useOnboarding, useWallet } from '@/features/account/queries';
import { goOffline, goOnline, syncOffline, useDriving } from '@/features/driving/driving';
import { useLastFix } from '@/features/location/location';
import { RideMap } from '@/features/map/RideMap';
import { DHAKA } from '@/features/map/types';
import { errorMessage } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';
import { Avatar, Banner, Button, Card, OfflineBar, Row, Text, useToast } from '@/ui';

// Home (docs/spec/03-screens.md §7.6, mockup D1): the map, today's earnings and one big online/offline button.
// While online it waits for offers; an offer opens the full-screen offer card.
export default function Home() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const me = useMe();
  const onboarding = useOnboarding();
  const wallet = useWallet();
  const online = useDriving((s) => s.online);
  const fix = useLastFix((s) => s.fix);
  const offer = useCurrentOffer(online, online ? 5_000 : false);
  const trip = useCurrentTrip();
  const [busy, setBusy] = useState(false);

  // The server says offline (forced offline, document expired): follow it.
  const serverAvailability = onboarding.data?.availability;
  useEffect(() => {
    if (serverAvailability === 'offline' && online) void syncOffline();
  }, [serverAvailability, online]);

  useEffect(() => {
    if (offer.data) router.push('/offer');
  }, [offer.data?.offer_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (trip.data && isTripActive(trip.data)) router.replace({ pathname: '/trip/[id]', params: { id: trip.data.id } });
  }, [trip.data]);

  const toggle = async () => {
    setBusy(true);
    try {
      if (online) await goOffline();
      else await goOnline({ title: t('tracking.title'), body: t('tracking.body') });
      haptic('success');
    } catch (failure) {
      toast({ message: errorMessage(failure), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const owes = wallet.data?.owes_platform;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <RideMap center={fix ?? DHAKA} driver={fix ? { lat: fix.lat, lng: fix.lng } : null} style={StyleSheet.absoluteFill} />
      <View style={[styles.top, { paddingTop: insets.top + space[2] }]}>
        <OfflineBar />
        <Row style={styles.topRow}>
          <View style={[styles.status, { backgroundColor: online ? colors.successSurface : colors.surface }]}>
            <View style={[styles.dot, { backgroundColor: online ? colors.successText : colors.textMuted }]} />
            <Text variant="bodyStrong" color={online ? 'successText' : 'text'}>
              {t(online ? 'home.online' : 'home.offline')}
            </Text>
          </View>
          <Avatar name={me.data?.full_name} label={t('home.account')} onPress={() => router.push('/account')} />
        </Row>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space[4] }]}>
        {owes ? <Banner tone="warning" title={t('home.owesTitle')} body={t('home.owesBody')} /> : null}
        <Card elevated>
          <Row style={styles.earnings}>
            <View>
              <Text variant="caption" color="textMuted">
                {t('home.today')}
              </Text>
              <Text variant="title" tabular>
                {wallet.data ? formatMoney(wallet.data.earned_today) : '—'}
              </Text>
            </View>
            <Button label={t('home.earnings')} variant="ghost" size="md" onPress={() => router.push('/earnings')} />
          </Row>
          <Text color="textMuted">{t(online ? 'home.waiting' : 'home.goOnlineHint')}</Text>
          <Button
            testID="toggle-online"
            label={t(online ? 'home.goOffline' : 'home.goOnline')}
            variant={online ? 'secondary' : 'accent'}
            leftIcon="power"
            loading={busy}
            onPress={() => void toggle()}
            style={{ borderRadius: radius.pill }}
          />
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { paddingHorizontal: space[4], gap: space[2] },
  topRow: { justifyContent: 'space-between' },
  status: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.pill },
  dot: { width: 10, height: 10, borderRadius: 5 },
  bottom: { marginTop: 'auto', paddingHorizontal: space[4], gap: space[3] },
  earnings: { justifyContent: 'space-between' },
});
