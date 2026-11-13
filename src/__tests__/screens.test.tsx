import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import type { Onboarding, Trip } from '@/api/endpoints/driver';
import { RatePassenger } from '@/features/trip/RatePassenger';
import { renderScreen } from '@/test/render';

import OnboardingScreen from '@/app/(onboarding)/onboarding';
import TripComplete from '@/app/(app)/trip-complete/[id]';

const TRIP_ID = '3f2a9c1e-8b7d-4e6f-9a1b-2c3d4e5f6a7b';
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockRouter.push(...a), replace: (...a: unknown[]) => mockRouter.replace(...a), back: () => mockRouter.back() },
  useLocalSearchParams: () => ({ id: '3f2a9c1e-8b7d-4e6f-9a1b-2c3d4e5f6a7b' }),
}));

jest.mock('@/lib/use-online', () => ({ useOnline: () => true }));
jest.mock('@/features/map/RideMap', () => ({ RideMap: () => null }));

jest.mock('@/api', () => {
  const actual = jest.requireActual('@/api/errors');
  return {
    api: () => ({}),
    intents: () => ({ run: (_intent: string, call: (key: string) => Promise<unknown>) => call('key-1') }),
    ApiError: actual.ApiError,
    isApiError: actual.isApiError,
    isApiErrorCode: actual.isApiErrorCode,
  };
});

const mockEndpoints = {
  ratePassenger: jest.fn(),
  getOnboarding: jest.fn(),
  submitApplication: jest.fn(),
  getTrip: jest.fn(),
  confirmCash: jest.fn(),
};
jest.mock('@/api/endpoints/driver', () => ({
  ...jest.requireActual('@/api/endpoints/driver'),
  ratePassenger: (...a: unknown[]) => mockEndpoints.ratePassenger(...a),
  getOnboarding: (...a: unknown[]) => mockEndpoints.getOnboarding(...a),
  submitApplication: (...a: unknown[]) => mockEndpoints.submitApplication(...a),
  getTrip: (...a: unknown[]) => mockEndpoints.getTrip(...a),
  confirmCash: (...a: unknown[]) => mockEndpoints.confirmCash(...a),
}));

beforeEach(() => jest.clearAllMocks());

const slot = (document_type: string, state: string, rejection_reason: string | null = null) => ({
  document_type,
  document_id: null,
  state,
  expires_at: null,
  rejection_reason,
});

const application = (over: Partial<Onboarding> = {}): Onboarding => ({
  driver_id: '11111111-1111-4111-8111-111111111111',
  onboarding_status: 'draft',
  availability: 'offline',
  rejected_reason: null,
  suspended_reason: null,
  licence_number_masked: null,
  licence_expiry: null,
  current_vehicle_id: null,
  submitted_at: null,
  approved_at: null,
  documents: [slot('national_id', 'missing'), slot('driving_licence', 'pending')],
  vehicles: [],
  missing_documents: ['national_id'],
  has_vehicle: false,
  can_submit: false,
  ...over,
});

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: TRIP_ID,
  request_id: '22222222-2222-4222-8222-222222222222',
  status: 'completed',
  accepted_at: null,
  arrived_at: null,
  started_at: null,
  completed_at: '2026-11-13T08:00:00.000Z',
  final_fare: '250.00',
  estimated_fare: '240.00',
  currency: 'BDT',
  payment_method: 'cash',
  pickup: { lat: 23.79, lng: 90.4, label: 'Banani 11' },
  destination: { lat: 23.75, lng: 90.39, label: 'Dhanmondi 27' },
  passenger: { first_name: 'Nadia', phone_masked: null },
  ...over,
});

describe('Application checklist', () => {
  it('lists each document with its state and keeps submit off until everything is in', async () => {
    mockEndpoints.getOnboarding.mockResolvedValue(application());
    await renderScreen(<OnboardingScreen />);
    expect(await screen.findByText('National ID (NID)')).toBeTruthy();
    expect(screen.getByText('In review')).toBeTruthy();
    expect(screen.getByText('Add your vehicle')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
  });

  it('shows why a rejected application was rejected and lets the driver resubmit', async () => {
    mockEndpoints.getOnboarding.mockResolvedValue(application({ onboarding_status: 'rejected', rejected_reason: 'Licence photo is blurry.', can_submit: true }));
    mockEndpoints.submitApplication.mockResolvedValue(application({ onboarding_status: 'submitted' }));
    await renderScreen(<OnboardingScreen />);
    expect(await screen.findByText('Licence photo is blurry.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(mockEndpoints.submitApplication).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Submitted')).toBeTruthy();
  });

  it('opens the upload screen for a missing document', async () => {
    mockEndpoints.getOnboarding.mockResolvedValue(application());
    await renderScreen(<OnboardingScreen />);
    await fireEvent.press(await screen.findByText('National ID (NID)'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/document', params: { type: 'national_id' } });
  });
});

describe('Trip complete', () => {
  it('confirms the cash collected, then offers to rate the passenger', async () => {
    mockEndpoints.getTrip.mockResolvedValue(trip());
    mockEndpoints.confirmCash.mockResolvedValue({});
    await renderScreen(<TripComplete />);
    const collect = await screen.findByRole('button', { name: 'I collected ৳250' });
    expect(screen.queryByTestId('rate-passenger')).toBeNull();
    await fireEvent.press(collect);
    await waitFor(() => expect(mockEndpoints.confirmCash).toHaveBeenCalledWith({}, TRIP_ID, undefined, 'key-1'));
    expect(await screen.findByTestId('rate-passenger')).toBeTruthy();
  });

  it('sends a different amount when the passenger paid less', async () => {
    mockEndpoints.getTrip.mockResolvedValue(trip());
    mockEndpoints.confirmCash.mockResolvedValue({});
    await renderScreen(<TripComplete />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Passenger paid a different amount' }));
    await fireEvent.changeText(screen.getByLabelText('Amount collected (৳)'), '200');
    await fireEvent.press(screen.getByRole('button', { name: 'I collected ৳200' }));
    await waitFor(() => expect(mockEndpoints.confirmCash).toHaveBeenCalledWith({}, TRIP_ID, '200', 'key-1'));
  });

  it('skips cash collection for a non-cash trip', async () => {
    mockEndpoints.getTrip.mockResolvedValue(trip({ payment_method: 'bkash' }));
    await renderScreen(<TripComplete />);
    expect(await screen.findByTestId('rate-passenger')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /I collected/ })).toBeNull();
  });
});

describe('Rate passenger', () => {
  it('sends the score and comment', async () => {
    mockEndpoints.ratePassenger.mockResolvedValue(undefined);
    await renderScreen(<RatePassenger tripId={TRIP_ID} />);
    await fireEvent.press(screen.getAllByRole('button')[1]); // second star
    await fireEvent.changeText(screen.getByLabelText('What went wrong? (optional)'), 'Kept me waiting');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit rating' }));
    await waitFor(() => expect(mockEndpoints.ratePassenger).toHaveBeenCalledWith({}, TRIP_ID, 2, 'Kept me waiting', 'key-1'));
    expect(await screen.findByText('Thanks for your rating.')).toBeTruthy();
  });

  it('treats an earlier rating of the same trip as done', async () => {
    mockEndpoints.ratePassenger.mockRejectedValue(new ApiError({ status: 409, code: 'ALREADY_EXISTS', message: 'already', requestId: 'req-1' }));
    await renderScreen(<RatePassenger tripId={TRIP_ID} />);
    await fireEvent.press(screen.getAllByRole('button')[4]);
    await fireEvent.press(screen.getByRole('button', { name: 'Submit rating' }));
    expect(await screen.findByText('Thanks for your rating.')).toBeTruthy();
  });
});
