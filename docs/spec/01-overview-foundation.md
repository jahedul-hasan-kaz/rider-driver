# Driver App — Product & Technical Specification

**Status:** Draft v1.0 · 2026-11-12
**App:** `[APP NAME] Driver` (ride-hailing, Bangladesh, Dhaka pilot)
**Stack:** React Native + Expo · Expo Push Notifications · secrets in Expo (EAS) environment variables
**Scope:** the driver mobile app only. No code in this document.

**Sources**

| Source | Used for |
|---|---|
| *Ride-Sharing Platform Blueprint* (20 pp.) | Driver screens (§4.2), shared principles (§4.3), driver profitability (§5.2), security rules (§8.1) |
| Passenger app spec (`C:\Workspace\rider-passenger\docs\spec`) and its mockups | Shared visual language, API client rules, push and secrets approach |
| `C:\Workspace\rider-admin` (Next.js + Supabase backend, as built) | The real API contract: `docs/spec/04-business-logic.md`, `docs/spec/05-api.md`, `src/app/api/v1/driver/*`, `src/lib/schemas/api.ts`, `supabase/migrations/*` |

Where the as-built backend differs from its own spec, this document follows the **code**. Everything the app needs that the backend does not yet provide is collected in [§14 Backend gaps](05-quality-delivery.md#14-backend-gaps-work-needed-in-rider-admin).

**Document map** (section numbers run continuously across the five files, so "§14, gap G3" always means the same place)

| File | Sections |
|---|---|
| [01-overview-foundation.md](01-overview-foundation.md) | §1 Product principles · §2 Scope · §3 Technology · §4 Environments & secrets |
| [02-design-system.md](02-design-system.md) | §5 Design system |
| [03-screens.md](03-screens.md) | §6 Navigation map · §7 Screens |
| [04-integration.md](04-integration.md) | §8 API integration · §9 Realtime, offers & trip state · §10 Push notifications · §11 Location & maps |
| [05-quality-delivery.md](05-quality-delivery.md) | §12 Resilience, security, quality · §13 Milestones · §14 Backend gaps · §15 Decisions to lock |

---

## 1. Product principles

1. **The driver's income depends on this app working.** A missed offer or a dropped location is lost money. Reliability beats every other feature.
2. **Glanceable and one-handed.** The phone is on a handlebar or dashboard mount, often in direct sunlight. Large type, high contrast, big targets, no fine gestures.
3. **Never ask the driver to read while moving.** Sound, vibration and voice carry the important events; the screen confirms them.
4. **Honest money.** Show what the driver earns after commission — per offer, per trip, per day — never just the gross fare (blueprint §5.2).
5. **The server decides.** Offers, trip states, fares and balances come from the backend. The app can never mark a trip complete or change an amount by itself (blueprint §4.3, §8.1).
6. **Deliberate confirmations for irreversible steps.** Start trip, complete trip and cash collected use slide-to-confirm so a pocket tap cannot end a ride.
7. **Location sharing is explicit and bounded.** The driver is tracked only while online or on a trip, and the app says so at all times.

## 2. Scope

**In v1**

- Phone sign-in (6-digit code), language choice, driver account creation
- Onboarding: licence details, vehicle registration, document capture and upload, submit for review, status and rejection reasons, re-upload
- Go online / offline with eligibility checks
- Background location while online and on a trip
- Incoming ride offer with countdown: accept / decline
- Trip flow: navigate to pickup → arrived → verify PIN → start → navigate to drop-off → complete → collect cash → rate passenger
- Driver cancellation with reason, passenger no-show handling
- Earnings (today, per trip), wallet (balance, cash owed to the platform), payout account, payout status
- SOS, support tickets
- Profile, vehicles, documents and expiry reminders, settings, account deletion
- Push notifications (Expo), realtime offers and trip updates (Supabase Realtime)

**Not in v1:** in-app turn-by-turn navigation (hand-off to Google Maps instead), in-app chat, heat maps / demand zones, incentives and quests, scheduled rides, multiple simultaneous offers, digital payment collection, instant cash-out, passenger features (separate app).

## 3. Technology

| Concern | Choice | Why |
|---|---|---|
| Runtime | Expo (current stable SDK, New Architecture), TypeScript strict | Same foundation as the passenger app |
| Build | **Development builds** via EAS Build (not Expo Go) | Background location, foreground service, native maps and remote push all need a dev build |
| Navigation | Expo Router (typed routes, deep links) | Push taps open the right screen |
| Server state | TanStack Query | Caching, retry, offline persistence |
| Local state | Zustand (availability, current offer, current trip, location queue) | Small, survives navigation |
| Forms / validation | React Hook Form + Zod | Schemas mirror `src/lib/schemas/api.ts` |
| Auth + realtime | `@supabase/supabase-js` (Auth and Realtime **only**) | All data goes through `/api/v1`; no direct table access |
| HTTP | One typed fetch client (envelope, errors, idempotency, request id) | Same rules as the passenger app (§8) |
| **Background location** | `expo-location` + `expo-task-manager`, Android **foreground service** with a persistent notification, iOS background location mode | The single most important native capability (§11) |
| Maps | MapLibre React Native, same style URL as admin and passenger | No per-load fees; consistent |
| Navigation hand-off | Deep link to Google Maps (fallback: any installed maps app) | Best Dhaka routing without building turn-by-turn |
| Push | `expo-notifications` + Expo Push Service | Asked for |
| Camera / files | `expo-camera`, `expo-image-picker`, `expo-document-picker`, `expo-image-manipulator` | Document capture, compression before upload |
| Sound / speech / haptics | `expo-audio`, `expo-speech`, `expo-haptics` | Offer ringtone, spoken events |
| Keep awake | `expo-keep-awake` | Screen stays on while online |
| Motion / sheets | Reanimated, Gesture Handler, `@gorhom/bottom-sheet` | Slide-to-confirm, offer sheet |
| i18n | `i18next` + `expo-localization` | English + Bengali from day one |
| Secure storage | `expo-secure-store` key + encrypted MMKV session | Session blob exceeds SecureStore's ~2 KB limit |
| Monitoring | Sentry with PII scrubbing | Correlated with backend request ids |
| OTA updates | EAS Update, channel per environment | Updates apply **only while offline with no active trip** |

### 3.1 Project structure (target)

```
app/
  (auth)/                 welcome, phone, code
  (onboarding)/           checklist, details, vehicle, document/[type], review-status
  (gate)/                 permissions, account-blocked
  (app)/                  home (online/offline), offer, trip/[id], trip-complete,
                          earnings, wallet, payout-account, trips, documents, vehicles,
                          support, safety, profile, settings
src/
  api/                    client, endpoints, Zod response schemas, error map
  features/<name>/        auth, onboarding, availability, location, offers, trip, money, support…
  background/             location task, queue, foreground-service config
  ui/                     design-system primitives
  theme/  i18n/  lib/
app.config.ts  eas.json
```

Shared code with the passenger app (API client, theme tokens, i18n helpers, primitives) should live in one shared package once both apps exist; until then it is copied, not diverged.

## 4. Environments & secrets (Expo)

**Rule: nothing secret ships in the app.** The bundle holds only publishable values; real secrets live on the server or in EAS.

| Variable | Kind | Where it lives | Notes |
|---|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Public | EAS env (plain text), per environment | Admin deployment origin + `/api/v1` |
| `EXPO_PUBLIC_SUPABASE_URL` | Public | EAS env | |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | EAS env | Publishable key only. **Never** the secret/service-role key |
| `EXPO_PUBLIC_MAP_STYLE_URL` | Public | EAS env | MapLibre style JSON |
| `EXPO_PUBLIC_APP_ENV` | Public | EAS env | `development` / `staging` / `production` |
| `EXPO_PUBLIC_SENTRY_DSN` | Public | EAS env | |
| `SENTRY_AUTH_TOKEN` | **Secret** | EAS env, visibility *secret* | Build-time only |
| FCM V1 service-account key, APNs key | **Secret** | EAS **credentials** | Used by Expo Push Service |
| Android keystore, iOS certs/profiles | **Secret** | EAS credentials (managed) | |
| Expo access token (push security) | **Secret** | Backend env in `rider-admin` only | |

- Three EAS environments (**development**, **preview**/staging, **production**) with separate Supabase projects, bundle ids (`.driver.dev`, `.driver.staging`, `.driver`) and icon badges. The driver app is a **separate store listing** from the passenger app (blueprint §4): its permissions (background location, camera) and review notes differ.
- Local development uses `eas env:pull` into an untracked `.env.local`; `.env.example` lists names only.
- CI fails if any `EXPO_PUBLIC_*` name contains `SECRET`, `SERVICE`, `PRIVATE` or `TOKEN`.
- Tunables and feature flags come from `GET /config`, not from env vars.
- Document images never touch app-controlled third-party storage: they go straight to a private Supabase bucket through a short-lived signed upload URL issued by the backend.
