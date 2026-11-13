import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { api, intents, isApiErrorCode } from '@/api';
import { cancelTrip, completeTrip, getTrip, markArrived, markArriving, startTrip, type Trip } from '@/api/endpoints/driver';
import { triggerSos } from '@/api/endpoints/care';
import { keys, refreshAfterTripChange } from '@/features/account/queries';
import { setTrackingMode } from '@/features/driving/driving';
import { useLastFix } from '@/features/location/location';
import { RideMap } from '@/features/map/RideMap';
import { canCancelNoShow, navigationTarget, navigationUrl, nextStep } from '@/features/trip/stage';
import { useTimings } from '@/features/trip/timings';
import { errorMessage } from '@/i18n';
import { track } from '@/lib/analytics';
import { formatMoney } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/use-now';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';
import { Banner, Button, Icon, OfflineBar, OtpInput, Row, Sheet, SosButton, Text, useToast, type SheetHandle } from '@/ui';

const CANCEL_REASONS = ['no_show', 'passenger_asked', 'unsafe', 'vehicle_problem', 'other'] as const;

// Trip in progress (docs/spec/03-screens.md §7.8, mockups D3–D5). One big button for the next step; navigation in
// the driver's own maps app; PIN check before starting; SOS always one hold away. Survives restarts: the start-up
// gate always comes back here while the trip is active.
export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fix = useLastFix((s) => s.fix);
  const now = useNow(5_000);
  const { noShowWaitS } = useTimings();
  const trip = useQuery({ queryKey: keys.trip(id), queryFn: () => getTrip(api(), id), refetchInterval: 10_000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const farSheet = useRef<SheetHandle>(null);
  const pinSheet = useRef<SheetHandle>(null);
  const cancelSheet = useRef<SheetHandle>(null);

  const data = trip.data;
  const step = data ? nextStep(data.status) : null;

  // Finished or cancelled: leave the trip screen.
  useEffect(() => {
    if (!data || step !== 'done') return;
    void setTrackingMode('idle', { title: t('tracking.title'), body: t('tracking.body') });
    refreshAfterTripChange(queryClient, data.id);
    if (data.status === 'completed') router.replace({ pathname: '/trip-complete/[id]', params: { id: data.id } });
    else {
      toast({ message: t('trip.cancelledToast'), tone: 'neutral' });
      router.replace('/home');
    }
  }, [data, step, queryClient, t, toast]);

  const apply = (next: Trip) => {
    queryClient.setQueryData(keys.trip(id), next);
    queryClient.setQueryData(keys.currentTrip, next);
    track('trip_status_changed', { status: next.status });
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const arrived = (override: boolean) =>
    run(async () => {
      try {
        apply(await intents().run(`trip.arrived.${id}.${override}`, (key) => markArrived(api(), id, override, key)));
        haptic('success');
        farSheet.current?.dismiss();
      } catch (failure) {
        if (!override && isApiErrorCode(failure, 'TOO_FAR_FROM_PICKUP')) return farSheet.current?.present();
        throw failure;
      }
    });

  const start = (code?: string) =>
    run(async () => {
      setPinError(null);
      const result = await intents().run(`trip.start.${id}.${code ?? ''}`, (key) => startTrip(api(), id, code, key));
      if ('pin_error' in result) {
        if (result.pin_error === 'PIN_REQUIRED') return pinSheet.current?.present();
        setPin('');
        setPinError(t(`trip.pin.${result.pin_error}`, { count: result.attempts_left }));
        return;
      }
      pinSheet.current?.dismiss();
      apply(result);
      haptic('success');
    });

  const primary = () => {
    if (!data) return;
    if (step === 'arriving') return run(async () => apply(await intents().run(`trip.arriving.${id}`, (key) => markArriving(api(), id, key))));
    if (step === 'arrived') return arrived(false);
    if (step === 'start') return start();
    if (step === 'complete')
      return run(async () => {
        const done = await intents().run(`trip.complete.${id}`, (key) => completeTrip(api(), id, key));
        track('trip_completed');
        apply(done);
      });
  };

  const cancel = (reason: (typeof CANCEL_REASONS)[number]) =>
    run(async () => {
      cancelSheet.current?.dismiss();
      apply(await intents().run(`trip.cancel.${id}`, (key) => cancelTrip(api(), id, reason, key)));
      track('trip_cancelled', { reason });
    });

  const sos = async () => {
    haptic('sos');
    track('sos_triggered');
    try {
      await triggerSos(api(), id);
      toast({ message: t('sos.sent'), tone: 'success' });
    } catch (failure) {
      toast({ message: errorMessage(failure), tone: 'danger' });
    }
    router.push('/safety');
  };

  if (!data) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.hero, alignItems: 'center', justifyContent: 'center' }]}>
        {trip.error ? <Banner tone="danger" body={errorMessage(trip.error)} /> : <Text color="onHero">{t('common.loading')}</Text>}
      </View>
    );
  }

  const target = navigationTarget(data);
  const noShow = data.status === 'arrived' && canCancelNoShow(data.arrived_at, now, noShowWaitS);
  const fare = data.final_fare ?? data.estimated_fare;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <RideMap
        pickup={data.pickup}
        destination={data.destination}
        driver={fix ? { lat: fix.lat, lng: fix.lng } : null}
        route
        fitPadding={{ top: insets.top + 80, bottom: 360, left: 40, right: 40 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ paddingTop: insets.top + space[2], paddingHorizontal: space[4], gap: space[2] }}>
        <OfflineBar />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={[styles.pill, { backgroundColor: colors.surface }]}>
            <Text variant="bodyStrong">{t(`trip.status.${data.status}`, { defaultValue: data.status })}</Text>
          </View>
          <SosButton size={56} onTrigger={() => void sos()} testID="sos" />
        </Row>
      </View>

      <View style={[styles.panel, { backgroundColor: colors.surface, paddingBottom: insets.bottom + space[4] }]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="textMuted">
              {t(data.status === 'in_progress' ? 'trip.dropoff' : 'trip.pickup')}
            </Text>
            <Text variant="heading" numberOfLines={2}>
              {target.label ?? t('offer.pin')}
            </Text>
            {target.note ? (
              <Text variant="caption" color="textMuted">
                {target.note}
              </Text>
            ) : null}
          </View>
          <Button
            label={t('trip.navigate')}
            leftIcon="navigation"
            size="md"
            variant="secondary"
            onPress={() => void Linking.openURL(navigationUrl(target, Platform.OS)).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`))}
          />
        </Row>
        <Row style={{ gap: space[3] }}>
          <Icon name="user" size={18} color="textMuted" />
          <Text style={{ flex: 1 }}>{data.passenger.first_name ?? t('trip.passenger')}</Text>
          <Text variant="bodyStrong" tabular>
            {formatMoney(fare)} · {t(`offer.pay.${data.payment_method}`, { defaultValue: data.payment_method })}
          </Text>
        </Row>

        {error ? <Banner tone="danger" body={error} /> : null}

        {step !== 'done' ? (
          <Button testID="trip-next" label={t(`trip.next.${step}`)} variant="accent" size="lg" loading={busy} onPress={() => void primary()} />
        ) : null}
        {data.status !== 'in_progress' ? (
          <Button label={t(noShow ? 'trip.noShow' : 'trip.cancel')} variant="ghost" size="md" onPress={() => (noShow ? void cancel('no_show') : cancelSheet.current?.present())} />
        ) : null}
      </View>

      <Sheet ref={farSheet}>
        <Text variant="title">{t('trip.far.title')}</Text>
        <Text color="textMuted">{t('trip.far.body')}</Text>
        <Button label={t('trip.far.confirm')} loading={busy} onPress={() => void arrived(true)} />
        <Button label={t('common.cancel')} variant="secondary" onPress={() => farSheet.current?.dismiss()} />
      </Sheet>

      <Sheet ref={pinSheet} onDismiss={() => setPin('')}>
        <Text variant="title">{t('trip.pin.title')}</Text>
        <Text color="textMuted">{t('trip.pin.body')}</Text>
        <OtpInput length={4} value={pin} onChange={setPin} onComplete={(code) => void start(code)} error={!!pinError} />
        {pinError ? <Text color="dangerText">{pinError}</Text> : null}
        <Button label={t('trip.next.start')} loading={busy} disabled={pin.length !== 4} onPress={() => void start(pin)} />
      </Sheet>

      <Sheet ref={cancelSheet}>
        <Text variant="title">{t('trip.cancelTitle')}</Text>
        <Text color="textMuted">{t('trip.cancelBody')}</Text>
        {CANCEL_REASONS.filter((r) => r !== 'no_show').map((reason) => (
          <Button key={reason} label={t(`trip.reasons.${reason}`)} variant="secondary" onPress={() => void cancel(reason)} />
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pill: { paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.pill },
  panel: { marginTop: 'auto', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space[4], gap: space[3] },
});
