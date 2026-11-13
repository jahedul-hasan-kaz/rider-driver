# Driver App Spec — 05 · Quality & delivery

[01 Overview & foundation](01-overview-foundation.md) · [02 Design system](02-design-system.md) · [03 Screens](03-screens.md) · [04 Integration](04-integration.md) · [05 Quality & delivery](05-quality-delivery.md)

---

## 12. Resilience, security, quality

### 12.1 Poor connectivity (blueprint §4.3)
- Global offline bar with "last updated" times on anything live.
- Trip transitions, cash confirmation and ratings are queued with their idempotency keys and replayed in order; the driver always sees what is pending.
- Location points buffer on the device and flush on reconnect (§11.2).
- Document uploads resume automatically; captured files are kept until the server confirms.
- Timeouts: 10 s reads, 15 s writes, 8 s offer accept (an accept that cannot be confirmed in time is reported as "Couldn't confirm — checking…" and resolved by refetching the current trip, never assumed).

### 12.2 Battery, heat and data
| Budget | Target |
|---|---|
| Battery drain while online, screen on, mid-range Android | ≤ 12% per hour |
| Battery drain online, screen off | ≤ 5% per hour |
| Mobile data while online | ≤ 15 MB per hour (excluding map tiles on first load) |
| Map tiles | Cached on device; launch zone pre-cached on Wi-Fi |

A low-battery prompt appears at 15% ("Plug in to stay online") and the app dims map animations in battery-saver mode.

### 12.3 Security
- Session in encrypted storage; no secrets in the bundle (§4); no direct database access.
- Document photos: uploaded only through server-issued signed URLs, deleted from the device after upload, excluded from backups and the gallery.
- Screens showing documents, the payout account and the PIN keypad are excluded from app-switcher snapshots and screenshots (Android secure flag).
- Payout-account changes require a recent sign-in (re-verify by code if the session is older than 10 minutes).
- Deep links validated (known routes, UUID params).
- Root/jailbreak and mock-location signals are reported, not blocked.
- Sentry scrubs phone, email, tokens, licence and account numbers, coordinates and addresses.
- One active device per driver for going online: registering on a new device signs the old one out of online state (§14, gap G15).

### 12.4 Performance budgets
| Metric | Budget (mid-range Android, 3–4 GB RAM) |
|---|---|
| Cold start → Home interactive | ≤ 3 s |
| Offer event → offer on screen and ringing | ≤ 1 s foreground, ≤ 3 s from push |
| Tap → visual response | ≤ 100 ms |
| Accept → trip screen | ≤ 1.5 s on 4G |
| Animation | 60 fps, including the countdown |
| Android download size | ≤ 40 MB |
| Crash-free sessions | ≥ 99.7% (higher than the passenger app: a crash mid-trip costs money) |

### 12.5 Localisation
English and Bengali for every string, sound caption, spoken alert, push message and store listing. CI fails on missing keys. Tested at 130% font scale in Bengali.

### 12.6 Analytics (no raw location or contact data)
`onboarding_step_completed`, `document_uploaded(type)`, `application_submitted`, `permission_result(kind)`, `went_online`, `went_offline(reason)`, `forced_offline(reason)`, `offer_shown(path, seconds_left)`, `offer_accepted`, `offer_declined(reason)`, `offer_expired`, `offer_lost`, `arrived(override)`, `pin_failed`, `trip_started`, `trip_completed`, `cash_confirmed(mismatch)`, `trip_cancelled(stage, reason)`, `sos_triggered`, `location_gap(seconds)`. These feed the blueprint KPIs: driver acceptance rate, driver cancellation rate, time to match, online hours, pickup ETA accuracy.

### 12.7 Testing
| Layer | What |
|---|---|
| Unit | Trip and availability reducers, offer de-duplication and countdown with clock skew, location queue (batching, ordering, caps), money formatting, error mapping |
| Component | Offer card, slide-to-confirm, PIN keypad, checklist rows — dark/light, en/bn, 130% font |
| Integration | API client against a mocked server: idempotent retries of every transition, token refresh inside the background task, 409 on accept race, `pin_error` in a 200 |
| End-to-end (Maestro) | Onboard → submit; go online → accept → arrive (too far → override) → PIN → start → complete → cash; decline; offer timeout; passenger cancels mid-pickup; network drop during complete; kill and reopen mid-trip |
| Field tests | Real rides in the launch zone on at least five common low/mid Android models: screen off, pocket, Google Maps in front, battery saver, weak signal, 2-hour online session |
| Load pairing | Run alongside the backend's k6 scripts (`tests/load/k6/location.js`, `accept-race.js`) |

The staging demo driver account (`rider@…`) is used for automated runs; the passenger side is driven through the API or the passenger app.

## 13. Delivery milestones

| # | Milestone | Exit criteria |
|---|---|---|
| D0 | Foundation: project, EAS environments, shared tokens and primitives, API client, i18n, Sentry, CI | Dev build installs; env pulled from EAS; checks green |
| D1 | Sign-in and onboarding: details, vehicle, document capture and upload, submit, review status, rejection loop | A new driver can be approved from the admin panel end to end; rejected documents can be fixed |
| D2 | Availability and location: permissions gate, go online/offline, background tracking, forced-offline handling | 2-hour screen-off session stays online on the test devices; no location gap > 30 s |
| D3 | Offers: realtime + polling, offer sheet, accept/decline, race handling | Offer on screen ≤ 1 s; lost race handled cleanly; no double accept |
| D4 | Trip flow: pickup, arrived (override), PIN, start, complete, cancel, no-show, cash, rating, recovery after kill | End-to-end ride passes with network drops and restarts |
| D5 | Money: earnings, wallet, payout account, trips | Figures match the admin ledger to the taka |
| D6 | Push, safety, support, documents expiry, settings, account deletion | Offer push rings from background; SOS reaches the admin safety queue |
| D7 | Hardening: field tests, battery budgets, accessibility, store declarations (background location), pilot build | Budgets met; store review passed; pilot checklist signed |

D1 needs backend gap G4 (driver sign-up); D3 can start with realtime and polling, but D6 and launch need G1–G2.

## 14. Backend gaps (work needed in `rider-admin`)

Found by reading the as-built code. G1–G4 block launch.

| # | Gap | Evidence | Needed |
|---|---|---|---|
| **G1** | No Expo push adapter | `src/server/services/notify.ts` has only `log` and a generic `webhook` relay | Provider `expo`: batch send, receipts, remove `DeviceNotRegistered` tokens, per-message priority, TTL and channel |
| **G2** | No pushes to drivers | Offers and trip changes are broadcast on Realtime only; `private.enqueue_notification` is called for admins | Queue the §10.2 messages; offers must be sent **immediately** (not on the scheduled notify job) with TTL = remaining offer time |
| **G3** | Offer window is short for a push round trip | `dispatch.offer_timeout_s = 15` | Raise to 20–25 s for the pilot, or measure push latency first (setting is admin-editable) |
| **G4** | Driver sign-up is off | `supabase/config.toml`: sign-up and SMS disabled | Phone OTP with a Bangladesh SMS gateway and CAPTCHA |
| G5 | No driver trip history list | `src/app/api/v1/driver/trips/` has only `[id]` and `current` | `GET /driver/trips?cursor=` |
| G6 | Earnings are per-trip rows only | `api.driver_earnings(limit, cursor)`; the spec promised `from/to/group` with online hours | Day/week summary: gross, commission, incentives, adjustments, net, online hours, net per hour |
| G7 | No payout history | No `/driver/payouts` route | List with status and reference |
| G8 | No way to see how to settle cash owed | Wallet returns `owes_platform` only; deposits are recorded by admins | Deposit instructions and a deposit history for the driver |
| G9 | Cannot switch current vehicle from the app | `setCurrentVehicle` is an admin action only | Driver endpoint to choose among their active vehicles (while offline) |
| G10 | Driver performance not exposed | `/me` returns only onboarding status and availability | Rating, 30-day acceptance and cancellation rates |
| G11 | No explicit no-show action | Policy exists in the business-logic doc; the driver API has only `cancel {reason}` | A no-show endpoint or a reserved reason code, with the waiting time enforced server-side |
| G12 | "Go offline after this trip" | Mentioned in the business-logic doc; no API field | Flag on availability or on trip completion |
| G13 | No fraud signals intake | — | Accept `mock_location`/root flags with location batches |
| G14 | No route geometry | Offers and trips carry points and labels only | Polyline for pickup and trip legs |
| G15 | No single-device rule | `register_device` only moves a token between users | Decide and enforce one online device per driver |
| G16 | Client tunables missing from `/config` | `client_config` exposes four passenger-oriented settings | Add `offer_timeout_s`, `arrival_radius_m`, `location.stale_after_s`, `no_show_wait_min`, `payouts.minimum_amount`, required document types |
| G17 | Masked calling | Only `phone_masked` is returned to the driver | Call bridge, or reveal the passenger's number during an active trip |
| G18 | Contract drift | Spec lists `trip_cancelled` and `account_status_changed` events, `POST /driver/payout-accounts`, PIN errors as error codes; code sends `trip_status_changed`, `PUT /driver/payout-account`, and `pin_error` inside a 200 | Align spec and code; publish an OpenAPI file |

## 15. Decisions to lock

| # | Decision | Recommendation |
|---|---|---|
| D1 | App name, bundle ids, deep-link scheme | Separate store listing from the passenger app |
| D2 | Can one phone number be both passenger and driver? | The backend makes roles one-way and exclusive. Keep that for the pilot (drivers use a second number to ride) and revisit after |
| D3 | Offer timeout | 20 s for the pilot, tuned from measured push latency |
| D4 | Navigation | Hand off to Google Maps in v1; evaluate in-app turn-by-turn later |
| D5 | Lock-screen full-screen offer alert | Post-pilot, behind a config plugin; v1 uses a max-importance notification plus foreground service |
| D6 | Location intervals | 3 s on trip, 10 s idle; confirm against battery field tests |
| D7 | Contacting the passenger | Masked bridge if budget allows; otherwise reveal the number only during an active trip |
| D8 | Cash dues | How and where drivers deposit, and the balance at which going online is blocked |
| D9 | No-show rule | 5 minutes after arrival, fee per fare rule, enforced by the server |
| D10 | Minimum OS versions | Android 9+, iOS 16+ |
| D11 | Supported devices for the pilot | Publish a tested-device list and brand-specific battery guides |
