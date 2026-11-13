# Driver App Spec — 02 · Design system

[01 Overview & foundation](01-overview-foundation.md) · [02 Design system](02-design-system.md) · [03 Screens](03-screens.md) · [04 Integration](04-integration.md) · [05 Quality & delivery](05-quality-delivery.md)

---

## 5. Design system

Same brand as the passenger app (deep green, mint accent, rounded cards, heavy headlines), tuned for a different context: a mounted phone, sunlight, gloves, motion, and a user who looks at the screen for one second at a time.

### 5.1 Tokens (shared with the passenger app; finalise with design)

| Token | Value | Use |
|---|---|---|
| `brand.900` | `#0B3B2E` | App background (dark theme), headers |
| `brand.800` | `#124D3C` | Cards on dark |
| `accent.400` | `#6EE7B7` | Online state, primary action, accept |
| `surface.0` / `surface.50` / `surface.100` | `#FFFFFF` / `#F1F7F4` / `#E3F1EA` | Light theme surfaces |
| `text.primary` / `text.muted` | `#0E2A22` / `#5B6F68` | Light theme text |
| `danger.500` | `#E5533D` | Decline, cancel, SOS, cash owed |
| `warning.500` | `#E0A100` | Expiring documents, weak GPS, countdown under 5 s |
| `info.500` | `#3B82F6` | Navigation, neutral notices |

- **Dark theme is the default** (less glare at night, better battery on OLED); light theme available and auto-switch by time of day is offered. In sunlight the light theme has higher legibility, so the toggle is one tap from Home.
- **Contrast ≥ 7:1** for anything read while riding (status, fare, countdown, addresses); ≥ 4.5:1 elsewhere.
- **State colour is never the only signal:** Online = mint + filled dot + word "Online"; Offline = grey + hollow dot + "Offline"; On trip = blue + icon.

### 5.2 Type

- Inter (Latin) and Hind Siliguri (Bengali), tabular figures for money, distance, time and countdowns.
- Driver scale is one step larger than the passenger app: Display 40 (earnings, countdown) · Title 28 · Heading 20 · Body 17 · Caption 14.
- Addresses are shown in at most two lines, landmark first, never truncated mid-word.
- Supports system font scaling to 130% without clipping.

### 5.3 Layout rules for a mounted phone

- **Primary action in the bottom third**, full width, min height 64 dp. Secondary actions ≥ 56 dp.
- Minimum touch target 56 × 56 dp (48 in onboarding and settings).
- No swipe-only or long-press-only actions for anything essential, except deliberate slide-to-confirm.
- Maximum of three pieces of information per trip state above the fold: *who/where*, *how far/how long*, *what to do next*.
- Portrait only in v1. Safe-area aware; nothing important under the notch or the gesture bar.

### 5.4 Core components

Online toggle (large, with eligibility reasons) · Status pill · **Offer card** (earning, pickup distance/ETA, trip distance/time, pickup and drop-off labels, countdown ring) · Accept / Decline pair · **Slide-to-confirm** · Trip step header (Go to pickup → Arrived → On trip → Complete) · Passenger card (first name, masked call) · PIN keypad (4 digits, large keys) · Navigation button · Cash collection panel · Earnings stat tiles · Wallet balance card (positive / owed) · Document checklist row (missing / pending / approved / rejected / expired / expiring) · Camera frame overlay · Upload progress row · Banner (GPS weak, offline, battery saver, documents expiring) · Bottom sheet · Toast · Skeleton · Empty state · SOS button.

### 5.5 Sound, speech and haptics

| Event | Sound | Haptic | Spoken (en/bn, optional setting) |
|---|---|---|---|
| New offer | Distinct looping ringtone until answered or expired, respects alarm-style channel | Repeating strong pulse | "New ride. 2 minutes away. 85 taka." |
| Offer withdrawn / expired | Short falling tone | Single | — |
| Passenger cancelled | Alert tone | Double | "The passenger cancelled." |
| Arrived accepted | Soft chime | Light | — |
| Trip started / completed | Chime | Success | "Trip completed. Collect 190 taka." |
| GPS lost / went offline automatically | Warning tone | Warning | "You are offline. Location lost." |
| SOS sent | — | Heavy | — |

Volume follows the notification stream; an in-app setting lets the driver pick ringtone loudness and turn speech on or off. Sounds never play for marketing messages.

### 5.6 Motion

- 200 ms transitions; the offer sheet springs up from the bottom and the countdown ring drains smoothly using the server's `expires_at`.
- "Reduce motion" removes springs and map camera sweeps; the countdown remains (it is information, not decoration).
- Skeletons for content; spinners only inside working buttons.

### 5.7 Accessibility

WCAG 2.2 AA: screen-reader labels and roles, live-region announcements for offer and trip events, dynamic type, no colour-only meaning, captions for every sound cue (a visible banner accompanies each tone so deaf or hard-of-hearing drivers miss nothing), and vibration patterns distinct enough to tell an offer from a cancellation without looking.
