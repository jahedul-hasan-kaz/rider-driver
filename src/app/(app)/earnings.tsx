import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { api } from '@/api';
import { listEarnings } from '@/api/endpoints/driver';
import { keys, useWallet } from '@/features/account/queries';
import { errorMessage } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { space } from '@/theme/tokens';
import { Banner, Button, Card, EmptyState, HeroHeader, ListRow, Row, Screen, Skeleton, Text } from '@/ui';

// Earnings (docs/spec/03-screens.md §7.10, mockup D7): today, unpaid, and every trip's fare, commission and net.
export default function Earnings() {
  const { t } = useTranslation();
  const wallet = useWallet();
  const list = useInfiniteQuery({
    queryKey: keys.earnings,
    queryFn: ({ pageParam }) => listEarnings(api(), pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <Screen hero={<HeroHeader title={t('earnings.title')} onBack={() => router.back()} overlap={space[6]} />}>
      <Card elevated>
        <Row style={{ justifyContent: 'space-between' }}>
          <Stat label={t('earnings.today')} value={wallet.data?.earned_today} />
          <Stat label={t('earnings.unpaid')} value={wallet.data?.unpaid_earnings} />
        </Row>
        <Button label={t('earnings.wallet')} variant="secondary" size="md" leftIcon="credit-card" onPress={() => router.push('/wallet')} />
      </Card>

      {list.error ? <Banner tone="danger" body={errorMessage(list.error)} /> : null}
      {list.isPending ? (
        <Card>
          <Skeleton height={44} />
          <Skeleton height={44} />
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState icon="dollar-sign" title={t('earnings.emptyTitle')} body={t('earnings.emptyBody')} />
      ) : (
        <Card padded={false} style={{ padding: space[2] }}>
          {rows.map((e) => (
            <ListRow
              key={e.id}
              icon="navigation"
              title={formatMoney(e.net_earning)}
              subtitle={`${new Date(e.created_at).toLocaleString()} · ${t('earnings.fareLine', { fare: formatMoney(e.gross_fare), commission: formatMoney(e.commission) })}`}
              value={<Text variant="caption" color="textMuted">{t(`earnings.payout.${e.payout_status}`, { defaultValue: e.payout_status })}</Text>}
            />
          ))}
        </Card>
      )}
      {list.hasNextPage ? <Button label={t('earnings.more')} variant="ghost" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /> : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value?: string }) {
  return (
    <Card tone="muted" style={{ flex: 1 }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="heading" tabular>
        {value ? formatMoney(value) : '—'}
      </Text>
    </Card>
  );
}
