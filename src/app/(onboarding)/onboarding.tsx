import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { api, intents } from '@/api';
import { submitApplication, type DocumentSlot, type Onboarding } from '@/api/endpoints/driver';
import { keys, useOnboarding } from '@/features/account/queries';
import { errorMessage } from '@/i18n';
import { track } from '@/lib/analytics';
import { space } from '@/theme/tokens';
import { Banner, Button, Card, HeroHeader, ListRow, ProgressBar, Screen, Skeleton, Text, type BannerTone } from '@/ui';

// Application checklist (docs/spec/03-screens.md §7.4): details, a vehicle and every required document, then submit.
// After submitting it shows the review status; a rejected application says why and lets the driver fix it.
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const state = useOnboarding();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = state.data;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await intents().run('application.submit', (key) => submitApplication(api(), key));
      queryClient.setQueryData(keys.onboarding, next);
      track('application_submitted');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const status = data?.onboarding_status ?? 'draft';
  const editable = status === 'draft' || status === 'rejected' || status === 'approved';
  const vehicle = data?.vehicles[0];

  return (
    <Screen
      hero={<HeroHeader title={t('onboarding.title')} subtitle={t('onboarding.subtitle')} onBack={status === 'approved' ? () => router.back() : undefined} overlap={space[6]} />}
      footer={
        data && (status === 'draft' || status === 'rejected') ? (
          <Button testID="submit-application" label={t('onboarding.submit')} disabled={!data.can_submit} loading={busy} onPress={() => void submit()} />
        ) : status === 'approved' ? (
          <Button label={t('onboarding.done')} onPress={() => router.replace('/')} />
        ) : undefined
      }>
      {!data ? (
        <Card elevated>
          <Skeleton height={20} />
          <Skeleton height={20} />
          <Skeleton height={20} />
        </Card>
      ) : (
        <>
          <StatusBanner data={data} />
          {status !== 'approved' ? <Progress data={data} /> : null}

          <Card padded={false} style={{ padding: space[2] }}>
            <Text variant="label" style={{ padding: space[2] }}>
              {t('onboarding.you')}
            </Text>
            <ListRow
              icon="credit-card"
              title={t('onboarding.licence')}
              subtitle={data.licence_number_masked ? `${data.licence_number_masked} · ${data.licence_expiry ?? ''}` : t('onboarding.needed')}
              onPress={editable ? () => router.push('/details') : undefined}
            />
            {data.documents.map((slot) => (
              <DocumentRow key={slot.document_type} slot={slot} editable={editable} />
            ))}
          </Card>

          <Card padded={false} style={{ padding: space[2] }}>
            <Text variant="label" style={{ padding: space[2] }}>
              {t('onboarding.vehicle')}
            </Text>
            {vehicle ? (
              <>
                <ListRow
                  icon="truck"
                  title={`${vehicle.make} ${vehicle.model} · ${vehicle.registration_number}`}
                  subtitle={`${vehicle.category.name} · ${vehicle.color} · ${vehicle.year}`}
                  onPress={editable ? () => router.push({ pathname: '/vehicle', params: { id: vehicle.id } }) : undefined}
                />
                {vehicle.documents.map((slot) => (
                  <DocumentRow key={slot.document_type} slot={slot} vehicleId={vehicle.id} editable={editable} />
                ))}
              </>
            ) : (
              <ListRow icon="plus" title={t('onboarding.addVehicle')} onPress={() => router.push('/vehicle')} tone="primary" />
            )}
          </Card>

          {error ? <Banner tone="danger" body={error} /> : null}
        </>
      )}
      <RefreshControl refreshing={state.isRefetching} onRefresh={() => void state.refetch()} />
    </Screen>
  );
}

function StatusBanner({ data }: { data: Onboarding }) {
  const { t } = useTranslation();
  const map: Record<string, { tone: BannerTone; key: string }> = {
    submitted: { tone: 'info', key: 'submitted' },
    under_review: { tone: 'info', key: 'review' },
    rejected: { tone: 'danger', key: 'rejected' },
    approved: { tone: 'success', key: 'approved' },
  };
  const entry = map[data.onboarding_status];
  if (!entry) return null;
  const body = data.onboarding_status === 'rejected' && data.rejected_reason ? data.rejected_reason : t(`onboarding.status.${entry.key}Body`);
  return <Banner tone={entry.tone} title={t(`onboarding.status.${entry.key}`)} body={body} />;
}

function Progress({ data }: { data: Onboarding }) {
  const { t } = useTranslation();
  const slots = [...data.documents, ...data.vehicles.flatMap((v) => v.documents)];
  const total = slots.length + 2;
  const done = slots.filter((s) => s.state !== 'missing' && s.state !== 'rejected' && s.state !== 'expired').length + (data.licence_number_masked ? 1 : 0) + (data.has_vehicle ? 1 : 0);
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="caption" color="textMuted">
        {t('onboarding.progress', { done, total })}
      </Text>
      <ProgressBar value={total ? done / total : 0} />
    </View>
  );
}

function DocumentRow({ slot, vehicleId, editable }: { slot: DocumentSlot; vehicleId?: string; editable: boolean }) {
  const { t } = useTranslation();
  const tone = slot.state === 'approved' ? 'successText' : slot.state === 'rejected' || slot.state === 'expired' ? 'dangerText' : slot.state === 'pending' ? 'infoText' : 'textMuted';
  const canUpload = editable && slot.state !== 'pending' && slot.state !== 'approved' ? true : editable && slot.state === 'approved';
  return (
    <ListRow
      icon={slot.state === 'approved' ? 'check-circle' : slot.state === 'missing' ? 'upload' : 'file-text'}
      title={t(`documents.types.${slot.document_type}`, { defaultValue: slot.document_type })}
      subtitle={slot.rejection_reason ?? (slot.expires_at ? t('documents.expires', { date: slot.expires_at.slice(0, 10) }) : undefined)}
      value={<Text variant="caption" color={tone}>{t(`documents.state.${slot.state}`, { defaultValue: slot.state })}</Text>}
      onPress={canUpload ? () => router.push({ pathname: '/document', params: { type: slot.document_type, ...(vehicleId ? { vehicleId } : {}) } }) : undefined}
    />
  );
}
