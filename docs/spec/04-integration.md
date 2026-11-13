# Driver App Spec — 04 · Integration

[01 Overview & foundation](01-overview-foundation.md) · [02 Design system](02-design-system.md) · [03 Screens](03-screens.md) · [04 Integration](04-integration.md) · [05 Quality & delivery](05-quality-delivery.md)

---

## 8. API integration

### 8.1 Conventions (from `rider-admin/docs/spec/05-api.md` and `src/server/http/handler.ts`)

| Topic | App behaviour |
|---|---|
| Auth | `Authorization: Bearer <Supabase access token>`. Tokens last 15 min with rotating refresh tokens. The client refreshes ahead of expiry — **including from the background location task**, which must be able to refresh on its own — and once on `401 SESSION_EXPIRED` |
| Envelope | Success `{data, meta}`; error `{error:{code, message, details}, meta}` → typed `ApiError` |
| Validation | Strict bodies (unknown keys rejected, 64 KB max). The app validates before sending and parses every response with Zod |
| Idempotency | `Idempotency-Key` (UUID v4) on every state-changing call marked idempotent by the backend: availability, accept, reject, arriving, arrived, start, complete, cancel, cash-collected, rate, vehicles, documents, details, submit, payout account, evidence, support, deactivate, `PATCH /me`. **One key per driver intent**, kept until the call settles and reused on every retry. A changed body needs a new key (each PIN attempt and each online/offline toggle is a new intent; reusing a key with a different body returns `409 IDEMPOTENCY_KEY_REUSED`). Location, devices and SOS take no key |
| Retries | GETs: 3 attempts with jittered backoff. Mutations: retried only with the same key, on network errors and 5xx. Trip transitions are also idempotent server-side (repeating `arrived` on an arrived trip returns the trip) |
| Rate limits | read 120/min · write 30/min · **location 2 requests per 4 s** (up to 20 points each). `429` → honour `Retry-After` |
| Request id | `X-Request-Id` per call, attached to Sentry and shown as a short reference on error screens |
| Money | Display only; accept string or number; **no fare or earning arithmetic in the app** |
| Time | ISO-8601 UTC from the API, shown in `Asia/Dhaka`. Countdowns use server times corrected by a clock offset measured from response `Date` headers, so a wrong phone clock cannot shorten or extend an offer |

### 8.2 Endpoints used by the app

| Area | Calls |
|---|---|
| Account | `GET /me` · `PATCH /me` · `POST /onboarding/driver` · `POST /me/deactivate` · `PUT/DELETE /me/devices` · `GET /config` |
| Onboarding | `GET /driver/onboarding` · `PATCH /driver/details` · `POST /driver/vehicles` · `PATCH /driver/vehicles/{id}` · `POST /driver/documents/upload-url` · `POST /driver/documents/{id}/complete` · `POST /driver/application/submit` · `GET /categories` |
| Availability | `POST /driver/availability` · `POST /driver/location` |
| Offers | `GET /driver/offers/current` · `POST /driver/offers/{id}/accept` · `POST /driver/offers/{id}/reject` |
| Trip | `GET /driver/trips/current` · `GET /driver/trips/{id}` · `POST /driver/trips/{id}/arriving` · `/arrived` · `/start` · `/complete` · `/cancel` · `/cash-collected` |
| Money | `GET /driver/wallet` · `GET /driver/earnings` · `PUT /driver/payout-account` |
| After / safety | `POST /trips/{id}/rate` · `POST /trips/{id}/sos` · `POST /incidents/{id}/evidence/upload-url` · `…/complete` |
| Support | `GET/POST /support/tickets` · `GET /support/tickets/{id}` · `POST /support/tickets/{id}/messages` |

### 8.3 Key payloads (as built)

| Call | Returns (fields the app uses) |
|---|---|
| Offer (`/driver/offers/current`) | `offer_id`, `request_id`, `expires_at`, `pickup_distance_m`, `pickup_eta_s`, `pickup{label,note,lat,lng}`, `destination{label,lat,lng}`, `distance_m`, `duration_s`, `estimated_fare`, `estimated_driver_earning`, `payment_method`, `passenger_first_name` |
| Trip (`/driver/trips/{id}`, `/current`, and every transition) | `id`, `request_id`, `status`, timestamps, `estimated_fare`, `final_fare`, `payment_method`, `pickup`, `destination`, `passenger{first_name, phone_masked}`, `breakdown`, `cancellation_reason` |
| Start with PIN | A trip **or** `{pin_error, attempts_left}` with HTTP 200 |
| Wallet | `balance`, `owes_platform`, `unpaid_earnings`, `earned_today`, `open_payout{amount,status}`, `payout_account{method,masked,status}` |
| Earnings | Rows: `trip_id`, `gross_fare`, `commission`, `net_earning`, `payout_status`, `created_at`; cursor pagination |
| Onboarding | `onboarding_status`, `availability`, `rejected_reason`, `suspended_reason`, `licence_number_masked`, `licence_expiry`, `current_vehicle_id`, `documents[]`, `vehicles[]`, `missing_documents[]`, `has_vehicle`, `can_submit` |

### 8.4 Error code → driver experience

| Code | What the driver sees |
|---|---|
| `OFFER_NO_LONGER_AVAILABLE` | "This ride was taken" — back to waiting |
| `INVALID_STATE_TRANSITION` | Refetch the trip/availability and show the real state (e.g. passenger already cancelled) |
| `TOO_FAR_FROM_PICKUP` | Distance to pickup + "I'm here anyway" override |
| `DRIVER_NOT_APPROVED` / `VEHICLE_NOT_ACTIVE` / `OUT_OF_SERVICE_AREA` | Eligibility explanations with a fix action (§7.8) |
| `LOCATION_STALE` | "We lost your location" + GPS checklist |
| `ACCOUNT_SUSPENDED` | Blocked screen with the reason and Support |
| `ALREADY_EXISTS` | "This registration number is already in use" |
| `STALE_VERSION` | Refetch and reapply the edit |
| `VALIDATION_FAILED` | Field messages; on submit, the list of missing items |
| `RATE_LIMITED` | Quiet backoff; shown only if it blocks a driver action |
| `INTERNAL` / `UPSTREAM_UNAVAILABLE` / network | "Problem on our side" + Retry + reference code. Trip actions keep retrying in the background |

### 8.5 Start-up sequence
Restore session → in parallel `GET /me`, `GET /config`, `GET /driver/onboarding` → route by role, status and onboarding state → `GET /driver/trips/current` (active trip wins over everything) → `GET /driver/offers/current` → permissions check → Home. If the server says the driver is `online` but tracking is not running (app was killed), tracking restarts automatically and the driver is told.

## 9. Realtime, offers & trip state

### 9.1 Channel
Private Supabase Realtime **broadcast** channel `driver:{driver_id}` (driver id from `/me` → `driver.id`), authorised server-side; re-authorised on every token refresh.

| Event | Payload (as built) | App reaction |
|---|---|---|
| `offer_created` | `offer_id`, `request_id`, `expires_at` | Fetch `GET /driver/offers/current` for the full offer, then ring and show it |
| `offer_withdrawn` | `offer_id`, `request_id`, `reason?` | Close the offer if it is the one showing |
| `trip_status_changed` | `trip_id`, `trip_status` | Refetch the trip; handles passenger/admin cancellation and admin resolution |

### 9.2 Offer delivery — three independent paths
An offer lasts about **15 seconds** (`dispatch.offer_timeout_s`), so no single channel is trusted:

1. **Realtime** while the app is in the foreground.
2. **High-priority push** when the app is in the background or the socket is down (§10; needs backend gap G2).
3. **Short polling** of `GET /driver/offers/current` every 5 s while online in the foreground with the socket not joined, and once on every foreground event.

Whichever path arrives first wins; the others are de-duplicated by `offer_id`. Time already lost is visible: the countdown always starts from the real remaining time, and an offer with under 3 s left is not shown.

### 9.3 Trip reliability rules
- `GET /driver/trips/current` is the source of truth; broadcasts and pushes are hints that trigger a refetch.
- Refetch on reconnect, on foreground, after every transition, and every 10 s during an active trip as a safety net.
- Transition calls are queued and retried with their idempotency key when the network drops; the UI shows "Saving…" on the step and never lets the driver skip ahead of the server.
- **Complete trip** is never abandoned: it retries until acknowledged, survives an app restart, and the driver is told to keep the app open if the network is down.
- Unknown statuses render a generic "Updating your trip…" and are reported.

### 9.4 Availability state
Local state mirrors the server: `offline`, `online`, `on_trip`. `on_trip` is set and cleared only by the server through trip transitions; the app never toggles it. A "Stop after this trip" choice is stored locally and sends `online: false` right after the trip closes (the server-side equivalent is gap G12).

## 10. Push notifications (Expo)

### 10.1 Flow
1. Permission is requested at the permissions gate, with the reason (offers arrive as notifications).
2. Expo push token → `PUT /me/devices {platform, token}` after sign-in, on every start, and on token refresh.
3. Sign-out or account deletion → `DELETE /me/devices {token}` first.
4. Delivery needs an **Expo adapter** and **driver-facing events** in `rider-admin` (§14, gaps G1–G2).

### 10.2 Message catalogue (driver)

| Type | When | Android channel | Tap opens |
|---|---|---|---|
| `offer.created` | New ride offer | **Ride offers** — max importance, custom looping sound, bypasses Do Not Disturb where the user allows, short TTL (≈ offer lifetime) | Offer sheet (Accept / Decline also as notification actions) |
| `offer.withdrawn` | Offer taken or expired | Ride offers (silent, replaces the offer notification) | Home |
| `trip.cancelled` | Passenger or admin cancelled | Trip updates (high, sound) | Trip screen |
| `account.approved` / `account.rejected` | Application decision | Account | Home / onboarding checklist |
| `document.rejected` / `document.expiring` / `document.expired` | Review result, 30/7/1 days before expiry | Account | Document row |
| `account.suspended` / `account.reactivated` | Admin action | Account (high) | Blocked screen / Home |
| `forced_offline` | Taken offline by the server | Trip updates (high, sound) | Home with the reason |
| `payout.paid` / `payout.failed` | Payout processed | Money | Wallet |
| `support.reply` | Support answered | Support | Ticket thread |

- **Payload:** localised `title` and `body`, and `data: {type, offer_id?, trip_id?, document_id?, ticket_id?, url, expires_at?}`. No passenger phone numbers or full names in notification text.
- **Offers are time-critical:** sent with high priority and a time-to-live equal to the remaining offer time, so a late push is dropped by the push service instead of ringing for a ride that is gone. On arrival the app re-checks `expires_at` before ringing.
- **Foreground:** no system banner; the in-app offer sheet handles it.
- A push is never trusted as state — every push triggers a refetch.
- **Persistent notification (not a push):** while online, the Android foreground-service notification shows status ("Online · looking for rides" / "On a trip to {drop-off}") with **Go offline** and **SOS** actions.

### 10.3 Limits to design around
- A killed app on some Android brands will not receive pushes reliably; that is why the battery-optimisation step exists and why the app warns when it detects restrictions.
- A true full-screen incoming-call style alert over the lock screen needs a native full-screen-intent permission and a config plugin; it is listed as a post-pilot enhancement (§15, D5). v1 relies on a max-importance heads-up notification plus the foreground service keeping the app alive.

### 10.4 Credentials
FCM V1 key and APNs key live in **EAS credentials**; the Expo access token (if push security is enabled) lives only in the backend environment.

## 11. Location & maps

Location is the core of the driver app: it decides which offers a driver gets, what the passenger sees, and the final fare.

### 11.1 Tracking modes

| Driver state | Tracking | Target interval | Sent to |
|---|---|---|---|
| Offline | **None.** Tracking is fully stopped | — | — |
| Online, idle | Background-capable, balanced power | every ~10 s or 25 m | `POST /driver/location` |
| On a trip | Background-capable, high accuracy | every ~3 s or 10 m | `POST /driver/location` (the server samples the trip trail and broadcasts to the passenger at most every 3 s) |

### 11.2 Sending rules
- Points are buffered and sent in batches (≤ 20 points per request, at most one request every 2 s — the server limit). Each point: `lat`, `lng`, `heading`, `speed` (m/s), `accuracy` (m), `recorded_at` (device time corrected by the server clock offset).
- **Offline buffer:** when the network is down, points queue on the device (bounded: last 30 minutes, oldest dropped first while idle; never dropped during a trip up to a larger cap) and flush in order on reconnect. The server ignores out-of-order points for the live position.
- **Quality filter before sending:** discard fixes with accuracy worse than 100 m when a better fix is recent; never fabricate or smooth points — the server filters for fare distance itself (accuracy > 50 m and implied speed > 120 km/h are dropped there).
- **Heartbeat:** even when stationary, a point is sent at least every 30 s while online, because the server takes drivers offline after **120 s** without a location.

### 11.3 Platform requirements
- **Android:** foreground service of type *location* with a persistent notification; `ACCESS_BACKGROUND_LOCATION` requested after foreground permission with the prominent disclosure; battery-optimisation exemption requested; Play Console background-location declaration with a demo video.
- **iOS:** "Always" authorisation, background mode *location updates*, the blue status indicator left visible, clear purpose strings in English and Bengali.
- Tracking starts only on a successful go-online and stops on go-offline, sign-out, forced offline or permission loss. There is no hidden tracking.

### 11.4 Failure handling
| Situation | Behaviour |
|---|---|
| GPS signal weak | Warning banner + cue; keep sending the best available fix |
| No fix for 60 s while online | Strong warning: "You'll go offline soon" |
| Server took the driver offline (stale) | Stop tracking, warning cue, banner with **Go online again** |
| Permission downgraded to "While using" or revoked | Go offline cleanly, open the permissions gate |
| Mock-location / developer GPS detected | Reported to the backend as a fraud signal (§14, gap G13); not blocked client-side |
| App killed by the OS during a trip | Foreground service restarts tracking; on next launch the app reconciles with `GET /driver/trips/current` |

### 11.5 Maps
MapLibre with the shared style (dark and light). Markers: driver arrow with heading, pickup (mint ring), drop-off (coral square). The in-app map is for orientation; turn-by-turn is handed to Google Maps. Route preview lines need route geometry from the backend (§14, gap G14). Raw coordinates never go to analytics or Sentry.
