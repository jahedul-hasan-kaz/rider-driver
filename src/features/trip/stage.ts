import type { Trip } from '@/api/endpoints/driver';

// The one next step a driver takes at each trip status (docs/spec/03-screens.md §7.8). Pure, so it is tested
// directly and the screen just renders it.

export type TripStep = 'arriving' | 'arrived' | 'start' | 'complete' | 'done';

export function nextStep(status: Trip['status']): TripStep {
  switch (status) {
    case 'driver_assigned':
      return 'arriving';
    case 'driver_arriving':
      return 'arrived';
    case 'arrived':
      return 'start';
    case 'in_progress':
      return 'complete';
    default:
      return 'done';
  }
}

/** Where the driver is heading now: the pickup until the trip starts, then the drop-off. */
export function navigationTarget(trip: Pick<Trip, 'status' | 'pickup' | 'destination'>) {
  return trip.status === 'in_progress' ? trip.destination : trip.pickup;
}

/** Turn-by-turn in the driver's own maps app. Google Maps on Android, Apple Maps (or Google if present) on iOS. */
export function navigationUrl(target: { lat: number; lng: number }, platform: 'ios' | 'android' | string): string {
  const ll = `${target.lat},${target.lng}`;
  return platform === 'ios' ? `maps://?daddr=${ll}&dirflg=d` : `google.navigation:q=${ll}&mode=d`;
}

/** Default wait at pickup before a no-show cancel (rider-admin cancellation.no_show_wait_min); the live value comes from config. */
export const NO_SHOW_WAIT_S = 300;

export function canCancelNoShow(arrivedAt: string | null, now: number, waitS = NO_SHOW_WAIT_S): boolean {
  if (!arrivedAt) return false;
  return now - Date.parse(arrivedAt) >= waitS * 1000;
}
