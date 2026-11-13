import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, intents } from '@/api';
import { confirmCash, getTrip } from '@/api/endpoints/driver';
import { keys, refreshAfterTripChange } from '@/features/account/queries';
import { RatePassenger } from '@/features/trip/RatePassenger';
import { errorMessage } from '@/i18n';
import { track } from '@/lib/analytics';
import { formatMoney } from '@/lib/format';
import { space } from '@/theme/tokens';
import { Banner, Button, Card, FareBreakdown, HeroHeader, Screen, Text, TextField, type FareLine } from '@/ui';

// Trip finished (docs/spec/03-screens.md §7.9, mockup D6): the final fare, then for cash trips "I collected ৳X".
// A different amount can be entered when the passenger paid less or more; the difference goes to review.
export default function TripComplete() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const trip = useQuery({ queryKey: keys.trip(id), queryFn: () => getTrip(api(), id) });
  const [other, setOther] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = trip.data;
  const fare = data?.final_fare ?? data?.estimated_fare ?? '0.00';
  const cash = data?.payment_method === 'cash';
  const otherValid = other === null || /^\d{1,6}(\.\d{1,2})?$/.test(other.trim());

  const collect = async () => {
    setBusy(true);
    setError(null);
    try {
      await intents().run(`cash.${id}`, (key) => confirmCash(api(), id, other === null ? undefined : other.trim(), key));
      track('cash_confirmed', { differs: other !== null });
      setDone(true);
      refreshAfterTripChange(queryClient, id);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const lines: FareLine[] = Object.entries(data?.breakdown ?? {})
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([k, v]) => ({ label: t(`fare.lines.${k}`, { defaultValue: k.replace(/_/g, ' ') }), amount: String(v) }));

  return (
    <Screen
      hero={<HeroHeader title={t('complete.title')} subtitle={t('complete.subtitle')} overlap={space[6]} />}
      footer={
        cash && !done ? (
          <>
            <Button testID="cash-collected" label={t('complete.collected', { amount: formatMoney(other ?? fare) })} loading={busy} disabled={!otherValid} onPress={() => void collect()} />
            {other === null ? <Button label={t('complete.differentAmount')} variant="ghost" size="md" onPress={() => setOther('')} /> : null}
          </>
        ) : (
          <Button testID="back-home" label={t('complete.backHome')} onPress={() => router.replace('/home')} />
        )
      }>
      <Card elevated>
        <Text variant="caption" color="textMuted">
          {t(cash ? 'complete.collect' : 'complete.fare')}
        </Text>
        <Text variant="display" tabular>
          {formatMoney(fare)}
        </Text>
        {lines.length > 0 ? <FareBreakdown lines={[...lines, { label: t('complete.total'), amount: fare, kind: 'total' }]} /> : null}
      </Card>
      {other !== null && !done ? (
        <Card>
          <TextField label={t('complete.amountLabel')} value={other} onChangeText={setOther} keyboardType="decimal-pad" autoFocus error={otherValid ? undefined : t('complete.amountInvalid')} />
          <Text variant="caption" color="textMuted">
            {t('complete.amountNote')}
          </Text>
        </Card>
      ) : null}
      {done ? <Banner tone="success" body={t('complete.thanks')} /> : null}
      {data && (!cash || done) ? <RatePassenger tripId={data.id} /> : null}
      {error ? <Banner tone="danger" body={error} /> : null}
    </Screen>
  );
}
