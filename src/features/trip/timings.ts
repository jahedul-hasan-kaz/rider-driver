import { useClientConfig } from '@/features/account/queries';

// Trip timings set in rider-admin (dispatch.offer_timeout_s, cancellation.no_show_wait_min, ratings.window_days),
// with the backend defaults until the config has loaded.
export function useTimings() {
  const settings = useClientConfig().data?.settings;
  return {
    offerSeconds: settings?.offer_timeout_s ?? 15,
    noShowWaitS: (settings?.no_show_wait_min ?? 5) * 60,
    ratingWindowMs: (settings?.rating_window_days ?? 7) * 24 * 3600 * 1000,
  };
}
