import { z } from 'zod';

import type { ApiClient } from '../client';
import { money } from '../schemas';

// Driver endpoints (docs/spec/04-integration.md §8.2–8.3). Shapes follow rider-admin as built:
// api.onboard_driver, api.driver_onboarding_state, api.driver_add_vehicle, api.driver_create/complete_document,
// api.driver_set_availability, api.driver_update_locations, api.driver_current_offer (private.offer_json),
// api.get_driver_trip, the trip transitions, api.confirm_cash_collected, api.driver_wallet, api.driver_earnings.

const point = z.object({ lat: z.number(), lng: z.number(), label: z.string().nullable().optional(), note: z.string().nullable().optional() });

// ---- Onboarding -------------------------------------------------------------------------------------------------

export const DOCUMENT_STATES = ['missing', 'pending', 'approved', 'rejected', 'expired'] as const;
export const ONBOARDING_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended'] as const;

export const documentSlotSchema = z.object({
  document_type: z.string(),
  document_id: z.uuid().nullable(),
  state: z.union([z.enum(DOCUMENT_STATES), z.string()]),
  expires_at: z.string().nullable(),
  rejection_reason: z.string().nullable(),
});
export type DocumentSlot = z.infer<typeof documentSlotSchema>;

export const vehicleSchema = z.object({
  id: z.uuid(),
  category: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
  make: z.string(),
  model: z.string(),
  color: z.string(),
  registration_number: z.string(),
  year: z.number().int(),
  status: z.string(),
  suspended_reason: z.string().nullable().optional(),
  version: z.number().int(),
  documents: z.array(documentSlotSchema),
});
export type Vehicle = z.infer<typeof vehicleSchema>;

export const onboardingSchema = z.object({
  driver_id: z.uuid(),
  onboarding_status: z.union([z.enum(ONBOARDING_STATUSES), z.string()]),
  availability: z.string(),
  rejected_reason: z.string().nullable(),
  suspended_reason: z.string().nullable(),
  licence_number_masked: z.string().nullable(),
  licence_expiry: z.string().nullable(),
  current_vehicle_id: z.uuid().nullable(),
  submitted_at: z.string().nullable(),
  approved_at: z.string().nullable(),
  documents: z.array(documentSlotSchema),
  vehicles: z.array(vehicleSchema),
  missing_documents: z.array(z.string()),
  has_vehicle: z.boolean(),
  can_submit: z.boolean(),
});
export type Onboarding = z.infer<typeof onboardingSchema>;

export async function onboardDriver(api: ApiClient, fullName: string, idempotencyKey: string) {
  await api.request({
    method: 'POST',
    path: '/onboarding/driver',
    body: { full_name: fullName.trim() },
    idempotencyKey,
    schema: z.object({ id: z.uuid() }).passthrough(),
  });
}

export async function getOnboarding(api: ApiClient): Promise<Onboarding> {
  return (await api.request({ path: '/driver/onboarding', schema: onboardingSchema })).data;
}

export async function updateDetails(
  api: ApiClient,
  input: { licenceNumber?: string; licenceExpiry?: string; homeZoneId?: string },
  idempotencyKey: string,
) {
  return (
    await api.request({
      method: 'PATCH',
      path: '/driver/details',
      body: {
        ...(input.licenceNumber ? { licence_number: input.licenceNumber.trim().toUpperCase() } : {}),
        ...(input.licenceExpiry ? { licence_expiry: input.licenceExpiry } : {}),
        ...(input.homeZoneId ? { home_zone_id: input.homeZoneId } : {}),
      },
      idempotencyKey,
      schema: z.unknown(),
    })
  ).data;
}

export type VehicleInput = { categoryId: string; make: string; model: string; color: string; registrationNumber: string; year: number };

const vehicleBody = (v: VehicleInput) => ({
  category_id: v.categoryId,
  make: v.make.trim(),
  model: v.model.trim(),
  color: v.color.trim(),
  registration_number: v.registrationNumber.trim().toUpperCase(),
  year: v.year,
});

export async function addVehicle(api: ApiClient, vehicle: VehicleInput, idempotencyKey: string) {
  return (
    await api.request({
      method: 'POST',
      path: '/driver/vehicles',
      body: vehicleBody(vehicle),
      idempotencyKey,
      schema: z.object({ vehicle_id: z.uuid(), state: onboardingSchema }),
    })
  ).data;
}

export async function updateVehicle(api: ApiClient, id: string, vehicle: VehicleInput, expectedVersion: number, idempotencyKey: string) {
  return (
    await api.request({
      method: 'PATCH',
      path: `/driver/vehicles/${id}`,
      body: { ...vehicleBody(vehicle), expected_version: expectedVersion },
      idempotencyKey,
      schema: z.unknown(),
    })
  ).data;
}

export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const DOCUMENTS_BUCKET = 'driver-documents';

export const uploadSlotSchema = z.object({
  document_id: z.uuid(),
  upload_url: z.string(),
  token: z.string(),
  path: z.string(),
  content_type: z.string(),
});

export async function startDocumentUpload(
  api: ApiClient,
  input: { documentType: string; vehicleId?: string; contentType: UploadType; size: number },
  idempotencyKey: string,
) {
  return (
    await api.request({
      method: 'POST',
      path: '/driver/documents/upload-url',
      body: {
        document_type: input.documentType,
        ...(input.vehicleId ? { vehicle_id: input.vehicleId } : {}),
        content_type: input.contentType,
        size: input.size,
      },
      idempotencyKey,
      schema: uploadSlotSchema,
    })
  ).data;
}

export async function completeDocument(
  api: ApiClient,
  documentId: string,
  input: { documentNumber?: string; issuedAt?: string; expiresAt?: string },
  idempotencyKey: string,
): Promise<Onboarding> {
  return (
    await api.request({
      method: 'POST',
      path: `/driver/documents/${documentId}/complete`,
      body: {
        ...(input.documentNumber?.trim() ? { document_number: input.documentNumber.trim() } : {}),
        ...(input.issuedAt ? { issued_at: input.issuedAt } : {}),
        ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
      },
      idempotencyKey,
      schema: onboardingSchema,
    })
  ).data;
}

export async function submitApplication(api: ApiClient, idempotencyKey: string): Promise<Onboarding> {
  return (await api.request({ method: 'POST', path: '/driver/application/submit', body: {}, idempotencyKey, schema: onboardingSchema })).data;
}

// ---- Availability and location ----------------------------------------------------------------------------------

export async function setAvailability(
  api: ApiClient,
  input: { online: boolean; lat?: number; lng?: number; accuracy?: number | null },
  idempotencyKey: string,
): Promise<'online' | 'offline' | string> {
  return (
    await api.request({
      method: 'POST',
      path: '/driver/availability',
      body: {
        online: input.online,
        ...(input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng } : {}),
        ...(input.accuracy != null ? { accuracy: Math.min(10_000, Math.max(0, input.accuracy)) } : {}),
      },
      idempotencyKey,
      schema: z.object({ availability: z.string() }),
    })
  ).data.availability;
}

export type LocationPoint = { lat: number; lng: number; heading?: number | null; speed?: number | null; accuracy?: number | null; recorded_at: string };

/** Up to 20 points per call (rider-admin limit); the newest updates the live position. */
export async function sendLocations(api: ApiClient, points: LocationPoint[]): Promise<number> {
  const body = {
    points: points.slice(-20).map((p) => ({
      lat: p.lat,
      lng: p.lng,
      ...(p.heading != null && p.heading >= 0 ? { heading: Math.min(360, p.heading) } : {}),
      ...(p.speed != null && p.speed >= 0 ? { speed: Math.min(100, p.speed) } : {}),
      ...(p.accuracy != null && p.accuracy >= 0 ? { accuracy: Math.min(10_000, p.accuracy) } : {}),
      recorded_at: p.recorded_at,
    })),
  };
  return (
    await api.request({
      method: 'POST',
      path: '/driver/location',
      body,
      schema: z.object({ accepted: z.number() }),
      // Points are timestamped and the newest wins, so repeating a batch is harmless.
      retrySafe: true,
      maxAttempts: 2,
      timeoutMs: 8_000,
    })
  ).data.accepted;
}

// ---- Offers ----------------------------------------------------------------------------------------------------

export const offerSchema = z.object({
  offer_id: z.uuid(),
  request_id: z.uuid(),
  expires_at: z.string(),
  pickup_distance_m: z.number().nullable(),
  pickup_eta_s: z.number().nullable(),
  pickup: point,
  destination: point,
  distance_m: z.number().nullable(),
  duration_s: z.number().nullable(),
  estimated_fare: money,
  currency: z.literal('BDT'),
  payment_method: z.string(),
  estimated_driver_earning: money.nullable(),
  passenger_first_name: z.string().nullable(),
});
export type Offer = z.infer<typeof offerSchema>;

export async function getCurrentOffer(api: ApiClient): Promise<Offer | null> {
  return (await api.request({ path: '/driver/offers/current', schema: offerSchema.nullable() })).data;
}

export async function acceptOffer(api: ApiClient, offerId: string, idempotencyKey: string): Promise<Trip> {
  return (await api.request({ method: 'POST', path: `/driver/offers/${offerId}/accept`, body: {}, idempotencyKey, schema: tripSchema, timeoutMs: 8_000 })).data;
}

export async function rejectOffer(api: ApiClient, offerId: string, reason: string | undefined, idempotencyKey: string) {
  await api.request({
    method: 'POST',
    path: `/driver/offers/${offerId}/reject`,
    body: reason ? { reason: reason.slice(0, 200) } : {},
    idempotencyKey,
    schema: z.unknown(),
  });
}

// ---- Trips ------------------------------------------------------------------------------------------------------

export const TRIP_ACTIVE = ['driver_assigned', 'driver_arriving', 'arrived', 'in_progress'] as const;

export const tripSchema = z.object({
  id: z.uuid(),
  request_id: z.uuid(),
  status: z.string(),
  accepted_at: z.string().nullable(),
  arrived_at: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  final_fare: money.nullable(),
  estimated_fare: money,
  currency: z.literal('BDT'),
  payment_method: z.string(),
  cancellation_reason: z.string().nullable().optional(),
  pickup: point,
  destination: point,
  passenger: z.object({ first_name: z.string().nullable(), phone_masked: z.string().nullable() }),
  breakdown: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type Trip = z.infer<typeof tripSchema>;

export const isTripActive = (t: Pick<Trip, 'status'> | null | undefined) => !!t && (TRIP_ACTIVE as readonly string[]).includes(t.status);

export async function getCurrentTrip(api: ApiClient): Promise<Trip | null> {
  return (await api.request({ path: '/driver/trips/current', schema: tripSchema.nullable() })).data;
}

export async function getTrip(api: ApiClient, id: string): Promise<Trip> {
  return (await api.request({ path: `/driver/trips/${id}`, schema: tripSchema })).data;
}

export async function markArriving(api: ApiClient, id: string, idempotencyKey: string): Promise<Trip> {
  return (await api.request({ method: 'POST', path: `/driver/trips/${id}/arriving`, body: {}, idempotencyKey, schema: tripSchema })).data;
}

export async function markArrived(api: ApiClient, id: string, override: boolean, idempotencyKey: string): Promise<Trip> {
  return (
    await api.request({
      method: 'POST',
      path: `/driver/trips/${id}/arrived`,
      body: override ? { override: true } : {},
      idempotencyKey,
      schema: tripSchema,
    })
  ).data;
}

/** Starting may answer 200 with a PIN problem instead of a trip (rider-admin as built — gap G18). */
export const startResultSchema = z.union([
  z.object({ pin_error: z.enum(['PIN_REQUIRED', 'INVALID_PIN', 'PIN_LOCKED']), attempts_left: z.number() }),
  tripSchema,
]);
export type StartResult = z.infer<typeof startResultSchema>;

export async function startTrip(api: ApiClient, id: string, pin: string | undefined, idempotencyKey: string): Promise<StartResult> {
  return (
    await api.request({ method: 'POST', path: `/driver/trips/${id}/start`, body: pin ? { pin } : {}, idempotencyKey, schema: startResultSchema })
  ).data;
}

export async function completeTrip(api: ApiClient, id: string, idempotencyKey: string): Promise<Trip> {
  return (
    await api.request({ method: 'POST', path: `/driver/trips/${id}/complete`, body: {}, idempotencyKey, schema: tripSchema, maxAttempts: 6 })
  ).data;
}

export async function cancelTrip(api: ApiClient, id: string, reason: string, idempotencyKey: string): Promise<Trip> {
  return (
    await api.request({ method: 'POST', path: `/driver/trips/${id}/cancel`, body: { reason: reason.slice(0, 300) }, idempotencyKey, schema: tripSchema })
  ).data;
}

export const paymentSchema = z.object({
  id: z.uuid(),
  trip_id: z.uuid(),
  method: z.string(),
  amount: money,
  status: z.string(),
  collected_amount: money.nullable(),
});

export async function confirmCash(api: ApiClient, tripId: string, amount: string | undefined, idempotencyKey: string) {
  return (
    await api.request({
      method: 'POST',
      path: `/driver/trips/${tripId}/cash-collected`,
      body: amount !== undefined ? { amount: Number(amount) } : {},
      idempotencyKey,
      schema: paymentSchema,
    })
  ).data;
}

// ---- Money ------------------------------------------------------------------------------------------------------

export const walletSchema = z.object({
  balance: money,
  currency: z.literal('BDT'),
  owes_platform: z.boolean(),
  unpaid_earnings: money,
  earned_today: money,
  open_payout: z.object({ id: z.uuid(), amount: money, status: z.string() }).nullable(),
  payout_account: z.object({ method: z.string(), masked: z.string().nullable(), status: z.string() }).nullable(),
});
export type Wallet = z.infer<typeof walletSchema>;

export async function getWallet(api: ApiClient): Promise<Wallet> {
  return (await api.request({ path: '/driver/wallet', schema: walletSchema })).data;
}

export const earningSchema = z.object({
  id: z.uuid(),
  trip_id: z.uuid(),
  gross_fare: money,
  commission: money,
  net_earning: money,
  payout_status: z.string(),
  created_at: z.string(),
});
export type Earning = z.infer<typeof earningSchema>;

export async function listEarnings(api: ApiClient, cursor?: string | null) {
  const res = await api.request({ path: '/driver/earnings', query: { limit: 30, cursor: cursor ?? undefined }, schema: z.array(earningSchema) });
  return { rows: res.data, nextCursor: res.meta.next_cursor ?? null };
}

export const PAYOUT_METHODS = ['bkash', 'nagad', 'bank'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export async function setPayoutAccount(api: ApiClient, input: { method: PayoutMethod; holder: string; ref: string }, idempotencyKey: string): Promise<Wallet> {
  return (
    await api.request({
      method: 'PUT',
      path: '/driver/payout-account',
      body: { method: input.method, holder: input.holder.trim(), ref: input.ref.trim() },
      schema: walletSchema,
      idempotencyKey,
    })
  ).data;
}

// ---- Reference --------------------------------------------------------------------------------------------------

export const categorySchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), name_bn: z.string().nullable().optional(), passenger_capacity: z.number() });
export type Category = z.infer<typeof categorySchema>;

export async function listCategories(api: ApiClient): Promise<Category[]> {
  return (await api.request({ path: '/categories', schema: z.array(categorySchema) })).data;
}

// ---- Ratings ----------------------------------------------------------------------------------------------------

/** Drivers rate the passenger within 7 days of a completed trip (rider-admin api.rate_trip). */
export async function ratePassenger(api: ApiClient, tripId: string, score: number, comment: string | undefined, idempotencyKey: string) {
  await api.request({
    method: 'POST',
    path: `/trips/${tripId}/rate`,
    body: { score, ...(comment?.trim() ? { comment: comment.trim().slice(0, 1000) } : {}) },
    idempotencyKey,
    schema: z.object({ id: z.uuid(), trip_id: z.uuid(), score: z.number() }),
  });
}

// ---- Trip history -----------------------------------------------------------------------------------------------

export const tripSummarySchema = z.object({
  id: z.uuid(),
  status: z.string(),
  accepted_at: z.string(),
  completed_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  final_fare: money.nullable(),
  estimated_fare: money,
  currency: z.literal('BDT'),
  payment_method: z.string(),
  pickup_label: z.string().nullable(),
  destination_label: z.string().nullable(),
  net_earning: money.nullable(),
});
export type TripSummary = z.infer<typeof tripSummarySchema>;

/** Finished trips, completed and cancelled, newest first (rider-admin api.driver_trips). */
export async function listTrips(api: ApiClient, cursor?: string | null) {
  const res = await api.request({ path: '/driver/trips', query: { limit: 30, cursor: cursor ?? undefined }, schema: z.array(tripSummarySchema) });
  return { rows: res.data, nextCursor: res.meta.next_cursor ?? null };
}
