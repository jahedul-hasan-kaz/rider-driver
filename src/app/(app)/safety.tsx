import { router } from 'expo-router';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useClientConfig } from '@/features/account/queries';
import { space } from '@/theme/tokens';
import { Button, Card, HeroHeader, NumberedRow, Screen, Text } from '@/ui';

// Safety (docs/spec/03-screens.md §7.13): emergency numbers and what SOS does. SOS itself is on the trip screen.
export default function Safety() {
  const { t } = useTranslation();
  const config = useClientConfig();
  const support = (config.data as { support_phone?: string } | undefined)?.support_phone;

  return (
    <Screen hero={<HeroHeader title={t('safety.title')} onBack={() => router.back()} overlap={space[6]} />}>
      <Card elevated>
        <Text variant="heading">{t('driverSafety.sosTitle')}</Text>
        <NumberedRow n={1} text={t('driverSafety.sos1')} />
        <NumberedRow n={2} text={t('driverSafety.sos2')} />
        <NumberedRow n={3} text={t('driverSafety.sos3')} />
      </Card>
      <Button label={t('driverSafety.call999')} variant="danger" leftIcon="phone" onPress={() => void Linking.openURL('tel:999')} />
      {support ? <Button label={t('driverSafety.callSupport')} variant="secondary" leftIcon="headphones" onPress={() => void Linking.openURL(`tel:${support}`)} /> : null}
      <Button label={t('account.support')} variant="ghost" onPress={() => router.push('/support')} />
    </Screen>
  );
}
