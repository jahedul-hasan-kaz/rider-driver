import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, intents } from '@/api';
import { onboardDriver } from '@/api/endpoints/driver';
import { keys } from '@/features/account/queries';
import { errorMessage } from '@/i18n';
import { track } from '@/lib/analytics';
import { space } from '@/theme/tokens';
import { Banner, Button, Card, HeroHeader, Screen, StepIndicator, Text, TextField } from '@/ui';

// Legal name (docs/spec/03-screens.md §7.3): only for new accounts. It must match the driving licence, because
// the review team checks it against the documents. Completing it creates the driver application.
export default function NameScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 120;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await intents().run('onboarding.driver', (key) => onboardDriver(api(), trimmed, key));
      track('onboarding_step_completed', { step: 'name' });
      await queryClient.invalidateQueries({ queryKey: keys.me });
      router.replace('/');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      hero={
        <HeroHeader title={t('driverAuth.nameTitle')} subtitle={t('driverAuth.nameSub')} overlap={space[6]}>
          <StepIndicator step={2} total={3} />
        </HeroHeader>
      }
      footer={<Button testID="name-continue" label={t('common.continue')} onPress={() => void submit()} loading={busy} disabled={!valid} />}>
      <Card elevated>
        <TextField
          testID="name-input"
          label={t('driverAuth.nameLabel')}
          placeholder={t('driverAuth.namePlaceholder')}
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          maxLength={120}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />
      </Card>
      <Text variant="caption" color="textMuted">
        {t('driverAuth.namePrivacy')}
      </Text>
      {error ? <Banner tone="danger" body={error} /> : null}
    </Screen>
  );
}
