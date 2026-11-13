import { useQuery, type QueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import { getClientConfig, getMe, type ClientConfig, type Me } from '@/api/endpoints/account';
import { getCurrentOffer, getCurrentTrip, getOnboarding, getWallet } from '@/api/endpoints/driver';
import { useSession } from '@/features/auth/session-store';

// Server state shared by many driver screens. Query keys live here so invalidation stays consistent.

export const keys = {
  me: ['me'] as const,
  config: ['config'] as const,
  onboarding: ['onboarding'] as const,
  wallet: ['wallet'] as const,
  earnings: ['earnings'] as const,
  trips: ['trips'] as const,
  categories: ['categories'] as const,
  offer: ['offer', 'current'] as const,
  currentTrip: ['trip', 'current'] as const,
  trip: (id: string) => ['trip', id] as const,
  tickets: ['tickets'] as const,
  ticket: (id: string) => ['ticket', id] as const,
};

export function useMe() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  return useQuery<Me>({ queryKey: keys.me, queryFn: () => getMe(api()), enabled: signedIn, staleTime: 30_000 });
}

export function useClientConfig() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  return useQuery<ClientConfig>({ queryKey: keys.config, queryFn: () => getClientConfig(api()), enabled: signedIn, staleTime: 5 * 60_000 });
}

export function useOnboarding(enabled = true) {
  return useQuery({ queryKey: keys.onboarding, queryFn: () => getOnboarding(api()), enabled, staleTime: 15_000 });
}

export function useWallet(enabled = true) {
  return useQuery({ queryKey: keys.wallet, queryFn: () => getWallet(api()), enabled, staleTime: 30_000 });
}

/** The trip in progress, if any. It always wins over everything else on start-up (spec §8.5). */
export function useCurrentTrip(enabled = true) {
  return useQuery({ queryKey: keys.currentTrip, queryFn: () => getCurrentTrip(api()), enabled, staleTime: 5_000 });
}

/** Polled while online and the socket is down (spec §9.2); realtime and push trigger refetches. */
export function useCurrentOffer(enabled: boolean, pollMs: number | false) {
  return useQuery({ queryKey: keys.offer, queryFn: () => getCurrentOffer(api()), enabled, refetchInterval: pollMs, staleTime: 0 });
}

export function refreshAfterTripChange(client: QueryClient, tripId?: string) {
  void client.invalidateQueries({ queryKey: keys.currentTrip });
  void client.invalidateQueries({ queryKey: keys.wallet });
  void client.invalidateQueries({ queryKey: keys.earnings });
  void client.invalidateQueries({ queryKey: keys.trips });
  void client.invalidateQueries({ queryKey: keys.onboarding });
  if (tripId) void client.invalidateQueries({ queryKey: keys.trip(tripId) });
}
