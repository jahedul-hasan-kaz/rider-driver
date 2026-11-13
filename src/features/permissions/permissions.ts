import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

// What a driver must allow before going online (docs/spec/03-screens.md §7.5): precise location, location "all the
// time" so offers keep coming with the screen off, and notifications so an offer can ring. Re-checked whenever the
// app comes back to the foreground (the driver may have just changed it in Settings).

export type DriverPermissions = {
  checked: boolean;
  location: boolean;
  precise: boolean;
  background: boolean;
  notifications: boolean;
  servicesOn: boolean;
};

const EMPTY: DriverPermissions = { checked: false, location: false, precise: false, background: false, notifications: false, servicesOn: false };

export async function readPermissions(): Promise<DriverPermissions> {
  if (Platform.OS === 'web') return { checked: true, location: true, precise: true, background: true, notifications: true, servicesOn: true };
  const [fg, bg, notify, services] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
    Location.hasServicesEnabledAsync().catch(() => true),
  ]);
  const precise = Platform.OS === 'android' ? fg.android?.accuracy !== 'coarse' : fg.ios?.accuracy !== 'reduced';
  return {
    checked: true,
    location: fg.granted,
    precise: fg.granted && precise,
    background: bg.granted,
    notifications: notify.granted,
    servicesOn: services,
  };
}

export const readyToDrive = (p: DriverPermissions) => p.location && p.precise && p.background && p.servicesOn;

export function useDriverPermissions() {
  const [state, setState] = useState<DriverPermissions>(EMPTY);

  const recheck = useCallback(async () => {
    const next = await readPermissions();
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    let alive = true;
    void readPermissions().then((next) => alive && setState(next));
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void readPermissions().then((next) => alive && setState(next));
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const requestLocation = useCallback(async () => {
    await Location.requestForegroundPermissionsAsync();
    return recheck();
  }, [recheck]);

  /** Must come after foreground access; Android sends the driver to Settings for "Allow all the time". */
  const requestBackground = useCallback(async () => {
    await Location.requestBackgroundPermissionsAsync();
    return recheck();
  }, [recheck]);

  const requestNotifications = useCallback(async () => {
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: true } });
    return recheck();
  }, [recheck]);

  return { ...state, recheck, requestLocation, requestBackground, requestNotifications };
}
