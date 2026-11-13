import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { api, intents } from '@/api';
import { setAvailability } from '@/api/endpoints/driver';
import { keys } from '@/features/account/queries';
import { currentFix } from '@/features/location/location';
import type { QueueMode } from '@/features/location/queue';
import { heartbeat, startTracking, stopTracking } from '@/features/location/tracking';
import { track } from '@/lib/analytics';
import { prefs } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

// Online / offline (docs/spec/03-screens.md §7.6). The server is the truth: going online sends a fresh position with
// the request, and only once the server agrees does tracking start. The last answer is kept on the phone so a
// restart resumes tracking without a flash of "offline".

const ONLINE_KEY = 'driving.online';

type DrivingStore = {
  online: boolean;
  setOnline: (online: boolean) => void;
};

export const useDriving = create<DrivingStore>((set) => ({
  online: prefs.getString(ONLINE_KEY) === 'yes',
  setOnline: (online) => {
    prefs.set(ONLINE_KEY, online ? 'yes' : 'no');
    set({ online });
  },
}));

export type TrackingText = { title: string; body: string };

export async function goOnline(text: TrackingText): Promise<void> {
  const fix = await currentFix(10_000);
  const state = await intents().run('availability.online', (key) =>
    setAvailability(api(), { online: true, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy }, key),
  );
  if (state !== 'online') throw new Error(`availability ${state}`);
  useDriving.getState().setOnline(true);
  track('went_online');
  await startTracking('idle', text);
}

export async function goOffline(): Promise<void> {
  await intents().run('availability.offline', (key) => setAvailability(api(), { online: false }, key));
  useDriving.getState().setOnline(false);
  track('went_offline');
  await stopTracking();
}

/** Tracking speed follows the trip: fast during a trip, slow while waiting. */
export async function setTrackingMode(mode: QueueMode, text: TrackingText) {
  if (useDriving.getState().online) await startTracking(mode, text);
}

/** Server told us we are offline (forced offline, stale location, suspension): stop tracking to match. */
export async function syncOffline() {
  if (!useDriving.getState().online) return;
  useDriving.getState().setOnline(false);
  await stopTracking().catch(() => undefined);
}

/**
 * The driver's private realtime channel `driver:{id}` (offer created/withdrawn, trip status). Every event only
 * triggers a refetch; the REST answer is what screens show. Returns whether the socket is joined, so callers can
 * poll faster when it is not.
 */
export function useDriverChannel(driverId: string | undefined): boolean {
  const queryClient = useQueryClient();
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!driverId) return;
    const refresh = (...queryKeys: (readonly unknown[])[]) => queryKeys.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }));
    const channel = supabase()
      .channel(`driver:${driverId}`, { config: { private: true } })
      .on('broadcast', { event: 'offer_created' }, () => refresh(keys.offer))
      .on('broadcast', { event: 'offer_withdrawn' }, () => refresh(keys.offer))
      .on('broadcast', { event: 'trip_status_changed' }, () => refresh(keys.currentTrip, ['trip'], keys.wallet))
      .on('broadcast', { event: 'availability_changed' }, () => refresh(keys.onboarding))
      .subscribe((status) => {
        setJoined(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') refresh(keys.offer, keys.currentTrip);
      });
    return () => {
      void supabase().removeChannel(channel);
    };
  }, [driverId, queryClient]);

  return joined;
}

/** Sends the position every 30 s while the app is open and online, so a parked driver does not go stale. */
export function useHeartbeat(online: boolean) {
  useEffect(() => {
    if (!online) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      void heartbeat();
      timer = setInterval(() => void heartbeat(), 30_000);
    };
    const stop = () => timer && clearInterval(timer);
    start();
    const sub = AppState.addEventListener('change', (s) => {
      stop();
      if (s === 'active') start();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [online]);
}
