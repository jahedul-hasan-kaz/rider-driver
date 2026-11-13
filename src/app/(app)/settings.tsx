import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { signOut } from '@/features/auth/auth';
import { goOffline, useDriving } from '@/features/driving/driving';
import { currentLanguage, setLanguage, type Language } from '@/i18n';
import { env } from '@/lib/env';
import { prefs } from '@/lib/storage';
import { space } from '@/theme/tokens';
import { useTheme, type ThemeMode } from '@/theme/theme';
import { Button, Card, HeroHeader, ListRow, Row, Screen, SegmentedControl, Text } from '@/ui';

// Settings (docs/spec/03-screens.md §7.12). Offer, trip, account and money notifications can't be turned off: a
// driver who misses them loses work. Only support replies are optional.
export default function Settings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const online = useDriving((s) => s.online);
  const [lang, setLang] = useState<Language>(currentLanguage());
  const [supportOn, setSupportOn] = useState(prefs.getString('notify.support') !== 'off');
  const [voice, setVoice] = useState(prefs.getString('offer.voice') !== 'off');
  const [leaving, setLeaving] = useState(false);
  const open = (url: string) => url && void WebBrowser.openBrowserAsync(url);

  return (
    <Screen hero={<HeroHeader title={t('settings.title')} onBack={() => router.back()} overlap={space[6]} />}>
      <Card elevated>
        <Text variant="label">{t('profile.language')}</Text>
        <SegmentedControl<Language>
          accessibilityLabel={t('profile.language')}
          segments={[
            { value: 'en', label: 'English' },
            { value: 'bn', label: 'বাংলা' },
          ]}
          value={lang}
          onChange={(next) => {
            setLang(next);
            void setLanguage(next);
          }}
        />
        <Text variant="label">{t('settings.theme')}</Text>
        <SegmentedControl<ThemeMode>
          accessibilityLabel={t('settings.theme')}
          segments={[
            { value: 'dark', label: t('settings.dark') },
            { value: 'light', label: t('settings.light') },
            { value: 'system', label: t('settings.system') },
          ]}
          value={theme.mode}
          onChange={theme.setMode}
        />
      </Card>

      <Card>
        <Toggle
          title={t('driverSettings.voice')}
          body={t('driverSettings.voiceBody')}
          value={voice}
          onChange={(v) => {
            setVoice(v);
            prefs.set('offer.voice', v ? 'on' : 'off');
          }}
        />
        <Toggle
          title={t('driverSettings.support')}
          body={t('driverSettings.supportBody')}
          value={supportOn}
          onChange={(v) => {
            setSupportOn(v);
            prefs.set('notify.support', v ? 'on' : 'off');
          }}
        />
        <Text variant="caption" color="textMuted">
          {t('driverSettings.always')}
        </Text>
      </Card>

      <Card padded={false} style={{ padding: space[2] }}>
        <ListRow icon="file-text" title={t('welcome.terms')} onPress={() => open(env().EXPO_PUBLIC_TERMS_URL)} />
        <ListRow icon="lock" title={t('welcome.privacy')} onPress={() => open(env().EXPO_PUBLIC_PRIVACY_URL)} />
        <ListRow icon="info" title={t('settings.version')} value={`${Constants.expoConfig?.version ?? ''} · ${env().EXPO_PUBLIC_APP_ENV}`} />
      </Card>

      <Button
        label={t('settings.signOut')}
        variant="secondary"
        leftIcon="log-out"
        loading={leaving}
        onPress={async () => {
          setLeaving(true);
          if (online) await goOffline().catch(() => undefined);
          await signOut().catch(() => undefined);
          router.replace('/welcome');
        }}
      />
      <Button label={t('settings.delete')} variant="ghost" onPress={() => router.push('/delete-account')} />
    </Screen>
  );
}

function Toggle({ title, body, value, onChange }: { title: string; body: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', minHeight: 52 }}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color="textMuted">
          {body}
        </Text>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} />
    </Row>
  );
}
