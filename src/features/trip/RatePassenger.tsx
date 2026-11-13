import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, intents, isApiErrorCode } from '@/api';
import { ratePassenger } from '@/api/endpoints/driver';
import { errorMessage } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { Banner, Button, Card, StarRating, Text, TextField } from '@/ui';

// Rate the passenger (docs/spec/03-screens.md §7.9). Optional: the driver can skip it and go home. A low score
// with a comment opens a support ticket on the server side, so the comment prompt changes for 1–2 stars.
export function RatePassenger({ tripId, onRated }: { tripId: string; onRated?: () => void }) {
  const { t } = useTranslation();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await intents().run(`rate.${tripId}`, (key) => ratePassenger(api(), tripId, score, comment, key));
      haptic('success');
      setSent(true);
      onRated?.();
    } catch (failure) {
      // Already rated (e.g. a retry after a lost response): treat as done.
      if (isApiErrorCode(failure, 'ALREADY_EXISTS')) {
        setSent(true);
        onRated?.();
      } else setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  if (sent) return <Banner tone="success" body={t('rate.thanks')} />;

  return (
    <Card testID="rate-passenger">
      <Text variant="heading">{t('driverRate.title')}</Text>
      <StarRating value={score} onChange={setScore} label={t('driverRate.title')} />
      {score > 0 ? (
        <>
          <TextField
            label={t(score <= 2 ? 'rate.commentLow' : 'rate.comment')}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={1000}
          />
          <Button testID="submit-rating" label={t('rate.submit')} size="md" loading={busy} onPress={() => void submit()} />
        </>
      ) : null}
      {error ? <Banner tone="danger" body={error} /> : null}
    </Card>
  );
}
