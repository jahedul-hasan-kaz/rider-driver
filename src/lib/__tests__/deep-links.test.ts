import { pathForPush, safeAppPath } from '../deep-links';

const ID = '3f2a9c1e-8b7d-4e6f-9a1b-2c3d4e5f6a7b';

describe('safeAppPath', () => {
  it.each([
    [`riderdriver://trip/${ID}`, `/trip/${ID}`],
    [`riderdriver-dev://trip-complete/${ID}?x=1#y`, `/trip-complete/${ID}`],
    [`https://rider.example/support/${ID.toUpperCase()}`, `/support/${ID}`],
    ['riderdriver://offer', '/offer'],
    ['/wallet/', '/wallet'],
    ['/', '/'],
  ])('allows %s', (link, expected) => {
    expect(safeAppPath(link)).toBe(expected);
  });

  it.each(['riderdriver://trip/not-a-uuid', 'riderdriver://payout-account', '/(app)/home', '/dev/gallery', `/trip/${ID}/../settings`, '', null])(
    'refuses %s',
    (link) => {
      expect(safeAppPath(link)).toBeNull();
    },
  );
});

describe('pathForPush', () => {
  it('routes each driver notification type', () => {
    expect(pathForPush({ type: 'offer.created', offer_id: ID })).toBe('/offer');
    expect(pathForPush({ type: 'offer.withdrawn' })).toBe('/home');
    expect(pathForPush({ type: 'trip.cancelled', trip_id: ID })).toBe(`/trip/${ID}`);
    expect(pathForPush({ type: 'document.expiring', document_id: ID })).toBe('/onboarding');
    expect(pathForPush({ type: 'account.approved' })).toBe('/home');
    expect(pathForPush({ type: 'forced_offline' })).toBe('/home');
    expect(pathForPush({ type: 'payout.paid' })).toBe('/wallet');
    expect(pathForPush({ type: 'support.reply', ticket_id: ID })).toBe(`/support/${ID}`);
  });

  it('prefers a valid url and ignores bad ids', () => {
    expect(pathForPush({ type: 'trip.cancelled', url: `riderdriver://trip/${ID}` })).toBe(`/trip/${ID}`);
    expect(pathForPush({ type: 'trip.cancelled', trip_id: 'nope' })).toBeNull();
    expect(pathForPush(null)).toBeNull();
  });
});
