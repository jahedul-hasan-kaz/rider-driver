import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { readyToDrive, useDriverPermissions } from '@/features/permissions/permissions';
import { track } from '@/lib/analytics';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';
import { Button, Icon, Text, type IconName } from '@/ui';

// Permissions gate (docs/spec/03-screens.md §7.5). One row per permission, each with its own button, in the order
// the OS allows them (background location only after foreground). Re-checks itself on return from Settings.
export default function PermissionsGate() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const p = useDriverPermissions();
  const ready = readyToDrive(p);

  useEffect(() => {
    if (ready) router.replace('/');
  }, [ready]);

  const askLocation = async () => {
    const next = await p.requestLocation();
    track('permission_result', { kind: 'location', granted: next.location, precise: next.precise });
    if (!next.location || !next.precise) void Linking.openSettings();
    if (!next.servicesOn && Platform.OS === 'android') await Location.enableNetworkProviderAsync().catch(() => undefined);
  };

  const askBackground = async () => {
    const next = await p.requestBackground();
    track('permission_result', { kind: 'background', granted: next.background });
    if (!next.background) void Linking.openSettings();
  };

  const askNotifications = async () => {
    const next = await p.requestNotifications();
    track('permission_result', { kind: 'notifications', granted: next.notifications });
    if (!next.notifications) void Linking.openSettings();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.hero, paddingTop: insets.top + space[8], paddingBottom: insets.bottom + space[4] }]}>
      <Text variant="title" color="onHero" accessibilityRole="header">
        {t('permissions.title')}
      </Text>
      <Text color="onHeroMuted">{t('permissions.body')}</Text>

      <View style={styles.rows}>
        <Step
          icon="map-pin"
          title={t('permissions.location')}
          body={t('permissions.locationBody')}
          done={p.location && p.precise && p.servicesOn}
          action={t('permissions.allow')}
          onPress={() => void askLocation()}
        />
        <Step
          icon="navigation"
          title={t(Platform.OS === 'ios' ? 'permissions.backgroundIos' : 'permissions.backgroundAndroid')}
          body={t('permissions.backgroundBody')}
          done={p.background}
          disabled={!p.location}
          action={t('permissions.allow')}
          onPress={() => void askBackground()}
        />
        <Step
          icon="bell"
          title={t('permissions.notifications')}
          body={t('permissions.notificationsBody')}
          done={p.notifications}
          action={t('permissions.allow')}
          onPress={() => void askNotifications()}
          optional
        />
      </View>

      <View style={styles.footer}>
        {Platform.OS === 'android' ? (
          <Text variant="caption" color="onHeroMuted">
            {t('permissions.battery')}
          </Text>
        ) : null}
        <Button label={t('permissions.openSettings')} variant="ghostOnHero" onPress={() => void Linking.openSettings()} />
        <Button label={t('permissions.account')} variant="ghostOnHero" size="md" onPress={() => router.push('/account')} />
      </View>
    </View>
  );
}

function Step({
  icon,
  title,
  body,
  done,
  action,
  onPress,
  disabled,
  optional,
}: {
  icon: IconName;
  title: string;
  body: string;
  done: boolean;
  action: string;
  onPress: () => void;
  disabled?: boolean;
  optional?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surfaceSelected }]}>
      <View style={[styles.icon, { backgroundColor: done ? colors.successSurface : colors.hero }]}>
        <Icon name={done ? 'check' : icon} size={20} color={done ? 'successText' : 'onHero'} />
      </View>
      <View style={styles.rowText}>
        <Text variant="bodyStrong" color="onHero">
          {title}
          {optional ? ` · ${t('permissions.recommended')}` : ''}
        </Text>
        <Text variant="caption" color="onHeroMuted">
          {body}
        </Text>
      </View>
      {done ? null : <Button label={action} size="md" variant="accent" disabled={disabled} onPress={onPress} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space[5], gap: space[4] },
  rows: { gap: space[3], marginTop: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.lg },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  footer: { marginTop: 'auto', gap: space[2] },
});
