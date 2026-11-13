import { Redirect, Stack, usePathname } from 'expo-router';

import { useMe, useOnboarding } from '@/features/account/queries';
import { useSession } from '@/features/auth/session-store';
import { useDriverChannel, useDriving, useHeartbeat } from '@/features/driving/driving';
import { useTheme } from '@/theme/theme';

// Everything an approved driver uses. Anyone else goes back through the start-up gate; support stays reachable for
// any signed-in account so a suspended driver can still ask for help.
export default function AppLayout() {
  const { colors } = useTheme();
  const session = useSession((s) => s.status);
  const me = useMe();
  const onboarding = useOnboarding(me.data?.role === 'driver');
  const online = useDriving((s) => s.online);
  const pathname = usePathname();
  useDriverChannel(onboarding.data?.driver_id);
  useHeartbeat(online);

  if (session === 'signedOut') return <Redirect href="/welcome" />;
  const helpOnly = pathname.startsWith('/support') || pathname === '/account' || pathname === '/settings' || pathname === '/profile';
  const allowed = me.data?.role === 'driver' && me.data.status === 'active' && (!onboarding.data || onboarding.data.onboarding_status === 'approved');
  if (!helpOnly && me.data && !allowed) return <Redirect href="/" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
      <Stack.Screen name="offer" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'slide_from_bottom' }} />
      <Stack.Screen name="trip/[id]" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="trip-complete/[id]" options={{ gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
}
