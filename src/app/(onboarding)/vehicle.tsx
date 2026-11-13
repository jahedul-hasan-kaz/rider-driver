import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { api, intents } from '@/api';
import { addVehicle, listCategories, updateVehicle, type VehicleInput } from '@/api/endpoints/driver';
import { keys, useOnboarding } from '@/features/account/queries';
import { currentLanguage, errorMessage } from '@/i18n';
import { track } from '@/lib/analytics';
import { space } from '@/theme/tokens';
import { Banner, Button, Card, Chip, HeroHeader, Screen, Text, TextField } from '@/ui';

const THIS_YEAR = new Date().getFullYear();

export function vehicleValid(v: Omit<VehicleInput, 'year'> & { year: string }): boolean {
  const year = Number(v.year);
  return (
    !!v.categoryId &&
    v.make.trim().length >= 2 &&
    v.model.trim().length >= 1 &&
    v.color.trim().length >= 3 &&
    v.registrationNumber.trim().length >= 5 &&
    Number.isInteger(year) &&
    year >= 1990 &&
    year <= THIS_YEAR + 1
  );
}

// Add or edit the vehicle (docs/spec/03-screens.md §7.4). The category decides which offers the driver gets.
export default function VehicleScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const onboarding = useOnboarding();
  const existing = onboarding.data?.vehicles.find((v) => v.id === id);
  const categories = useQuery({ queryKey: keys.categories, queryFn: () => listCategories(api()), staleTime: 10 * 60_000 });
  const [form, setForm] = useState(() => ({
    categoryId: existing?.category.id ?? '',
    make: existing?.make ?? '',
    model: existing?.model ?? '',
    color: existing?.color ?? '',
    registrationNumber: existing?.registration_number ?? '',
    year: existing ? String(existing.year) : '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [k]: value }));
  const valid = vehicleValid(form);
  const bn = currentLanguage() === 'bn';

  const save = async () => {
    setBusy(true);
    setError(null);
    const input: VehicleInput = { ...form, year: Number(form.year) };
    try {
      if (existing) {
        await intents().run(`vehicle.update.${existing.id}`, (key) => updateVehicle(api(), existing.id, input, existing.version, key));
      } else {
        await intents().run('vehicle.add', (key) => addVehicle(api(), input, key));
        track('onboarding_step_completed', { step: 'vehicle' });
      }
      await queryClient.invalidateQueries({ queryKey: keys.onboarding });
      router.back();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      hero={<HeroHeader title={t(existing ? 'vehicle.editTitle' : 'vehicle.addTitle')} onBack={() => router.back()} overlap={space[6]} />}
      footer={<Button label={t('common.save')} disabled={!valid} loading={busy} onPress={() => void save()} />}>
      <Card elevated>
        <Text variant="label">{t('vehicle.category')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {(categories.data ?? []).map((c) => (
            <Chip key={c.id} label={bn && c.name_bn ? c.name_bn : c.name} selected={form.categoryId === c.id} onPress={() => set('categoryId')(c.id)} />
          ))}
        </View>
        <TextField label={t('vehicle.make')} placeholder="Bajaj" value={form.make} onChangeText={set('make')} maxLength={40} />
        <TextField label={t('vehicle.model')} placeholder="Pulsar 150" value={form.model} onChangeText={set('model')} maxLength={40} />
        <TextField label={t('vehicle.color')} value={form.color} onChangeText={set('color')} maxLength={30} />
        <TextField
          label={t('vehicle.registration')}
          placeholder="DHAKA METRO-HA 12-3456"
          value={form.registrationNumber}
          onChangeText={set('registrationNumber')}
          autoCapitalize="characters"
          maxLength={30}
        />
        <TextField label={t('vehicle.year')} value={form.year} onChangeText={set('year')} keyboardType="number-pad" maxLength={4} />
      </Card>
      {error ? <Banner tone="danger" body={error} /> : null}
    </Screen>
  );
}
