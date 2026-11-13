import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { api, intents } from '@/api';
import { PAYOUT_METHODS, setPayoutAccount, type PayoutMethod } from '@/api/endpoints/driver';
import { keys, useWallet } from '@/features/account/queries';
import { errorMessage } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { space } from '@/theme/tokens';
import { Banner, Button, Card, Chip, HeroHeader, Screen, Text, TextField, useToast } from '@/ui';

// Wallet and payout account (docs/spec/03-screens.md §7.11). Shows the balance (negative = cash commission owed to
// the platform) and where payouts go. The account number is never shown back in full.
export default function Wallet() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const w = wallet.data;
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<PayoutMethod>('bkash');
  const [holder, setHolder] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = holder.trim().length >= 2 && (method === 'bank' ? ref.trim().length >= 6 : /^01\d{9}$/.test(ref.trim()));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await intents().run('payout.account', (key) => setPayoutAccount(api(), { method, holder, ref }, key));
      queryClient.setQueryData(keys.wallet, next);
      setEditing(false);
      setRef('');
      toast({ message: t('wallet.saved'), tone: 'success' });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen hero={<HeroHeader title={t('wallet.title')} onBack={() => router.back()} overlap={space[6]} />}>
      <Card elevated>
        <Text variant="caption" color="textMuted">
          {t('wallet.balance')}
        </Text>
        <Text variant="display" tabular color={w?.owes_platform ? 'dangerText' : 'text'}>
          {w ? formatMoney(w.balance) : '—'}
        </Text>
        {w?.owes_platform ? <Banner tone="warning" body={t('wallet.owes')} /> : null}
        {w?.open_payout ? <Banner tone="info" body={t('wallet.openPayout', { amount: formatMoney(w.open_payout.amount), status: w.open_payout.status })} /> : null}
      </Card>

      <Card>
        <Text variant="heading">{t('wallet.payoutAccount')}</Text>
        {!editing ? (
          <>
            <Text color={w?.payout_account ? 'text' : 'textMuted'}>
              {w?.payout_account ? `${t(`wallet.methods.${w.payout_account.method}`, { defaultValue: w.payout_account.method })} · ${w.payout_account.masked ?? ''}` : t('wallet.noAccount')}
            </Text>
            <Button label={t(w?.payout_account ? 'wallet.change' : 'wallet.add')} variant="secondary" size="md" onPress={() => setEditing(true)} />
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              {PAYOUT_METHODS.map((m) => (
                <Chip key={m} label={t(`wallet.methods.${m}`)} selected={method === m} onPress={() => setMethod(m)} />
              ))}
            </View>
            <TextField label={t('wallet.holder')} value={holder} onChangeText={setHolder} autoCapitalize="words" maxLength={120} />
            <TextField
              label={t(method === 'bank' ? 'wallet.bankRef' : 'wallet.walletNumber')}
              placeholder={method === 'bank' ? undefined : '01XXXXXXXXX'}
              value={ref}
              onChangeText={setRef}
              keyboardType={method === 'bank' ? 'default' : 'phone-pad'}
              maxLength={60}
            />
            <Button label={t('common.save')} loading={busy} disabled={!valid} onPress={() => void save()} />
            <Button label={t('common.cancel')} variant="ghost" size="md" onPress={() => setEditing(false)} />
          </>
        )}
      </Card>
      {error ? <Banner tone="danger" body={error} /> : null}
    </Screen>
  );
}
