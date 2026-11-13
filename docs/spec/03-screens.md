# Driver App Spec — 03 · Screens

[01 Overview & foundation](01-overview-foundation.md) · [02 Design system](02-design-system.md) · [03 Screens](03-screens.md) · [04 Integration](04-integration.md) · [05 Quality & delivery](05-quality-delivery.md)

---

## 6. Navigation map

```
Launch ─▶ session? ──no──▶ Welcome ▶ Phone ▶ Code + name ──▶ (creates driver account)
              │yes
              ▼
        /me + /config + /driver/onboarding
              │
   onboarding_status ─ draft / rejected ──▶ Onboarding checklist ▶ Details · Vehicle · Documents ▶ Submit
              │       submitted / under_review ──▶ Review status (waiting)
              │       suspended ──▶ Account blocked (reason, what to fix, support)
              ▼ approved
       Permissions gate (location "Always", notifications, battery)
              │
   active trip? ──yes──▶ Trip screen
              │no
              ▼
            Home (Offline ⇄ Online) ──offer──▶ Offer ──accept──▶ Trip screen
                                                                    │
                     Go to pickup ▶ Arrived ▶ (PIN) Start ▶ On trip ▶ Complete ▶ Collect cash ▶ Rate ▶ Home

Menu: Earnings · Wallet & payouts · Trips · Vehicles · Documents · Safety · Support · Profile · Settings
```

A bottom bar with three destinations (**Home · Earnings · Account**) is visible only when the driver is offline or idle-online. During an offer or a trip the bar is hidden so nothing competes with the task.

## 7. Screens

Endpoints are relative to `/api/v1`.

### 7.1 Welcome, phone, code
Same pattern and components as the passenger app (welcome with language switch, `+880` phone field, 6-digit code with SMS autofill, resend countdown). Differences:

- Welcome copy speaks to earning: "Drive on your schedule. See what you earn before you accept."
- After verification: `GET /me`.
  - role `user` → ask for full name → `POST /onboarding/driver {full_name}` → role `driver`, onboarding `draft`.
  - role `driver` → continue by `onboarding_status`.
  - role `passenger` → "This number is registered as a passenger. Use a different number to drive." (roles are one-way in the backend; see §15, D2).
  - `status = suspended | deactivated` → account-blocked screen.

### 7.2 Onboarding checklist
- **Content:** progress header ("3 of 7 done"), sections **About you** (licence number, expiry, home zone), **Your vehicle**, **Documents** (one row per required type), and a sticky **Submit for review** button that enables when `can_submit` is true. A short "What happens next" note with the expected review time.
- **Data:** `GET /driver/onboarding` → `onboarding_status`, `documents[]` (each with a state), `vehicles[]` (each with its own document checklist), `missing_documents`, `has_vehicle`, `can_submit`, `rejected_reason`.
- **Row states:** missing (action: Add) · pending review · approved · **rejected** (reason shown in full, action: Re-upload) · expired · expiring soon.
- **Behaviour:** progress is saved step by step, so the driver can leave and return. Pull to refresh. `POST /driver/application/submit`; a `VALIDATION_FAILED` response lists what is still missing and the app scrolls to the first missing row.

### 7.3 Details
Licence number (5–30 characters, letters, digits and hyphens, auto upper-cased), licence expiry (date picker, must be in the future), home zone (picker from active zones). `PATCH /driver/details`. The licence number is shown masked once saved.

### 7.4 Vehicle
- **Fields:** category (from `GET /categories`), make, model, colour, registration number (3–24), year (1990–current). `POST /driver/vehicles`; edit with `PATCH /driver/vehicles/{id}` and `expected_version`.
- **Behaviour:** a clear warning before editing a verified vehicle — "Changing these details sends your vehicle back for review; you can't go online until it's approved." Duplicate registration (`ALREADY_EXISTS`) is explained inline.
- Multiple vehicles are allowed; one is the current vehicle (§14, gap G9 for switching it from the app).

### 7.5 Document capture
- **Types:** profile photo, national ID, driving licence, and per vehicle: registration, fitness certificate, tax token, insurance (route permit where applicable). The required set comes from the server, never hard-coded.
- **Capture:** camera with a frame overlay and tips ("All four corners visible, no glare"), or pick an image/PDF. Preview with **Retake / Use this**. Optional fields: document number, issue date, expiry date.
- **Upload:** compress to a readable size (long edge ~2000 px, JPEG) and keep under 10 MB; allowed types JPEG, PNG, WebP, PDF. Flow: `POST /driver/documents/upload-url` → upload the file to the signed URL with progress → `POST /driver/documents/{id}/complete`. The server re-checks type and size itself.
- **States:** uploading with percentage, paused offline (resumes automatically), failed (retry keeps the captured file), rejected by the server (wrong type/too large → plain explanation).
- **Privacy:** captured files are deleted from the device cache once the upload completes; they are never added to the photo gallery.

### 7.6 Review status
Calm waiting screen: "We're reviewing your application", submitted date, a timeline (Submitted → Under review → Approved), what the driver can do meanwhile (set up payout account, read the safety guide), and Support. Refreshes on open and on push. On **rejected**: reasons at the top, each linked to the row that needs fixing, then **Resubmit**. On **approved**: a success moment → permissions gate.

### 7.7 Permissions gate
One screen per permission, each with a plain reason **before** the OS dialog:

1. **Location — "Allow all the time".** Reasons: receive rides near you, show your position to your passenger, calculate the fare from the real route. Includes the required prominent disclosure: "This app collects location data to match you with rides and track trips **even when the app is closed or not in use, while you are online**." Android asks foreground first, then background; iOS asks While Using, then Always. Precise location is required.
2. **Notifications.** Reason: ride offers arrive as notifications when the app is not on screen.
3. **Battery optimisation (Android).** Reason: phones often stop apps in the background, which takes you offline. One tap opens the exemption dialog, with brand-specific guidance (Xiaomi, Oppo, Vivo, Realme, Samsung) when detected.

Refusals: location is mandatory to go online (recovery sheet with exact steps and **Open settings**; re-checked automatically on return). Notifications and battery can be skipped, with a persistent Home banner explaining the risk of missed offers.

### 7.8 Home — offline / online
- **Content:** map centred on the driver; top status pill (Offline / Online / reason); **Go online** button (becomes **Go offline**); today's summary tile (net earned today, trips, from `GET /driver/wallet` → `earned_today`); current vehicle chip; banners.
- **Going online:** fresh location fix → `POST /driver/availability {online: true, lat, lng, accuracy}` → start background tracking and the foreground-service notification ("You're online — sharing location"). Screen is kept awake.
- **Eligibility failures, each with a fix action:**

| Server response | Shown | Action |
|---|---|---|
| `DRIVER_NOT_APPROVED` | "Your application isn't approved yet" | Open onboarding |
| `VEHICLE_NOT_ACTIVE` | "Your vehicle isn't approved or active" | Open vehicles |
| `OUT_OF_SERVICE_AREA` | "You're outside the service area" | Show zone on map |
| `ACCOUNT_SUSPENDED` | Reason from the server | Support |
| `LOCATION_STALE` / no fix | "We can't find your location" | Retry, check GPS |

- **While online:** "Looking for rides…" with a subtle pulse, time online, and a low-key tip rotation (e.g. "Stay near main roads for faster offers"). **Go offline** is always one tap; if a trip is active it is disabled with the reason.
- **Banners (priority):** forced offline by the server (location stale, admin action, document expired) · GPS weak · no internet · battery saver on · documents expiring in ≤ 30 days · cash owed to the platform · notifications off.
- **Forced offline:** the app detects it from `/me` and from failed location posts, stops tracking, plays the warning cue and explains why.

### 7.9 Incoming offer
- **Trigger:** realtime `offer_created`, a push, or `GET /driver/offers/current` on foreground (§9).
- **Content (full-screen sheet over the map):** **you earn ৳X** (largest, from `estimated_driver_earning`), passenger fare and payment method (Cash), pickup distance and minutes, trip distance and minutes, pickup label + note, drop-off label, passenger first name, **countdown ring** driven by `expires_at`.
- **Actions:** **Accept** (large, mint) and **Decline** (smaller, with optional quick reasons: too far, ending shift, wrong direction, other). Ringtone and vibration loop until answered.
- **Behaviour:** `POST /driver/offers/{id}/accept` with one idempotency key; the button locks while sending. Success → Trip screen. `OFFER_NO_LONGER_AVAILABLE` (409) → "This ride was taken" toast, back to Home online. At zero the sheet closes by itself (no call needed; the server expires it). `offer_withdrawn` closes it immediately with the falling tone.
- **Safety:** nothing else can be tapped while an offer is showing; the countdown is the only moving element.

### 7.10 Trip screen (state-driven)

One map with a bottom panel that follows the server's trip status. A step header shows where the driver is in the flow.

| Trip status | Panel content | Primary action | Other actions |
|---|---|---|---|
| `driver_assigned` | Pickup label + note, distance, ETA, passenger first name | **Navigate to pickup** (opens maps, marks `arriving`) | Call (masked) · Cancel · SOS |
| `driver_arriving` | Same, live distance | **I've arrived** | Navigate · Call · Cancel · SOS |
| `arrived` | "Waiting for {name}", waiting timer, no-show countdown | **Slide to start trip** (PIN first when required) | Call · Cancel / No-show · SOS |
| `in_progress` | Drop-off label, distance, ETA, running time | **Slide to complete trip** | Navigate · SOS · Support. No cancel |
| `completed` | → Trip complete (§7.11) | | |
| `cancelled_by_passenger` | "The passenger cancelled", any fee credited to you | **Back online** | |
| `cancelled_by_admin` / `failed` | Reason if provided | Back online · Support | |

- **Arrived:** `POST /driver/trips/{id}/arrived`. If the server answers `TOO_FAR_FROM_PICKUP` (with `distance_m` and `radius_m`), show "You're 320 m from the pickup point" with **Keep driving** and **I'm here anyway** (sends `override: true`; the app states that overrides are logged and reviewed).
- **PIN (flag `pickup_pin`):** large 4-digit keypad "Ask the passenger for their code". `POST /driver/trips/{id}/start {pin}`. The server answers with a normal 200 that may contain `pin_error` (`PIN_REQUIRED`, `INVALID_PIN`, `PIN_LOCKED`) and `attempts_left` — the app must check for it. Wrong code → shake + attempts left; locked → "Ask the passenger to get a new code in their app".
- **Cancel:** reason is required (min 3 characters; quick reasons: passenger not responding, wrong pickup, vehicle problem, unsafe, other). The sheet warns that cancellations count toward the driver's cancellation rate. Not possible once the trip is in progress — the app offers SOS and Support instead.
- **No-show:** after the passenger waiting time (`no_show_wait_min`, default 5 min from `arrived`) the cancel sheet offers **Passenger didn't show up**, explaining the fee the driver receives (§14, gap G11).
- **Navigation hand-off:** opens Google Maps with the destination; a persistent notification and the app's own foreground service keep tracking. Returning to the app shows the current state immediately.
- **Complete:** slide → `POST /driver/trips/{id}/complete` with one idempotency key, retried until the server answers; the driver is told "Finishing your trip…" and cannot start anything else meanwhile.

### 7.11 Trip complete & cash collection
- **Content:** **Collect ৳X in cash** (largest text on the screen), fare breakdown (from the trip's `breakdown`), your earning and the platform commission, a note when the final fare differs from the estimate.
- **Actions:** **Slide: cash collected** → `POST /driver/trips/{id}/cash-collected` (no amount = full amount). **Different amount received** opens an amount field and explains that a support ticket is opened automatically for review.
- **Then:** rate the passenger (1–5, optional comment, skippable; `POST /trips/{id}/rate`) → **Back online** (or **Go offline** if the driver chose "Stop after this trip" during the ride).

### 7.12 Earnings
- **Today:** net earned (`earned_today`), trips, and — when available (§14, gap G6) — online hours and net per hour.
- **History:** per-trip rows from `GET /driver/earnings?cursor=` — time, gross fare, commission, **net**, payout status (`unpaid`, `in_payout`, `paid`, `held`). Tapping a row opens the trip detail (`GET /driver/trips/{id}`) with route labels and breakdown.
- **Honesty rule:** net is always the headline number; gross and commission are secondary. Day/week summaries and charts arrive with gap G6.

### 7.13 Wallet & payouts
- **Balance card** from `GET /driver/wallet`: positive → "The platform owes you ৳X"; negative (`owes_platform`) → "You owe ৳X from cash trips" in the danger colour with how to settle it (§14, gap G8).
- **Unpaid earnings**, **open payout** (amount + status), payout rule ("Paid weekly when your balance is at least ৳500").
- **Payout account:** method (bKash, Nagad, bank), holder name, account/wallet number → `PUT /driver/payout-account`. Shown masked afterwards with its status (pending verification / verified / rejected). Changing it requires re-verification and a recent sign-in.
- **Payout history** arrives with gap G7.

### 7.14 Trips
List of past trips (§14, gap G5; until it lands, the earnings list is the entry point) → trip detail with labels, times, fare breakdown, rating given, **Get help with this trip**.

### 7.15 Vehicles & documents
Vehicles list with status chips; add/edit as in §7.4. Documents grouped by person and by vehicle with state and expiry date; expiring (≤ 30 days) and expired documents are pinned to the top with **Renew** → capture flow. An expired required document takes the driver offline (server rule), which the screen explains.

### 7.16 Safety
- **SOS:** press and hold 2 s → `POST /trips/{id}/sos {note?}` (no idempotency key, never rate-limited, retried until sent). Confirmation with incident number, **Call 999**, and optional evidence upload (photo, audio, video via `/incidents/{id}/evidence/*`).
- SOS is available from the trip screen at every stage and from the persistent notification action.
- Safety guide: PIN, masked numbers, what to do in an accident, how to report a passenger.

### 7.17 Support
Same as the passenger app: new ticket (category, subject, message, optional trip), ticket list with status, thread and replies. Driver-specific quick topics: fare dispute, cash mismatch, passenger behaviour, payout problem, document review.

### 7.18 Profile & settings
- **Profile:** name (`PATCH /me` with `expected_version`), phone (read-only), rating average and count, acceptance and cancellation rates when exposed (§14, gap G10).
- **Settings:** language, theme (dark / light / auto), offer sound and loudness, spoken alerts, navigation app, notification categories, legal, version, **Sign out** (only when offline and not on a trip; removes the device token first), **Delete account** (`POST /me/deactivate`; refused while on a trip or while money is owed either way — the app shows which).
