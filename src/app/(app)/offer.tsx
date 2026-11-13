import { useQueryClient } from '@tanstack/react-query';
import { useAudioPlayer } from 'expo-audio';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { api, intents, isApiError } from '@/api';
import { acceptOffer, rejectOffer } from '@/api/endpoints/driver';
import { keys, useCurrentOffer } from '@/features/account/queries';
import { setTrackingMode } from '@/features/driving/driving';
import { useTimings } from '@/features/trip/timings';
import { currentLanguage, errorMessage } from '@/i18n';
import { track } from '@/lib/analytics';
import { formatDistance, formatDuration, formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { prefs } from '@/lib/storage';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';
import { Banner, Button, CountdownRing, Icon, Row, Text } from '@/ui';


// Offer card (docs/spec/03-screens.md §7.7, mockup D2). Big, readable at a glance on a bike mount: earning, pickup
// distance, trip distance, payment. The countdown comes from the server's expires_at; when it runs out the card
// closes on its own. Accept is one tap; decline asks nothing.
export default function OfferScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const offer = useCurrentOffer(true, 3_000);
  const { offerSeconds } = useTimings();
  const o = offer.data;
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const announced = useRef<string | null>(null);
  const player = useAudioPlayer(require('@/../assets/sounds/offer.wav'));
  const lang = currentLanguage();

  useEffect(() => {
    if (!o || announced.current === o.offer_id) return;
    announced.current = o.offer_id;
    track('offer_shown');
    haptic('offer');
    player.seekTo(0);
    player.play();
    if (prefs.getString('offer.voice') !== 'off') Speech.speak(t('offer.spoken', { amount: o.estimated_driver_earning ?? o.estimated_fare }), { language: lang === 'bn' ? 'bn-BD' : 'en-US' });
  }, [o, player, t, lang]);

  // Gone (expired, withdrawn, taken): close.
  useEffect(() => {
    if (offer.isFetched && !o && !busy) router.back();
  }, [offer.isFetched, o, busy]);

  if (!o) return <View style={{ flex: 1, backgroundColor: colors.hero }} />;
  const endsAt = Date.parse(o.expires_at);

  const accept = async () => {
    setBusy('accept');
    setError(null);
    try {
      const trip = await intents().run(`offer.accept.${o.offer_id}`, (key) => acceptOffer(api(), o.offer_id, key));
      track('offer_accepted');
      haptic('success');
      Speech.stop();
      queryClient.setQueryData(keys.offer, null);
      queryClient.setQueryData(keys.currentTrip, trip);
      void setTrackingMode('trip', { title: t('tracking.title'), body: t('tracking.tripBody') });
      router.replace({ pathname: '/trip/[id]', params: { id: trip.id } });
    } catch (failure) {
      // Someone else got it, or it expired between the tap and the server.
      setError(isApiError(failure) && failure.status === 409 ? t('offer.gone') : errorMessage(failure));
      void queryClient.invalidateQueries({ queryKey: keys.offer });
      setBusy(null);
    }
  };

  const decline = async () => {
    setBusy('decline');
    Speech.stop();
    try {
      await intents().run(`offer.reject.${o.offer_id}`, (key) => rejectOffer(api(), o.offer_id, undefined, key));
      track('offer_declined');
    } catch {
      // It expires on its own anyway.
    }
    queryClient.setQueryData(keys.offer, null);
    router.back();
  };

  const expired = () => {
    track('offer_expired');
    Speech.stop();
    queryClient.setQueryData(keys.offer, null);
    router.back();
  };

  const earning = o.estimated_driver_earning ?? o.estimated_fare;

  return (
    <View style={[styles.screen, { backgroundColor: colors.hero, paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[4] }]}>
      <Row style={styles.head}>
        <Text variant="label" color="onHeroMuted">
          {t('offer.title')}
        </Text>
        <CountdownRing endsAt={endsAt} totalSeconds={offerSeconds} size={64} onExpire={expired} />
      </Row>

      <View style={styles.money}>
        <Text variant="caption" color="onHeroMuted">
          {t('offer.youEarn')}
        </Text>
        <Text variant="display" color="onHero" tabular accessibilityLabel={t('offer.youEarnA11y', { amount: formatMoney(earning) })}>
          {formatMoney(earning)}
        </Text>
        <Text color="onHeroMuted">{t(`offer.pay.${o.payment_method}`, { defaultValue: o.payment_method })}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Stop icon="circle" label={t('offer.pickup')} title={o.pickup.label ?? t('offer.pin')} meta={o.pickup_distance_m != null ? `${formatDistance(o.pickup_distance_m, lang)} · ${o.pickup_eta_s != null ? formatDuration(o.pickup_eta_s, lang) : ''}` : undefined} />
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <Stop icon="map-pin" label={t('offer.dropoff')} title={o.destination.label ?? t('offer.pin')} meta={o.distance_m != null ? `${formatDistance(o.distance_m, lang)}${o.duration_s != null ? ` · ${formatDuration(o.duration_s, lang)}` : ''}` : undefined} />
        {o.passenger_first_name ? (
          <Text variant="caption" color="textMuted">
            {t('offer.passenger', { name: o.passenger_first_name })}
          </Text>
        ) : null}
      </View>

      {error ? <Banner tone="danger" body={error} /> : null}

      <View style={styles.actions}>
        <Button testID="accept-offer" label={t('offer.accept')} variant="accent" size="lg" loading={busy === 'accept'} disabled={!!busy} onPress={() => void accept()} />
        <Button testID="decline-offer" label={t('offer.decline')} variant="ghostOnHero" loading={busy === 'decline'} disabled={!!busy} onPress={() => void decline()} />
      </View>
    </View>
  );
}

function Stop({ icon, label, title, meta }: { icon: 'circle' | 'map-pin'; label: string; title: string; meta?: string }) {
  return (
    <Row style={{ alignItems: 'flex-start', gap: space[3] }}>
      <Icon name={icon} size={18} color={icon === 'circle' ? 'primary' : 'dangerText'} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text variant="bodyStrong" numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text variant="caption" color="textMuted">
            {meta}
          </Text>
        ) : null}
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space[5], gap: space[5] },
  head: { justifyContent: 'space-between' },
  money: { alignItems: 'center', gap: space[1] },
  card: { borderRadius: radius.lg, padding: space[4], gap: space[3] },
  line: { height: 1 },
  actions: { marginTop: 'auto', gap: space[2] },
});
