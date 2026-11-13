import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { isAuthFailure } from '@/api/errors';
import { isTripActive } from '@/api/endpoints/driver';
import { useCurrentTrip, useMe, useOnboarding } from '@/features/account/queries';
import { useSession } from '@/features/auth/session-store';
import { readyToDrive, useDriverPermissions } from '@/features/permissions/permissions';
import { errorMessage } from '@/i18n';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';
import { Button, MapPin, Text } from '@/ui';

// Start-up gate (docs/spec/04-integration.md §8.5): session → account → driver application → trip in progress →
// permissions → home. A trip in progress always wins, so a restart mid-trip lands straight back on it.
export default function Gate() {
  const { t } = useTranslation();
  const session = useSession((s) => s.status);
  const me = useMe();
  const driver = me.data?.role === 'driver' && me.data.status === 'active';
  const onboarding = useOnboarding(driver);
  const approved = onboarding.data?.onboarding_status === 'approved';
  const trip = useCurrentTrip(driver && approved);
  const permissions = useDriverPermissions();

  if (session === 'signedOut') return <Redirect href="/welcome" />;

  const failure = me.error ?? onboarding.error;
  if (failure && !isAuthFailure(failure)) {
    return (
      <Splash>
        <Text color="onHero" align="center">
          {errorMessage(failure)}
        </Text>
        <Button
          label={t('common.retry')}
          variant="accent"
          onPress={() => {
            void me.refetch();
            void onboarding.refetch();
          }}
        />
      </Splash>
    );
  }
  if (session === 'loading' || !me.data) return <Splash />;

  if (me.data.status !== 'active') return <Redirect href={{ pathname: '/blocked', params: { reason: me.data.status } }} />;
  if (me.data.role === 'user') return <Redirect href="/name" />;
  if (me.data.role !== 'driver') return <Redirect href={{ pathname: '/blocked', params: { reason: 'role' } }} />;

  if (!onboarding.data) return <Splash />;
  if (onboarding.data.onboarding_status === 'suspended') return <Redirect href={{ pathname: '/blocked', params: { reason: 'suspended' } }} />;
  if (!approved) return <Redirect href="/onboarding" />;

  if (trip.isPending || !permissions.checked) return <Splash />;
  if (trip.data && isTripActive(trip.data)) return <Redirect href={{ pathname: '/trip/[id]', params: { id: trip.data.id } }} />;
  if (!readyToDrive(permissions)) return <Redirect href="/permissions" />;
  return <Redirect href="/home" />;
}

function Splash({ children }: { children?: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.splash, { backgroundColor: colors.hero }]}>{children ?? <MapPin pulsing />}</View>;
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6], gap: space[4] },
});
