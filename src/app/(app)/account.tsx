import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useMe, useOnboarding } from '@/features/account/queries';
import { space } from '@/theme/tokens';
import { Avatar, Card, HeroHeader, ListRow, Row, Screen, Text } from '@/ui';

// Account menu (docs/spec/03-screens.md §7.12).
export default function Account() {
  const { t } = useTranslation();
  const me = useMe();
  const onboarding = useOnboarding(me.data?.role === 'driver');
  const vehicle = onboarding.data?.vehicles[0];
  const approved = onboarding.data?.onboarding_status === 'approved';

  return (
    <Screen hero={<HeroHeader title={t('account.title')} onBack={() => router.back()} overlap={space[6]} />}>
      <Card elevated>
        <Row style={{ gap: space[3] }}>
          <Avatar name={me.data?.full_name} label={me.data?.full_name ?? ''} size={52} />
          <Text variant="heading" style={{ flex: 1 }}>
            {me.data?.full_name ?? ''}
          </Text>
        </Row>
        {vehicle ? (
          <Text color="textMuted">
            {vehicle.make} {vehicle.model} · {vehicle.registration_number}
          </Text>
        ) : null}
      </Card>
      <Card padded={false} style={{ padding: space[2] }}>
        {approved ? <ListRow icon="dollar-sign" title={t('account.earnings')} onPress={() => router.push('/earnings')} /> : null}
        {approved ? <ListRow icon="map" title={t('account.trips')} onPress={() => router.push('/trips')} /> : null}
        {approved ? <ListRow icon="credit-card" title={t('account.wallet')} onPress={() => router.push('/wallet')} /> : null}
        <ListRow icon="file-text" title={t('account.documents')} onPress={() => router.push('/onboarding')} />
        <ListRow icon="shield" title={t('account.safety')} onPress={() => router.push('/safety')} />
        <ListRow icon="life-buoy" title={t('account.support')} onPress={() => router.push('/support')} />
        <ListRow icon="user" title={t('account.profile')} onPress={() => router.push('/profile')} />
        <ListRow icon="settings" title={t('account.settings')} onPress={() => router.push('/settings')} />
      </Card>
    </Screen>
  );
}
