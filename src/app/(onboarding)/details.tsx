import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, intents } from '@/api';
import { updateDetails } from '@/api/endpoints/driver';
import { keys } from '@/features/account/queries';
import { errorMessage } from '@/i18n';
import { track } from '@/lib/analytics';
import { space } from '@/theme/tokens';
import { Banner, Button, Card, HeroHeader, Screen, Text, TextField } from '@/ui';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isFutureDate(value: string, today = new Date().toISOString().slice(0, 10)): boolean {
  return DATE.test(value) && !Number.isNaN(Date.parse(value)) && value > today;
}

// Driving licence details (docs/spec/03-screens.md §7.4). The full number is never shown back; only the masked one.
export default function Details() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = number.trim().length >= 5 && isFutureDate(expiry);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await intents().run('driver.details', (key) => updateDetails(api(), { licenceNumber: number, licenceExpiry: expiry }, key));
      track('onboarding_step_completed', { step: 'details' });
      await queryClient.invalidateQueries({ queryKey: keys.onboarding });
      router.back();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      hero={<HeroHeader title={t('onboarding.licence')} onBack={() => router.back()} overlap={space[6]} />}
      footer={<Button label={t('common.save')} disabled={!valid} loading={busy} onPress={() => void save()} />}>
      <Card elevated>
        <TextField label={t('details.number')} value={number} onChangeText={setNumber} autoCapitalize="characters" autoCorrect={false} maxLength={30} />
        <TextField
          label={t('details.expiry')}
          placeholder="2030-12-31"
          value={expiry}
          onChangeText={setExpiry}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          error={expiry.length === 10 && !isFutureDate(expiry) ? t('details.expiryInvalid') : undefined}
        />
      </Card>
      <Text variant="caption" color="textMuted">
        {t('details.privacy')}
      </Text>
      {error ? <Banner tone="danger" body={error} /> : null}
    </Screen>
  );
}
