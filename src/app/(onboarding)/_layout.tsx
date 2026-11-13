import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/features/auth/session-store';
import { useTheme } from '@/theme/theme';

// The driver application: checklist, details, vehicle and documents. Approved drivers also come back here to
// replace an expiring document.
export default function OnboardingLayout() {
  const { colors } = useTheme();
  const session = useSession((s) => s.status);
  if (session === 'signedOut') return <Redirect href="/welcome" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }} />;
}
