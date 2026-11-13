# Rider Driver

Expo (SDK 58) / React Native driver app for Rider. Specs: `docs/spec/01–05`. Backend: rider-admin `/api/v1`, with
Supabase only for sign-in, Realtime (`driver:{id}` channel) and document storage.

## Run

```bash
npm install
cp .env.example .env.local   # fill in the EXPO_PUBLIC_* values
npx expo run:android          # background location, camera and audio need a development build, not Expo Go
```

## What is in it

| Area | Where |
|---|---|
| Sign-in (email code; phone behind `EXPO_PUBLIC_PHONE_SIGN_IN`) | `src/app/(auth)` |
| Start-up gate: account → application → trip in progress → permissions → home | `src/app/index.tsx` |
| Application: licence, vehicle, document photo/PDF upload, submit, review status | `src/app/(onboarding)`, `src/features/documents` |
| Permissions: precise + background location, notifications | `src/app/(gate)/permissions.tsx` |
| Online/offline, realtime offers, heartbeat | `src/features/driving` |
| Background location: foreground service, offline buffer, batches of 20 | `src/features/location/tracking.ts`, `queue.ts` |
| Offer card (countdown, chime, spoken earning), trip flow (arrive, PIN, start, complete, cancel/no-show, SOS), cash collection | `src/app/(app)` |
| Earnings, wallet and payout account, support, profile, settings, delete account | `src/app/(app)` |

## Checks

```bash
npx tsc --noEmit
```

```bash
npx expo lint
```

```bash
npx jest
```

```bash
node scripts/check-i18n.mjs
```
