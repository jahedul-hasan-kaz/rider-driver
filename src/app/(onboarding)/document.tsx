import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { intents } from '@/api';
import { keys } from '@/features/account/queries';
import { pickFile, takePhoto, uploadDocument, UploadProblem, type PickedFile } from '@/features/documents/documents';
import { errorMessage } from '@/i18n';
import { track } from '@/lib/analytics';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';
import { Banner, Button, Card, HeroHeader, Icon, Screen, Text, TextField } from '@/ui';

import { isFutureDate } from './details';

const NEEDS_EXPIRY = new Set(['driving_licence', 'fitness_certificate', 'tax_token', 'insurance', 'route_permit']);

// Upload one document (docs/spec/03-screens.md §7.4): take a photo or pick a file, check it, then send it.
export default function DocumentScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { type = '', vehicleId } = useLocalSearchParams<{ type: string; vehicleId?: string }>();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsExpiry = NEEDS_EXPIRY.has(type);
  const ready = !!file && (!needsExpiry || isFutureDate(expiry));

  const choose = async (how: 'camera' | 'file') => {
    setError(null);
    try {
      setFile(await (how === 'camera' ? takePhoto() : pickFile()));
    } catch (failure) {
      if (failure instanceof UploadProblem) {
        if (failure.kind !== 'cancelled') setError(t(`documents.problem.${failure.kind}`));
      } else setError(errorMessage(failure));
    }
  };

  const send = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const intent = `document.${vehicleId ?? 'driver'}.${type}.${file.uri}`;
    try {
      const next = await intents().run(`${intent}.start`, (start) =>
        intents().run(`${intent}.complete`, (complete) =>
          uploadDocument(file, { documentType: type, vehicleId, expiresAt: needsExpiry ? expiry : undefined }, { start, complete }),
        ),
      );
      queryClient.setQueryData(keys.onboarding, next);
      track('document_uploaded', { type });
      router.back();
    } catch (failure) {
      setError(failure instanceof UploadProblem ? t(`documents.problem.${failure.kind}`) : errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      hero={<HeroHeader title={t(`documents.types.${type}`, { defaultValue: type })} subtitle={t('documents.hint')} onBack={() => router.back()} overlap={space[6]} />}
      footer={<Button testID="upload-document" label={t('documents.upload')} disabled={!ready} loading={busy} onPress={() => void send()} />}>
      <Card elevated>
        {file ? (
          file.type === 'application/pdf' ? (
            <View style={[styles.preview, { backgroundColor: colors.surfaceMuted }]}>
              <Icon name="file-text" size={40} color="textMuted" />
              <Text>{file.name}</Text>
            </View>
          ) : (
            <Image source={{ uri: file.uri }} style={styles.preview} contentFit="contain" accessibilityLabel={t('documents.preview')} />
          )
        ) : (
          <View style={[styles.preview, { backgroundColor: colors.surfaceMuted }]}>
            <Icon name="camera" size={40} color="textMuted" />
            <Text color="textMuted" align="center">
              {t('documents.tips')}
            </Text>
          </View>
        )}
        <View style={styles.buttons}>
          <Button label={t('documents.camera')} leftIcon="camera" variant="secondary" size="md" style={styles.flex} onPress={() => void choose('camera')} />
          <Button label={t('documents.file')} leftIcon="paperclip" variant="secondary" size="md" style={styles.flex} onPress={() => void choose('file')} />
        </View>
        {needsExpiry ? (
          <TextField
            label={t('documents.expiry')}
            placeholder="2030-12-31"
            value={expiry}
            onChangeText={setExpiry}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            error={expiry.length === 10 && !isFutureDate(expiry) ? t('details.expiryInvalid') : undefined}
          />
        ) : null}
      </Card>
      {error ? <Banner tone="danger" body={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { height: 220, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: space[2], padding: space[4] },
  buttons: { flexDirection: 'row', gap: space[2] },
  flex: { flex: 1 },
});
