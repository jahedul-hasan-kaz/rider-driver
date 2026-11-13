import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { api } from '@/api';
import { sendLocations, type LocationPoint } from '@/api/endpoints/driver';
import { prefs } from '@/lib/storage';

import { useLastFix } from './location';
import { enqueue, filterAccuracy, takeBatch, type QueueMode } from './queue';

// Background location while online (docs/spec/04-integration.md §11). One task feeds a persisted buffer; the buffer is
// flushed in batches of 20. Android runs it as a foreground service with a visible notification, iOS with the blue
// location indicator. The task must be defined at module scope so the OS can wake it with the app closed.

export const LOCATION_TASK = 'rider-driver-location';
const QUEUE_KEY = 'location.queue';
const MODE_KEY = 'location.mode';

function readQueue(): LocationPoint[] {
  try {
    const raw = prefs.getString(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as LocationPoint[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: LocationPoint[]) {
  prefs.set(QUEUE_KEY, JSON.stringify(queue));
}

function mode(): QueueMode {
  return prefs.getString(MODE_KEY) === 'trip' ? 'trip' : 'idle';
}

export function toPoint(l: Location.LocationObject): LocationPoint {
  return {
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy,
    heading: l.coords.heading,
    speed: l.coords.speed,
    recorded_at: new Date(l.timestamp).toISOString(),
  };
}

let flushing = false;

/** Sends everything queued, oldest first. Stops at the first failure and keeps the rest for later. */
export async function flushLocations(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let queue = readQueue();
    while (queue.length > 0) {
      const { batch, rest } = takeBatch(queue);
      await sendLocations(api(), batch);
      queue = rest;
      writeQueue(queue);
    }
  } catch {
    // Offline or rejected: the buffer keeps the points and the next fix or heartbeat tries again.
  } finally {
    flushing = false;
  }
}

export function recordLocations(locations: Location.LocationObject[]) {
  const points = filterAccuracy(locations.map(toPoint));
  const last = points[points.length - 1];
  if (last) useLastFix.getState().setFix({ lat: last.lat, lng: last.lng, accuracy: last.accuracy ?? null, at: Date.parse(last.recorded_at) });
  writeQueue(enqueue(readQueue(), points, mode()));
  void flushLocations();
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    recordLocations(data.locations);
  });
}

type Strings = { title: string; body: string };

/** Starts (or retunes) tracking: every ~10 s while waiting for offers, every ~3 s on a trip (§11.1). */
export async function startTracking(next: QueueMode, notification: Strings): Promise<void> {
  if (Platform.OS === 'web') return;
  prefs.set(MODE_KEY, next);
  const trip = next === 'trip';
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: trip ? Location.Accuracy.BestForNavigation : Location.Accuracy.Balanced,
    timeInterval: trip ? 3000 : 10000,
    distanceInterval: trip ? 5 : 25,
    deferredUpdatesInterval: trip ? 3000 : 10000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: notification.title,
      notificationBody: notification.body,
      killServiceOnDestroy: false,
    },
  });
}

export async function stopTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  await flushLocations();
}

export async function isTracking(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
}

/**
 * Heartbeat (§11.1): when the driver stands still the OS sends no fixes, but the server marks a driver stale after
 * 60 s. Every 30 s in the foreground, send the current position if nothing newer was queued.
 */
export async function heartbeat(): Promise<void> {
  const last = await Location.getLastKnownPositionAsync({ maxAge: 30000 }).catch(() => null);
  const fix = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
  if (!fix) return;
  recordLocations([{ ...fix, timestamp: Date.now() }]);
}
