import type { QueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

import { api } from '@/api';
import { registerDevice } from '@/api/endpoints/care';
import { keys, refreshAfterTripChange } from '@/features/account/queries';
import { pathForPush, type PushData } from '@/lib/deep-links';
import { reportError } from '@/lib/monitoring';
import { prefs } from '@/lib/storage';

// Expo push (docs/spec/04-integration.md §10). A push is never trusted as state: it only says "look again", and the
// app refetches. Delivery from the server needs rider-admin's Expo adapter and passenger events (gaps B2–B3).

const TOKEN_KEY = 'push.token';
const ASKED_KEY = 'push.asked';

export type PushCategory = 'offers' | 'trip' | 'account' | 'money' | 'support';

/** Android channels (docs/spec/04-integration.md §10.2). Ride offers ring loudly and may bypass Do Not Disturb. */
const CHANNELS: Record<PushCategory, Notifications.NotificationChannelInput> = {
  offers: {
    name: 'Ride offers',
    importance: AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 400, 200, 400, 200, 400],
    bypassDnd: true,
  },
  trip: { name: 'Trip updates', importance: AndroidImportance.HIGH, sound: 'default', vibrationPattern: [0, 250, 150, 250] },
  account: { name: 'Account', importance: AndroidImportance.HIGH },
  money: { name: 'Money', importance: AndroidImportance.DEFAULT },
  support: { name: 'Support', importance: AndroidImportance.DEFAULT },
};

export function categoryOf(type: string | undefined): PushCategory {
  if (!type) return 'trip';
  if (type.startsWith('offer.')) return 'offers';
  if (type.startsWith('payout.')) return 'money';
  if (type.startsWith('support.')) return 'support';
  if (type.startsWith('account.') || type.startsWith('document.') || type === 'forced_offline') return 'account';
  return 'trip';
}

/** Offers, trip, account and money messages are part of the job and always on; support replies can be muted. */
export function categoryEnabled(category: PushCategory): boolean {
  return category === 'support' ? prefs.getString('notify.support') !== 'off' : true;
}

function dataOf(notification: Notifications.Notification): PushData {
  return (notification.request.content.data ?? {}) as PushData;
}

let onForeground: ((title: string, data: PushData) => void) | null = null;

/** Call once at start-up (outside React). */
export function configurePush(): void {
  // Push is phone-only; the web build exists just to preview screens.
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = dataOf(notification);
      const category = categoryOf(data.type);
      const allowed = categoryEnabled(category);
      // In the foreground the offer sheet and trip screen update themselves; a banner would only repeat them.
      const inApp = category === 'offers' || category === 'trip';
      const banner = allowed && !inApp;
      if (allowed && inApp) onForeground?.(notification.request.content.title ?? '', data);
      return { shouldShowBanner: banner, shouldShowList: allowed, shouldPlaySound: banner, shouldSetBadge: false };
    },
  });
  if (Platform.OS === 'android') {
    for (const [id, channel] of Object.entries(CHANNELS)) void Notifications.setNotificationChannelAsync(id, channel);
  }
}

/** Ask for permission in context — right after the first ride request (§10.1), never on first launch. */
export async function askPermissionInContext(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (prefs.getString(ASKED_KEY) === 'yes' || !current.canAskAgain) return false;
  prefs.set(ASKED_KEY, 'yes');
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

export function storedPushToken(): string | null {
  return prefs.getString(TOKEN_KEY) ?? null;
}

/** Registers this device's Expo token with rider-admin. Silent no-op without permission, on simulators or without
 *  an EAS project id (local development before `eas init`). */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice || Platform.OS === 'web') return;
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerDevice(api(), Platform.OS === 'ios' ? 'ios' : 'android', token);
    prefs.set(TOKEN_KEY, token);
  } catch (error) {
    reportError(error, { where: 'registerForPush' });
  }
}

export function forgetPushToken(): void {
  prefs.remove(TOKEN_KEY);
}

function open(data: PushData) {
  const path = pathForPush(data);
  // Validated against the deep-link allow-list, so it is a real route.
  if (path) router.push(path as Href);
}

/**
 * Wires pushes into the running app: refetch what a push refers to, show a toast for ride events in the foreground,
 * open the right screen on tap (including a tap that cold-started the app), and re-register rotated tokens.
 */
export function bindPush(queryClient: QueryClient, toast: (title: string, data: PushData) => void): () => void {
  if (Platform.OS === 'web') return () => undefined;
  onForeground = toast;

  const refresh = (data: PushData) => {
    if (data.type?.startsWith('offer.')) void queryClient.invalidateQueries({ queryKey: keys.offer });
    if (data.trip_id || data.type?.startsWith('trip.')) refreshAfterTripChange(queryClient, data.trip_id);
    if (data.type?.startsWith('account.') || data.type?.startsWith('document.') || data.type === 'forced_offline') {
      void queryClient.invalidateQueries({ queryKey: keys.onboarding });
      void queryClient.invalidateQueries({ queryKey: keys.me });
    }
    if (data.type?.startsWith('payout.')) void queryClient.invalidateQueries({ queryKey: keys.wallet });
    if (data.ticket_id) {
      void queryClient.invalidateQueries({ queryKey: keys.tickets });
      void queryClient.invalidateQueries({ queryKey: keys.ticket(data.ticket_id) });
    }
  };

  const received = Notifications.addNotificationReceivedListener((n) => refresh(dataOf(n)));
  const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = dataOf(response.notification);
    refresh(data);
    open(data);
  });
  const rotated = Notifications.addPushTokenListener(() => void registerForPush());

  // A tap that launched the app from a killed state.
  Promise.resolve()
    .then(() => Notifications.getLastNotificationResponseAsync())
    .then((response) => {
      if (response) open(dataOf(response.notification));
    })
    .catch((error: unknown) => reportError(error, { where: 'lastNotificationResponse' }));

  return () => {
    onForeground = null;
    received.remove();
    tapped.remove();
    rotated.remove();
  };
}
