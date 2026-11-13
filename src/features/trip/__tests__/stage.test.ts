import { canCancelNoShow, navigationTarget, navigationUrl, nextStep } from '../stage';

const pickup = { lat: 23.8, lng: 90.4 };
const destination = { lat: 23.7, lng: 90.39 };

describe('trip stage', () => {
  it('gives one next step per status', () => {
    expect(nextStep('driver_assigned')).toBe('arriving');
    expect(nextStep('driver_arriving')).toBe('arrived');
    expect(nextStep('arrived')).toBe('start');
    expect(nextStep('in_progress')).toBe('complete');
    expect(nextStep('completed')).toBe('done');
    expect(nextStep('cancelled')).toBe('done');
  });

  it('navigates to pickup, then to drop-off', () => {
    expect(navigationTarget({ status: 'arrived', pickup, destination })).toBe(pickup);
    expect(navigationTarget({ status: 'in_progress', pickup, destination })).toBe(destination);
  });

  it('builds a maps link per platform', () => {
    expect(navigationUrl(pickup, 'android')).toBe('google.navigation:q=23.8,90.4&mode=d');
    expect(navigationUrl(pickup, 'ios')).toBe('maps://?daddr=23.8,90.4&dirflg=d');
  });

  it('allows a no-show cancel only after the wait', () => {
    const arrived = '2026-11-13T08:00:00.000Z';
    expect(canCancelNoShow(null, Date.parse(arrived) + 600_000)).toBe(false);
    expect(canCancelNoShow(arrived, Date.parse(arrived) + 299_000)).toBe(false);
    expect(canCancelNoShow(arrived, Date.parse(arrived) + 300_000)).toBe(true);
  });
});
